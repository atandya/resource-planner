/**
 * RBAC configuration — single source of truth for full-access rules.
 *
 * Timetrack does not expose a role/level field, so access is derived from:
 *  - an explicit NIK allowlist (specific people granted full access), and
 *  - department membership by numeric dept_id (NOT name — names get renamed).
 *
 * `dept_id` and `nik` both come directly from the login profile, so this
 * decision does NOT depend on the failure-prone department-name lookup.
 */

// Specific employees granted full access by NIK.
// Timetrack `nik` === planner_employee.source_employee_id.
export const FULL_ACCESS_NIKS = [
  'L-386', // Fauza Istighfareva
  'L-096', // Marlina Lim
  'L-234', // Dylan Setiawan
  'L-294', // Ratna Juwita Kartika Sari
  'L-007', // Herni Veryany Wijaya
  'L-162', // Abdul Gofur
  'L-389', // Helmi Febri Nandani
  'L-357', // Brama Danuwinata
  'L-427', // Arinda Shabrina
  'L-410', // Dolorosa Raras Cindewangi
  'L-428', // Cut Trieara Nantina A
];

// Departments whose members ALL get full access (matched by dept_id).
export const FULL_ACCESS_DEPARTMENT_IDS = [
  1,  // Business Consulting
  2,  // Creative Account Strategy (now Brand Manager)
  4,  // Performance Marketing
  5,  // Media Account Management (now Brand Manager)
  10, // Management
];

// Creative department: full access ONLY for the Project Manager position.
export const CREATIVE_DEPARTMENT_ID = 7;
export const CREATIVE_FULL_ACCESS_POSITION = 'Project Manager';

function normalizeNik(nik: string): string {
  return nik.trim().toUpperCase();
}

function normalizePosition(position: string): string {
  return position.trim().toLowerCase();
}

// Pre-normalized allowlist for drift-tolerant O(1) lookups.
const FULL_ACCESS_NIK_SET = new Set(FULL_ACCESS_NIKS.map(normalizeNik));

export interface AccessLevelInput {
  nik?: string | null;
  dept_id?: number | null;
  position?: string | null;
}

/**
 * Determine access level from employee nik, department id, and position.
 *
 * Full access if ANY of:
 *  1. nik is on FULL_ACCESS_NIKS
 *  2. dept_id is in FULL_ACCESS_DEPARTMENT_IDS
 *  3. dept_id === CREATIVE_DEPARTMENT_ID and position === Project Manager
 * Otherwise restricted.
 */
export function determineAccessLevel(employee: AccessLevelInput): 'full' | 'restricted' {
  const nik = employee.nik ?? '';
  const deptId = employee.dept_id ?? null;
  const position = employee.position ?? '';

  // Rule 1: explicit NIK allowlist (department-independent).
  if (nik && FULL_ACCESS_NIK_SET.has(normalizeNik(nik))) {
    console.log('[Access Level] Full access granted via NIK allowlist:', nik);
    return 'full';
  }

  // Rule 2: full-access departments.
  if (deptId !== null && FULL_ACCESS_DEPARTMENT_IDS.includes(deptId)) {
    console.log('[Access Level] Full access granted for department id:', deptId);
    return 'full';
  }

  // Rule 3: Creative department, Project Manager position only.
  if (
    deptId === CREATIVE_DEPARTMENT_ID &&
    normalizePosition(position) === normalizePosition(CREATIVE_FULL_ACCESS_POSITION)
  ) {
    console.log('[Access Level] Full access granted for Creative Project Manager');
    return 'full';
  }

  console.log(
    '[Access Level] Restricted access. dept_id:', deptId,
    'position:', position,
    'nik:', nik
  );
  return 'restricted';
}

/**
 * Check if user can view all data
 */
export function canViewAll(accessLevel: string): boolean {
  return accessLevel === 'full';
}

/**
 * Check if user can only view their own data
 */
export function canViewOwnOnly(accessLevel: string): boolean {
  return accessLevel === 'restricted';
}

/**
 * Get a filter for queries based on access level
 *
 * @param accessLevel - The user's access level
 * @param employeeId - The user's employee ID (for restricted access)
 * @returns Object with filter conditions
 */
export function getAccessFilter(accessLevel: string, employeeId?: number) {
  if (accessLevel === 'full') {
    return {}; // No filtering for full access
  }

  if (employeeId) {
    return { employee_id: employeeId };
  }

  return {};
}
