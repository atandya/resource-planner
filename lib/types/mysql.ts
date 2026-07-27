// MySQL REST API Types
// Based on API documentation from http://localhost/api/v1

// ============ ERROR TYPES ============

export type ErrorType = 'network' | 'timeout' | 'auth' | 'parse' | 'unknown';

export interface EnhancedApiError {
  message: string;
  type: ErrorType;
  originalError?: unknown;
}

// ============ API RESPONSE WRAPPER ============

export interface MySqlApiResponse<T> {
  status: number;
  success: boolean;
  message: string;
  data: T;
  meta?: MySqlPaginationMeta;
  error?: EnhancedApiError;
}

export interface MySqlPaginationMeta {
  current_page: number;
  per_page: number;
  total: number;
  last_page: number;
}

// ============ BRAND ENTITY ============

export interface MySqlBrand {
  id?: number; // Some endpoints return `id`
  brand_id?: number; // Timetrack list endpoints return `brand_id`
  uuid: string;
  company_name: string;
  client_code: string | number;
  brand_name: string;
  brand_address: string;
  pic_brand_name: string;
  pic_email: string;
  brand_website: string;
  pic_title: string;
  pic_brand_phone: string;
  pic_finance_name: string;
  pic_finance_phone: string | null;
  industry_category: string;
  description: string;
  logo: string;
  flag: 'active' | 'inactive';
  // Explicit archive flag from the restricted read API (preferred over flag when present)
  is_active?: boolean;
  tax_account: string;
  top: string | null;
  created_at: string;
  updated_at: string;
}

// ============ CAMPAIGN ENTITY ============

export interface MySqlCampaign {
  uuid: string;
  io_number: string;
  campaign_name: string;
  brand_id: number;
  // Explicit brand uuid from the restricted read API (preferred over nested brand.uuid when present)
  brand_uuid?: string;
  company_id: number;
  currency: string;
  budget: number;
  asf: number;
  grand_total: number;
  start_date: string;
  end_date: string;
  notes: string;
  io_file: string;
  state: 'draft' | 'publish' | 'archive';
  flag: 'active' | 'inactive';
  // Explicit archive flag from the restricted read API (preferred over flag/state when present)
  is_active?: boolean;
  quotation_reference: string;
  created_at: string;
  updated_at: string;
  // Relations
  brand?: {
    uuid: string;
    brand_name: string;
    company_name: string;
  };
  company?: {
    id: number;
    company_name: string;
  };
  channels?: Array<{
    id: number;
    channel_name: string;
  }>;
}

// ============ PITCH ENTITY ============

export interface MySqlPitch {
  uuid: string;
  pitch_number: string;
  pitch_name: string;
  brand_id: number;
  // Explicit brand uuid from the restricted read API (preferred over nested brand.uuid when present)
  brand_uuid?: string;
  region: 'ID' | 'SG' | null;
  date_submit: string | null;
  status: 'on_going' | 'win' | 'loss' | null;
  // Explicit archive flag from the restricted read API (preferred over status when present)
  is_active?: boolean;
  budget: number;
  value_total: number;
  currency: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Relations
  brand?: {
    uuid: string;
    brand_name: string;
    company_name: string;
  };
  author?: {
    uuid: string;
    full_name: string;
  };
  channels?: Array<{
    id: number;
    channel_id: number;
    deliverable_id: number;
    channel_class?: any;
    deliverable?: any;
  }>;
}

export interface MySqlProjectDeliverableChannel {
  id: number | string;
  channel_name: string | null;
  channel_name_new: string | null;
}

export interface MySqlProjectDeliverable {
  id: number | string;
  channel_id: number | string | null;
  deliverable_name: string | null;
  deliverable_name_new: string | null;
  flag: string | null;
  channel?: MySqlProjectDeliverableChannel | null;
}

// ============ EMPLOYEE ENTITY ============

export interface MySqlEmployee {
  uuid: string;
  nik: string;
  full_name: string;
  nickname: string;
  position: string;
  dept_id: number;
  direct_supervisor: number;
  gender: 'MALE' | 'FEMALE';
  group_timeoff_category: number;
  work_start_date: string;
  dob: string;
  photo: string;
  flag: 'active' | 'inactive';
  status: 'visible' | 'invisible';
  created_at: string;
  updated_at: string;
  // Relations
  department?: {
    id: number;
    nik: string;
    department_name: string;
  };
  supervisor?: {
    uuid: string;
    full_name: string;
    position: string;
  };
  balance?: {
    annual_leave: number;
    sick_leave: number;
    total_balance: number;
  };
}

// ============ ASSIGNMENT ENTITY ============

export interface MySqlAssignment {
  uuid: string;
  employee_uuid: string;
  project_uuid: string | null;
  task_uuid: string | null;
  start_date: string;
  end_date: string;
  hours_per_day: string;
  allocation_percentage: string | null;
  is_time_off: boolean;
  time_off_type_uuid: string | null;
  category: string | null;
  is_billable: boolean;
  status: 'draft' | 'confirmed' | 'completed';
  note: string | null;
  created_by_uuid: string | null;
  created_at: string;
  updated_at: string;
  // Relations
  employee?: {
    uuid: string;
    full_name: string;
    position: string;
    department?: {
      id: number;
      department_name: string;
    };
  };
  project?: {
    uuid: string;
    name: string;
    color: string;
    brand?: {
      uuid: string;
      brand_name: string;
      company_name: string;
    };
  };
  created_by?: {
    uuid: string;
    full_name: string;
  };
}

export interface MySqlCreateAssignmentRequest {
  employee_uuid: string;
  project_uuid: string | null;
  task_uuid?: string | null;
  start_date: string;
  end_date: string;
  hours_per_day: string;
  allocation_percentage?: string | null;
  is_time_off?: boolean;
  time_off_type_uuid?: string | null;
  category?: string | null;
  is_billable?: boolean;
  status?: 'draft' | 'confirmed' | 'completed';
  note?: string | null;
  created_by_uuid?: string | null;
}

export interface MySqlUpdateAssignmentRequest {
  employee_uuid?: string;
  project_uuid?: string | null;
  task_uuid?: string | null;
  start_date?: string;
  end_date?: string;
  hours_per_day?: string;
  allocation_percentage?: string | null;
  is_time_off?: boolean;
  time_off_type_uuid?: string | null;
  category?: string | null;
  is_billable?: boolean;
  status?: 'draft' | 'confirmed' | 'completed';
  note?: string | null;
}

// ============ QUERY PARAMETERS ============

export interface MySqlQueryParams {
  page?: number;
  per_page?: number;
  search?: string;
  include?: string;
  brand_id?: string;
  employee_uuid?: string;
  project_uuid?: string;
  start_date?: string;
  end_date?: string;
}

// ============ ERROR TYPES ============

export class MySqlApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = 'MySqlApiError';
  }
}

export class MySqlAuthError extends MySqlApiError {
  constructor(message: string = 'MySQL API authentication failed') {
    super(message, 401);
    this.name = 'MySqlAuthError';
  }
}
