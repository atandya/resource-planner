"use client";

import { endOfMonth, format, startOfMonth } from "date-fns";
import { useAssignmentCommands } from "@/lib/query/hooks/useAssignmentCommands";
import { useAssignmentEditorStore } from "@/lib/timeline-v2/editor-store";
import type { Assignment } from "@/lib/query/hooks/useAssignments";

export type MonthSaveData = { planHours: number };

function unionSpan(monthStart: Date, existing?: Assignment) {
  const monthFrom = format(startOfMonth(monthStart), "yyyy-MM-dd");
  const monthTo = format(endOfMonth(monthStart), "yyyy-MM-dd");
  if (!existing) return { startDate: monthFrom, endDate: monthTo };
  return {
    startDate: existing.startDate < monthFrom ? existing.startDate : monthFrom,
    endDate: existing.endDate > monthTo ? existing.endDate : monthTo,
  };
}

export function useTimelineEditor(_opts: { canEditAssignments: boolean; createdByUuid: string | null }) {
  const target = useAssignmentEditorStore((s) => s.target);
  const close = useAssignmentEditorStore((s) => s.close);
  const { upsert, remove, removeMonth } = useAssignmentCommands();

  const saveMonth = async (data: MonthSaveData) => {
    if (target?.mode !== "month") return;
    const monthKey = format(startOfMonth(target.monthStart), "yyyy-MM-01");
    const span = unionSpan(target.monthStart, target.clickedAssignment);
    const projectKey = `${target.project.projectType}:${target.project.id}`;
    await upsert.mutateAsync({
      employeeUuid: target.resourceId, projectKey, span,
      monthlyHours: { [monthKey]: data.planHours }, kind: "plan", mode: "merge", status: "draft",
    });
    close();
  };

  const deleteMonth = async () => {
    if (target?.mode === "month" && target.clickedAssignment) {
      const monthKey = format(startOfMonth(target.monthStart), "yyyy-MM-01");
      await removeMonth.mutateAsync({ id: target.clickedAssignment.id, month: monthKey, kind: "plan" });
      close();
    }
  };

  const deleteSingle = async () => {
    if (target?.mode === "edit") { await remove.mutateAsync(target.assignment.id); close(); }
  };

  return {
    target, close, monthContext: null,
    saveCreate: (_d: unknown) => {},
    saveEdit: (_u: Partial<Assignment>) => {},
    deleteSingle, saveMonth, deleteMonth,
    isSavingMonth: upsert.isPending,
  };
}
