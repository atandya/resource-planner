"use client";

import React from "react";
import type { VirtualItem, Virtualizer } from "@tanstack/react-virtual";
import { ResourceRow } from "@/components/timeline-v2/ResourceRow";
import type { EmployeeRowModel } from "@/lib/timeline-v2/row-model";
import type { TimelineColumn, TimelineProjectTypeScope, TimelineViewMode } from "@/lib/timeline-v2/types";

type TimelineBodyProps = {
  rowVirtualizer: Virtualizer<HTMLDivElement, Element>;
  virtualRows: VirtualItem[];
  visibleIds: string[];
  rowModels: Map<string, EmployeeRowModel>;
  columns: TimelineColumn[];
  viewMode: TimelineViewMode;
  showTimelineLoading: boolean;
  showExpandedLoading: boolean;
  canEditAssignments: boolean;
  brandIds: string[];
  projectIds: string[];
  projectTypeScope?: TimelineProjectTypeScope;
};

// Virtualized rows region. Lives inside the single scroll container owned by
// Timeline.tsx (header sticky above); translateY subtracts the virtualizer's
// scrollMargin, which accounts for the header height.
export function TimelineBody({
  rowVirtualizer,
  virtualRows,
  visibleIds,
  rowModels,
  columns,
  viewMode,
  showTimelineLoading,
  showExpandedLoading,
  canEditAssignments,
  brandIds,
  projectIds,
  projectTypeScope,
}: TimelineBodyProps) {
  return (
    <div className="relative w-full" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
      {virtualRows.map((virtualRow) => {
        const rowId = visibleIds[virtualRow.index];
        const row = rowId ? rowModels.get(rowId) : undefined;
        if (!row) return null;

        return (
          <div
            key={`${row.id}:${virtualRow.index}`}
            data-index={virtualRow.index}
            ref={rowVirtualizer.measureElement}
            className="absolute left-0 top-0 w-full"
            style={{ transform: `translateY(${virtualRow.start - rowVirtualizer.options.scrollMargin}px)` }}
          >
            <ResourceRow
              row={row}
              columns={columns}
              viewMode={viewMode}
              showTimelineLoading={showTimelineLoading}
              showExpandedLoading={showExpandedLoading}
              canEditAssignments={canEditAssignments}
              brandIds={brandIds}
              projectIds={projectIds}
              projectTypeScope={projectTypeScope}
            />
          </div>
        );
      })}
    </div>
  );
}
