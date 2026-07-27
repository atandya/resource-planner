"use client";

import React, { useState } from "react";
import { Icon } from "@iconify/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ExportDialog } from "./ExportDialog";
import type { ExportFilters } from "@/lib/export/export-params";
import type { ExportFilterNames } from "@/lib/export/applied-filters";

import type { ExportType } from "@/lib/export/export-types";
import { VISIBLE_EXPORT_TYPES } from "@/lib/export/export-visibility";

// Re-exported so existing importers (components/export/index.ts and friends)
// keep resolving ExportType here, while the union itself lives in lib/.
export type { ExportType };
export type ExportFormat = "csv" | "excel";

export type ExportOption = {
  type: ExportType;
  label: string;
  icon: string;
  description: string;
  formats: ExportFormat[];
  requireDateRange?: boolean;
};

const EXPORT_OPTIONS: ExportOption[] = [
  {
    type: "assignments",
    label: "Assignments",
    icon: "lucide:calendar-check",
    description: "Export all/filtered assignments",
    formats: ["csv", "excel"],
  },
  {
    type: "utilization",
    label: "Utilization Report",
    icon: "lucide:activity",
    description: "Export employee capacity & utilization",
    formats: ["csv", "excel"],
    requireDateRange: true,
  },
  {
    type: "projects",
    label: "Project Status",
    icon: "lucide:folder-kanban",
    description: "Export project budget & status",
    formats: ["csv", "excel"],
  },
  {
    type: "conflicts",
    label: "Conflicts Report",
    icon: "lucide:alert-triangle",
    description: "Export conflict analysis",
    formats: ["csv", "excel"],
    requireDateRange: true,
  },
  {
    type: "brand",
    label: "Brand Report",
    icon: "lucide:tag",
    description: "Export brand-level summary",
    formats: ["excel"],
    requireDateRange: true,
  },
  {
    type: "detailed",
    label: "Detailed Data Report",
    icon: "lucide:table",
    description: "Planned hours per employee, project and month",
    formats: ["excel"],
    requireDateRange: true,
  },
];

interface ExportButtonProps {
  filters?: ExportFilters & { startDate?: string; endDate?: string };
  /** Display labels for filter ids, passed through to the dialog's filter panel. */
  filterNames?: ExportFilterNames;
  disabled?: boolean;
}

// Only the types in VISIBLE_EXPORT_TYPES appear in the menu; the rest are
// parked. Filtered here, not in EXPORT_OPTIONS, so every option definition
// survives for a one-line revival.
const VISIBLE_EXPORT_OPTIONS = EXPORT_OPTIONS.filter((option) =>
  VISIBLE_EXPORT_TYPES.includes(option.type)
);

export const ExportButton: React.FC<ExportButtonProps> = ({ filters, filterNames, disabled }) => {
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedExport, setSelectedExport] = useState<ExportOption | null>(null);

  const handleExportClick = (option: ExportOption) => {
    setSelectedExport(option);
    setOpenDialog(true);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={disabled}>
            <Icon icon="lucide:download" className="mr-2 h-4 w-4" />
            Export
            <Icon icon="lucide:chevron-down" className="ml-2 h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[280px]">
          <div className="px-2 py-1.5">
            <p className="text-sm font-medium">Export Data</p>
            <p className="text-xs text-muted-foreground">Choose report type and format</p>
          </div>
          <DropdownMenuSeparator />
          {VISIBLE_EXPORT_OPTIONS.map((option) => (
            <DropdownMenuItem
              key={option.type}
              onClick={() => handleExportClick(option)}
              className="flex-col items-start py-3"
            >
              <div className="flex items-center w-full">
                <Icon icon={option.icon} className="mr-2 h-4 w-4" />
                <span className="font-medium">{option.label}</span>
                <span className="ml-auto rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">
                  {option.formats.map((f) => (f === "excel" ? "XLSX" : "CSV")).join(" + ")}
                </span>
              </div>
              <p className="text-xs text-muted-foreground ml-6">{option.description}</p>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {selectedExport && (
        <ExportDialog
          open={openDialog}
          onOpenChange={setOpenDialog}
          exportOption={selectedExport}
          filters={filters}
          filterNames={filterNames}
        />
      )}
    </>
  );
};

export default ExportButton;
