import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../queryKeys";
import { invalidatePlannerData } from "@/lib/query/invalidatePlannerData";

export type UpsertBody = {
  employeeUuid: string;
  projectKey: string;
  span: { startDate: string; endDate: string };
  monthlyHours: Record<string, number>;
  status?: "draft" | "confirmed";
  note?: string | null;
  kind?: "plan" | "adjustment";
  mode?: "replace" | "merge";
};

async function putAssignment(body: UpsertBody) {
  const res = await fetch("/api/assignments", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to save assignment");
  return res.json();
}

async function deleteAssignment(id: string) {
  const res = await fetch(`/api/assignments/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete assignment");
}

export type DeleteMonthBody = { id: string; month: string; kind?: "plan" | "adjustment" };

async function deleteAssignmentMonth({ id, month, kind }: DeleteMonthBody) {
  const params = new URLSearchParams({ month, ...(kind ? { kind } : {}) });
  const res = await fetch(`/api/assignments/${id}?${params}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete month allocation");
}

/** One hook, one invalidation policy, for every assignment write in the app. */
export function useAssignmentCommands() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: queryKeys.assignments });
    qc.invalidateQueries({ queryKey: queryKeys.projects });
    invalidatePlannerData(qc);
  };
  const upsert = useMutation({ mutationFn: putAssignment, onSuccess: invalidate });
  const remove = useMutation({ mutationFn: deleteAssignment, onSuccess: invalidate });
  const removeMonth = useMutation({ mutationFn: deleteAssignmentMonth, onSuccess: invalidate });
  return { upsert, remove, removeMonth };
}
