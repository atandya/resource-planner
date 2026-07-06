import type { Employee } from "@/lib/query/hooks/useEmployees";
import type { AllocationCellModel } from "@/lib/timeline-v2/allocation-model";
import type { Resource } from "@/types";

export type TimelineViewMode = "week" | "month" | "quarter" | "halfYear" | "year" | "custom";
export type TimelineResolution = "day" | "month";

export type TimelineColumn = {
  id: string;
  date: Date;
  label: string;
  subLabel: string | null;
  kind: TimelineResolution;
  isWeekend: boolean;
  isToday: boolean;
  isCurrentMonth: boolean;
};

export type TimelineColumnSet = {
  viewMode: TimelineViewMode;
  resolution: TimelineResolution;
  startDate: string;
  endDate: string;
  columns: TimelineColumn[];
};

export type TimelineProjectType = "campaign" | "pitch";

/** Which project types the timeline shows: both, campaigns only, or pitches only. */
export type TimelineProjectTypeScope = "all" | TimelineProjectType;

export type TimelineFilters = {
  brandIds: string[];
  departments: string[];
  projectIds: string[];
  projectTypeScope?: TimelineProjectTypeScope;
  searchQuery?: string;
};

export type TimelineResource = Resource & {
  employee: Employee;
};

export type TimelineAllocationCell = {
  id: string;
  employeeId: string;
  date: string;
  model: AllocationCellModel;
};
