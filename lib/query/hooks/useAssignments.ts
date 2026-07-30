import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../queryKeys";
import { invalidatePlannerData } from "@/lib/query/invalidatePlannerData";

// Types
export interface MonthlyAllocation {
  month: string;
  plannedHours: number;
  kind: "plan" | "adjustment";
}

export interface Assignment {
  id: string;            // assignment_uuid
  employeeId: string;    // employee_uuid
  projectKey: string;    // project_key
  startDate: string;
  endDate: string;
  status: "draft" | "confirmed";
  note: string | null;
  allocations: MonthlyAllocation[];
  createdBy: string | null;
  updatedBy: string | null;
}

// Raw shapes returned by /api/assignments
interface RawEngagement {
  assignment_uuid: string;
  employee_uuid: string;
  project_key: string;
  start_date: string;
  end_date: string;
  status: "draft" | "confirmed";
  note: string | null;
  created_by: string | null;
  updated_by: string | null;
}

interface RawAllocation {
  assignment_uuid: string;
  month: string;
  planned_hours: number;
  kind: "plan" | "adjustment";
}

function stitchAssignments(engagements: RawEngagement[], allocations: RawAllocation[]): Assignment[] {
  const allocationsByUuid = new Map<string, MonthlyAllocation[]>();
  for (const alloc of allocations) {
    const list = allocationsByUuid.get(alloc.assignment_uuid) ?? [];
    list.push({ month: alloc.month, plannedHours: Number(alloc.planned_hours), kind: alloc.kind });
    allocationsByUuid.set(alloc.assignment_uuid, list);
  }
  return engagements.map((eng) => ({
    id: eng.assignment_uuid,
    employeeId: eng.employee_uuid,
    projectKey: eng.project_key,
    startDate: eng.start_date,
    endDate: eng.end_date,
    status: eng.status,
    note: eng.note,
    allocations: allocationsByUuid.get(eng.assignment_uuid) ?? [],
    createdBy: eng.created_by,
    updatedBy: eng.updated_by,
  }));
}

// API Functions
async function fetchAssignments(): Promise<Assignment[]> {
  const response = await fetch("/api/assignments");
  if (!response.ok) {
    throw new Error("Failed to fetch assignments");
  }
  const data = await response.json();
  return stitchAssignments(data.engagements ?? [], data.allocations ?? []);
}

async function fetchAssignmentsByProject(projectKey: string): Promise<Assignment[]> {
  const response = await fetch(`/api/assignments?projectKey=${encodeURIComponent(projectKey)}`);
  if (!response.ok) {
    throw new Error("Failed to fetch assignments by project");
  }
  const data = await response.json();
  return stitchAssignments(data.engagements ?? [], data.allocations ?? []);
}

async function fetchAssignmentsByEmployee(employeeId: string): Promise<Assignment[]> {
  const response = await fetch(`/api/assignments?employeeId=${encodeURIComponent(employeeId)}`);
  if (!response.ok) {
    throw new Error("Failed to fetch assignments by employee");
  }
  const data = await response.json();
  return stitchAssignments(data.engagements ?? [], data.allocations ?? []);
}

async function deleteAssignment(id: string): Promise<void> {
  const response = await fetch(`/api/assignments/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to delete assignment: ${errorText}`);
  }
}

// Hooks
export function useAssignments(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [...queryKeys.assignments],
    queryFn: fetchAssignments,
    enabled: options.enabled ?? true,
  });
}

export function useAssignmentsByProject(projectKey: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.assignmentsByProject(projectKey),
    queryFn: () => fetchAssignmentsByProject(projectKey),
    enabled: !!projectKey && (options.enabled ?? true),
  });
}

export function useAssignmentsByEmployee(employeeId: string | null, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.assignmentsByEmployee(employeeId ?? ""),
    queryFn: () => fetchAssignmentsByEmployee(employeeId as string),
    enabled: !!employeeId && (options.enabled ?? true),
  });
}

export function useDeleteAssignment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteAssignment,

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.assignments });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
      invalidatePlannerData(queryClient);
    },
  });
}
