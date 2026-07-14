/**
 * MySQL REST API Client
 * Handles all HTTP communication with the MySQL (Timetrack) API
 * Uses user's access token from session instead of hardcoded credentials
 */

import type {
  MySqlApiResponse,
  MySqlBrand,
  MySqlCampaign,
  MySqlPitch,
  MySqlEmployee,
  MySqlAssignment,
  MySqlProjectDeliverable,
  MySqlCreateAssignmentRequest,
  MySqlUpdateAssignmentRequest,
  MySqlQueryParams,
  ErrorType,
  EnhancedApiError,
} from '../types/mysql';
import { MySqlApiError } from '../types/mysql';

class MySqlApiClient {
  private baseUrl: string;
  private readonly REQUEST_TIMEOUT = 10000; // 10 seconds (reduced from 30s)
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAYS = [500, 1500, 4000]; // Exponential backoff in ms
  private pendingRequests = new Map<string, Promise<any>>();
  private getToken: () => Promise<string>; // Function to get token from session

  constructor(getTokenFn: () => Promise<string>) {
    this.baseUrl = process.env.TIMETRACK_API_URL || 'http://127.0.0.1:8000/api/v1';
    this.getToken = getTokenFn;
  }

  /**
   * Check if logging should be enabled (development only)
   */
  private shouldLog(): boolean {
    return process.env.NODE_ENV === 'development';
  }

  /**
   * Create a unique key for request deduplication
   */
  private createRequestKey(endpoint: string, params?: MySqlQueryParams): string {
    return `${endpoint}-${JSON.stringify(params || {})}`;
  }

  /**
   * Classify error type for better handling
   */
  private classifyError(error: unknown): ErrorType {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return 'network';
    }
    if (error instanceof Error && error.name === 'AbortError') {
      return 'timeout';
    }
    if (error instanceof MySqlApiError && error.statusCode === 401) {
      return 'auth';
    }
    if (error instanceof SyntaxError) {
      return 'parse';
    }
    return 'unknown';
  }

  /**
   * Create timeout promise that aborts the request
   */
  private createTimeoutController(abortController: AbortController): NodeJS.Timeout {
    return setTimeout(() => {
      abortController.abort();
    }, this.REQUEST_TIMEOUT);
  }

  /**
   * Wait for specified delay (for retry backoff)
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: unknown, errorType: ErrorType): boolean {
    // Retry on network errors, timeouts, and 5xx server errors
    if (errorType === 'network' || errorType === 'timeout') {
      return true;
    }
    if (error instanceof MySqlApiError && error.statusCode >= 500) {
      return true;
    }
    // Don't retry on 4xx client errors (except 429 too many requests)
    if (error instanceof MySqlApiError && error.statusCode >= 400 && error.statusCode < 500 && error.statusCode !== 429) {
      return false;
    }
    return false;
  }

  /**
   * Make authenticated API request with timeout, retry, and enhanced error handling
   */
  private async request<T>(
    endpoint: string,
    params?: MySqlQueryParams,
  ): Promise<MySqlApiResponse<T>> {
    const requestKey = this.createRequestKey(endpoint, params);

    // Check if identical request is pending (deduplication)
    if (this.pendingRequests.has(requestKey)) {
      if (this.shouldLog()) {
        console.log(`[MySqlApiClient] Deduplicating request:`, { endpoint, params });
      }
      return this.pendingRequests.get(requestKey) as Promise<MySqlApiResponse<T>>;
    }

    // Create new request promise
    const requestPromise = this.executeRequest<T>(endpoint, params);
    this.pendingRequests.set(requestKey, requestPromise);

    // Clean up after request completes
    requestPromise.finally(() => {
      this.pendingRequests.delete(requestKey);
    });

    return requestPromise;
  }

  /**
   * Execute the actual HTTP request with retry logic
   */
  private async executeRequest<T>(
    endpoint: string,
    params?: MySqlQueryParams,
  ): Promise<MySqlApiResponse<T>> {
    let lastError: unknown;
    let lastErrorType: ErrorType = 'unknown';

    // Get token from session
    const token = await this.getToken();

    // Build URL with query parameters
    const buildUrl = (): URL => {
      const url = new URL(`${this.baseUrl}${endpoint}`);
      if (params) {
        if (params.page) url.searchParams.set('page', String(params.page));
        if (params.per_page) url.searchParams.set('per_page', String(params.per_page));
        if (params.search) url.searchParams.set('search', params.search);
        if (params.include) url.searchParams.set('include', params.include);
        if (params.brand_id) url.searchParams.set('brand_id', params.brand_id);
        if (params.employee_uuid) url.searchParams.set('employee_uuid', params.employee_uuid);
        if (params.project_uuid) url.searchParams.set('project_uuid', params.project_uuid);
        if (params.start_date) url.searchParams.set('start_date', params.start_date);
        if (params.end_date) url.searchParams.set('end_date', params.end_date);
      }
      return url;
    };

    // Retry loop with exponential backoff
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const url = buildUrl();

        if (this.shouldLog()) {
          console.log(`[MySqlApiClient] Request (attempt ${attempt}/${this.MAX_RETRIES}):`, {
            endpoint,
            fullUrl: url.toString(),
            hasToken: !!token,
            tokenPreview: token ? `${token.substring(0, 10)}...` : 'none',
          });
        }

        // Set up timeout
        const controller = new AbortController();
        const timeoutId = this.createTimeoutController(controller);

        try {
          // Make request with Bearer token and timeout signal
          const response = await fetch(url.toString(), {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            signal: controller.signal,
            cache: 'no-store',
          });

          // Clear timeout on successful response
          clearTimeout(timeoutId);

          if (this.shouldLog()) {
            console.log('[MySqlApiClient] Response:', {
              endpoint,
              status: response.status,
              statusText: response.statusText,
              ok: response.ok,
            });
          }

          if (!response.ok) {
            // Handle 401 - token expired, let caller handle redirect to login
            throw new MySqlApiError(`API Error: ${response.statusText}`, response.status);
          }

          // Get raw response as text first for better error logging
          const responseText = await response.text();
          const contentType = response.headers.get('content-type');

          if (this.shouldLog()) {
            console.log('[MySqlApiClient] Raw response:', {
              endpoint,
              status: response.status,
              contentType,
              contentLength: responseText.length,
              responsePreview: responseText.substring(0, 500),
            });
          }

          // Try to parse JSON
          let data;
          try {
            data = JSON.parse(responseText);
          } catch (parseError) {
            if (this.shouldLog()) {
              console.error('[MySqlApiClient] JSON parse failed:', {
                endpoint,
                parseError: parseError instanceof Error ? parseError.message : parseError,
                contentType,
                responsePreview: responseText.substring(0, 500),
              });
            }
            throw new MySqlApiError(
              `Invalid JSON response from ${endpoint}: ${responseText.substring(0, 100)}`,
              response.status
            );
          }

          if (this.shouldLog()) {
            console.log('[MySqlApiClient] Response data preview:', JSON.stringify(data).substring(0, 500));
          }

          // Success! Return the data
          return data;
        } catch (fetchError) {
          // Clear timeout if still active
          clearTimeout(timeoutId);

          // Classify the error
          const errorType = this.classifyError(fetchError);
          lastError = fetchError;
          lastErrorType = errorType;

          if (this.shouldLog()) {
            console.error(`[MySqlApiClient] Attempt ${attempt} failed:`, {
              endpoint,
              errorType,
              error: fetchError instanceof Error ? fetchError.message : fetchError,
            });
          }

          // Check if we should retry
          if (attempt < this.MAX_RETRIES && this.isRetryableError(fetchError, errorType)) {
            const retryDelay = this.RETRY_DELAYS[attempt - 1];
            if (this.shouldLog()) {
              console.log(`[MySqlApiClient] Retrying in ${retryDelay}ms...`);
            }
            await this.delay(retryDelay);
            continue;
          }

          // Not retryable or out of retries - throw the error
          throw fetchError;
        }
      } catch (error) {
        // This is our final attempt or non-retryable error
        const errorType = this.classifyError(error);
        lastError = error;
        lastErrorType = errorType;

        if (this.shouldLog()) {
          console.error('[MySqlApiClient] Request failed after all retries:', {
            endpoint,
            baseUrl: this.baseUrl,
            errorType,
            attempt,
            error: error instanceof Error ? error.message : error,
            stack: error instanceof Error ? error.stack : undefined,
          });
        }

        // Return structured error response instead of crashing
        const enhancedError: EnhancedApiError = {
          message: error instanceof Error ? error.message : 'Unknown error',
          type: errorType,
          originalError: error,
        };

        return {
          status: 500,
          success: false,
          message: `Request failed: ${enhancedError.message}`,
          error: enhancedError,
          data: [] as T,
        };
      }
    }

    // Should never reach here, but TypeScript needs it
    return {
      status: 500,
      success: false,
      message: 'Request failed: Maximum retries exceeded',
      error: {
        message: 'Maximum retries exceeded',
        type: 'unknown',
        originalError: lastError,
      },
      data: [] as T,
    };
  }

  /**
   * Get brands with pagination
   */
  getBrands(params?: MySqlQueryParams): Promise<MySqlApiResponse<any>> {
    return this.request<any>('/brands', params);
  }

  /**
   * Get campaigns (projects) with pagination
   */
  getCampaigns(params?: MySqlQueryParams): Promise<MySqlApiResponse<any>> {
    return this.request<any>('/campaigns', params);
  }

  /**
   * Get pitches with pagination
   */
  async getPitches(params?: MySqlQueryParams): Promise<MySqlApiResponse<any>> {
    if (this.shouldLog()) {
      console.log('[MySqlApiClient] getPitches called with params:', params);
    }
    const result = await this.request<any>('/pitches', params);
    if (this.shouldLog()) {
      console.log('[MySqlApiClient] getPitches result:', JSON.stringify(result, null, 2));
    }
    return result;
  }

  /**
   * Get employees with pagination
   */
  getEmployees(params?: MySqlQueryParams): Promise<MySqlApiResponse<any>> {
    return this.request<any>('/employees', params);
  }

  /**
   * Get departments with pagination
   */
  getDepartments(params?: MySqlQueryParams): Promise<MySqlApiResponse<any>> {
    return this.request<any>('/departments', params);
  }

  /**
   * Get deliverables with pagination
   */
  getDeliverables(params?: MySqlQueryParams): Promise<MySqlApiResponse<any>> {
    return this.request<any>('/deliverables', params);
  }

  /**
   * Get deliverables for a single campaign or pitch
   */
  getProjectDeliverables(
    type: "campaigns" | "pitches",
    id: string,
  ): Promise<MySqlApiResponse<MySqlProjectDeliverable[]>> {
    return this.request<MySqlProjectDeliverable[]>(`/${type}/${id}/deliverables`);
  }

  /**
   * Get single brand by UUID
   */
  getBrand(uuid: string): Promise<MySqlApiResponse<MySqlBrand>> {
    return this.request<MySqlBrand>(`/brands/${uuid}`);
  }

  /**
   * Get single campaign by UUID
   */
  getCampaign(uuid: string): Promise<MySqlApiResponse<MySqlCampaign>> {
    return this.request<MySqlCampaign>(`/campaigns/${uuid}`);
  }

  /**
   * Get single pitch by UUID
   */
  getPitch(uuid: string): Promise<MySqlApiResponse<MySqlPitch>> {
    return this.request<MySqlPitch>(`/pitches/${uuid}`);
  }

  /**
   * Get single employee by UUID
   * Note: include parameter may cause 500 error on single endpoint
   */
  getEmployee(uuid: string): Promise<MySqlApiResponse<MySqlEmployee>> {
    return this.request<MySqlEmployee>(`/employees/${uuid}`);
  }

  /**
   * Make authenticated POST/PUT/DELETE request with timeout, retry, and enhanced error handling
   */
  private async requestWithBody<T>(
    method: 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    data?: unknown,
    params?: MySqlQueryParams,
  ): Promise<MySqlApiResponse<T>> {
    let lastError: unknown;
    let lastErrorType: ErrorType = 'unknown';

    // Get token from session
    const token = await this.getToken();

    // Build URL with query parameters
    const buildUrl = (): URL => {
      const url = new URL(`${this.baseUrl}${endpoint}`);
      if (params) {
        if (params.page) url.searchParams.set('page', String(params.page));
        if (params.per_page) url.searchParams.set('per_page', String(params.per_page));
        if (params.search) url.searchParams.set('search', params.search);
        if (params.include) url.searchParams.set('include', params.include);
        if (params.brand_id) url.searchParams.set('brand_id', params.brand_id);
        if (params.employee_uuid) url.searchParams.set('employee_uuid', params.employee_uuid);
        if (params.project_uuid) url.searchParams.set('project_uuid', params.project_uuid);
        if (params.start_date) url.searchParams.set('start_date', params.start_date);
        if (params.end_date) url.searchParams.set('end_date', params.end_date);
      }
      return url;
    };

    // Retry loop with exponential backoff
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const url = buildUrl();

        if (this.shouldLog()) {
          console.log(`[MySqlApiClient] ${method} Request (attempt ${attempt}/${this.MAX_RETRIES}):`, {
            endpoint,
            fullUrl: url.toString(),
            hasToken: !!token,
            hasBody: !!data,
            bodyPreview: data ? JSON.stringify(data).substring(0, 200) : 'none',
          });
        }

        // Set up timeout
        const controller = new AbortController();
        const timeoutId = this.createTimeoutController(controller);

        try {
          // Prepare request options
          const options: RequestInit = {
            method,
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            signal: controller.signal,
            cache: 'no-store',
          };

          // Add body for POST and PUT requests
          if (method !== 'DELETE' && data) {
            options.body = JSON.stringify(data);
          }

          // Make request
          const response = await fetch(url.toString(), options);

          // Clear timeout on successful response
          clearTimeout(timeoutId);

          if (this.shouldLog()) {
            console.log(`[MySqlApiClient] ${method} Response:`, {
              endpoint,
              status: response.status,
              statusText: response.statusText,
              ok: response.ok,
            });
          }

          if (!response.ok) {
            // Handle 401 - token expired, let caller handle redirect to login
            throw new MySqlApiError(`API Error: ${response.statusText}`, response.status);
          }

          // Get raw response as text first for better error logging
          const responseText = await response.text();
          const contentType = response.headers.get('content-type');

          if (this.shouldLog()) {
            console.log('[MySqlApiClient] Raw response:', {
              endpoint,
              status: response.status,
              contentType,
              contentLength: responseText.length,
              responsePreview: responseText.substring(0, 500),
            });
          }

          // Try to parse JSON
          let responseData;
          try {
            responseData = JSON.parse(responseText);
          } catch (parseError) {
            if (this.shouldLog()) {
              console.error('[MySqlApiClient] JSON parse failed:', {
                endpoint,
                parseError: parseError instanceof Error ? parseError.message : parseError,
                contentType,
                responsePreview: responseText.substring(0, 500),
              });
            }
            throw new MySqlApiError(
              `Invalid JSON response from ${endpoint}: ${responseText.substring(0, 100)}`,
              response.status
            );
          }

          if (this.shouldLog()) {
            console.log('[MySqlApiClient] Response data preview:', JSON.stringify(responseData).substring(0, 500));
          }

          // Success! Return the data
          return responseData;
        } catch (fetchError) {
          // Clear timeout if still active
          clearTimeout(timeoutId);

          // Classify the error
          const errorType = this.classifyError(fetchError);
          lastError = fetchError;
          lastErrorType = errorType;

          if (this.shouldLog()) {
            console.error(`[MySqlApiClient] Attempt ${attempt} failed:`, {
              endpoint,
              errorType,
              error: fetchError instanceof Error ? fetchError.message : fetchError,
            });
          }

          // Check if we should retry
          if (attempt < this.MAX_RETRIES && this.isRetryableError(fetchError, errorType)) {
            const retryDelay = this.RETRY_DELAYS[attempt - 1];
            if (this.shouldLog()) {
              console.log(`[MySqlApiClient] Retrying in ${retryDelay}ms...`);
            }
            await this.delay(retryDelay);
            continue;
          }

          // Not retryable or out of retries - throw the error
          throw fetchError;
        }
      } catch (error) {
        // This is our final attempt or non-retryable error
        const errorType = this.classifyError(error);
        lastError = error;
        lastErrorType = errorType;

        if (this.shouldLog()) {
          console.error('[MySqlApiClient] Request failed after all retries:', {
            endpoint,
            baseUrl: this.baseUrl,
            errorType,
            attempt,
            error: error instanceof Error ? error.message : error,
            stack: error instanceof Error ? error.stack : undefined,
          });
        }

        // Return structured error response instead of crashing
        const enhancedError: EnhancedApiError = {
          message: error instanceof Error ? error.message : 'Unknown error',
          type: errorType,
          originalError: error,
        };

        return {
          status: 500,
          success: false,
          message: `Request failed: ${enhancedError.message}`,
          error: enhancedError,
          data: null as T,
        };
      }
    }

    // Should never reach here, but TypeScript needs it
    return {
      status: 500,
      success: false,
      message: 'Request failed: Maximum retries exceeded',
      error: {
        message: 'Maximum retries exceeded',
        type: 'unknown',
        originalError: lastError,
      },
      data: null as T,
    };
  }

  /**
   * Get assignments with optional filtering
   */
  async getAssignments(params?: {
    employee_uuid?: string;
    project_uuid?: string;
    start_date?: string;
    end_date?: string;
  }): Promise<MySqlApiResponse<MySqlAssignment[]>> {
    const queryParams: MySqlQueryParams = {};
    if (params?.employee_uuid) {
      queryParams.employee_uuid = params.employee_uuid;
    }
    if (params?.project_uuid) {
      queryParams.project_uuid = params.project_uuid;
    }
    if (params?.start_date) {
      queryParams.start_date = params.start_date;
    }
    if (params?.end_date) {
      queryParams.end_date = params.end_date;
    }
    return this.request<MySqlAssignment[]>('/assignments', queryParams);
  }

  /**
   * Get single assignment by UUID
   */
  async getAssignment(uuid: string): Promise<MySqlApiResponse<MySqlAssignment>> {
    return this.request<MySqlAssignment>(`/assignments/${uuid}`);
  }

  /**
   * Create a new assignment
   */
  async createAssignment(data: MySqlCreateAssignmentRequest): Promise<MySqlApiResponse<MySqlAssignment>> {
    return this.requestWithBody<MySqlAssignment>('POST', '/assignments', data);
  }

  /**
   * Update an existing assignment
   */
  async updateAssignment(uuid: string, data: MySqlUpdateAssignmentRequest): Promise<MySqlApiResponse<MySqlAssignment>> {
    return this.requestWithBody<MySqlAssignment>('PUT', `/assignments/${uuid}`, data);
  }

  /**
   * Delete an assignment
   */
  async deleteAssignment(uuid: string): Promise<MySqlApiResponse<void>> {
    return this.requestWithBody<void>('DELETE', `/assignments/${uuid}`);
  }
}

// Singleton instance with token function
let apiClientInstance: MySqlApiClient | null = null;
let currentTokenFn: (() => Promise<string>) | null = null;

/**
 * Initialize or get the MySQL API client with token function
 * Call this from API routes with the session token function
 */
export function getMySqlApiClient(tokenFn?: () => Promise<string>): MySqlApiClient {
  // If tokenFn is provided, (re)initialize the client
  if (tokenFn) {
    apiClientInstance = new MySqlApiClient(tokenFn);
    currentTokenFn = tokenFn;
  }

  // Return existing instance or create a dummy one (will fail without token)
  if (!apiClientInstance) {
    throw new Error('MySqlApiClient not initialized. Call getMySqlApiClient(tokenFn) first.');
  }

  return apiClientInstance;
}

/**
 * Create a new MySqlApiClient instance with a token function
 * Use this for creating scoped clients
 */
export function createMySqlApiClient(tokenFn: () => Promise<string>): MySqlApiClient {
  return new MySqlApiClient(tokenFn);
}

// Re-export error type for convenience
export { MySqlApiError } from '../types/mysql';
