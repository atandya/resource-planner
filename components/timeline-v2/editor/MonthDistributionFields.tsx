"use client";

import React, { useState } from "react";
import { format, startOfMonth } from "date-fns";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DeleteWithConfirm } from "@/components/timeline-v2/editor/fields";
import type { AssignmentEditorTarget } from "@/lib/timeline-v2/editor-store";
import type { MonthSaveData } from "@/components/timeline-v2/useTimelineEditor";

type MonthDistributionFieldsProps = {
  target: Extract<AssignmentEditorTarget, { mode: "month" }>;
  isSaving: boolean;
  onSave: (data: MonthSaveData) => void;
  onDelete: () => void;
  onClose: () => void;
};

// Month editor body (monthly-allocation model): a single "Planned hours" field
// for the clicked month. Prefilled from the clicked engagement's existing plan
// allocation for that month. Per-day distribution / category / billable were
// dropped in the monthly migration.
export function MonthDistributionFields({
  target,
  isSaving,
  onSave,
  onDelete,
  onClose,
}: MonthDistributionFieldsProps) {
  const monthKey = format(startOfMonth(target.monthStart), "yyyy-MM-01");
  const existingPlanHours =
    target.clickedAssignment?.allocations.find((a) => a.month === monthKey && a.kind === "plan")
      ?.plannedHours ?? 0;
  const isEditMode = !!target.clickedAssignment;

  const [hoursInput, setHoursInput] = useState(String(existingPlanHours));
  const [hoursError, setHoursError] = useState<string | null>(null);

  const handleSave = () => {
    const hours = parseFloat(hoursInput.replace(",", "."));
    if (Number.isNaN(hours) || hours < 0) {
      setHoursError("Please enter a valid number of hours");
      return;
    }
    onSave({ planHours: hours });
  };

  return (
    <>
      <div className="min-h-0 space-y-4 overflow-y-auto px-6">
        <span
          className={`inline-block rounded px-2 py-1 text-xs font-semibold ${
            isEditMode ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"
          }`}
        >
          {isEditMode ? "Edit planned hours" : "Set planned hours"}
        </span>

        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            Planned hours for {format(target.monthStart, "MMMM yyyy")}
          </label>
          <div className="flex items-center gap-2">
            <Input
              type="text"
              inputMode="decimal"
              value={hoursInput}
              onChange={(event) => {
                setHoursInput(event.target.value);
                setHoursError(null);
              }}
              className={`w-24 text-center${hoursError ? " border-red-500 focus-visible:ring-red-500" : ""}`}
              placeholder="0"
              autoFocus
            />
            <span className="text-xs text-muted-foreground">hours</span>
          </div>
          {hoursError ? <p className="mt-1 text-xs text-red-500">{hoursError}</p> : null}
        </div>
      </div>

      <DialogFooter className="shrink-0 px-6 pb-6 pt-2">
        <Button variant="outline" onClick={onClose} className="text-sm" disabled={isSaving}>
          Cancel
        </Button>
        {isEditMode ? (
          <DeleteWithConfirm
            title="Delete month allocation"
            description={`This removes the ${target.project.name} hours for ${format(target.monthStart, "MMMM yyyy")} only. Other months are unaffected. This cannot be undone.`}
            disabled={isSaving}
            onConfirm={onDelete}
          />
        ) : null}
        <Button onClick={handleSave} disabled={isSaving || hoursError !== null} className="text-sm">
          {isSaving ? "Saving..." : "Save"}
        </Button>
      </DialogFooter>
    </>
  );
}
