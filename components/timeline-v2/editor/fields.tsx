"use client";

import React, { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { AssignmentCategory } from "@/types";

export const ASSIGNMENT_CATEGORIES: AssignmentCategory[] = [
  "Research",
  "Development",
  "Design",
  "Meeting",
  "Admin",
  "Content",
  "Project Management",
  "Other",
];

// Count weekdays (Mon–Fri) between two dates, inclusive. Returns at least 1.
export function countWeekdays(start: Date, end: Date): number {
  let count = 0;
  const current = new Date(start);
  while (current <= end) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) count++;
    current.setDate(current.getDate() + 1);
  }
  return Math.max(1, count);
}

export function CategorySelect({
  value,
  onChange,
  color,
}: {
  value: AssignmentCategory;
  onChange: (value: AssignmentCategory) => void;
  color?: string | null;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-4 w-4 rounded-full" style={{ backgroundColor: color || "#ccc" }} />
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as AssignmentCategory)}
        className="flex-1 rounded-md border bg-background px-2 py-1.5 text-sm"
      >
        {ASSIGNMENT_CATEGORIES.map((category) => (
          <option key={category} value={category}>
            {category}
          </option>
        ))}
      </select>
    </div>
  );
}

export function NoteField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <details>
      <summary className="cursor-pointer select-none text-sm text-muted-foreground hover:text-foreground">
        Note
      </summary>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full resize-none rounded-md border p-2 text-sm"
        rows={2}
        placeholder="Add a note..."
      />
    </details>
  );
}

// The only confirmation step that survives the editor consolidation:
// destructive deletes.
export function DeleteWithConfirm({
  title,
  description,
  disabled,
  onConfirm,
}: {
  title?: string;
  description: string;
  disabled?: boolean;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)} disabled={disabled} className="text-sm">
        Delete
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title ?? "Delete assignment"}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setOpen(false);
                onConfirm();
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
