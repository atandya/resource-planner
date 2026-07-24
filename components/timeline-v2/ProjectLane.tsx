"use client";

import React from "react";
import { Icon } from "@iconify/react";
import { endOfMonth, startOfMonth } from "date-fns";
import { cn } from "@/lib/utils";
import { AssignmentBar } from "@/components/timeline-v2/AssignmentBar";
import { useDragToCreate } from "@/components/timeline-v2/interactions/useDragToCreate";
import { getTimelineRangePosition } from "@/lib/timeline-v2/layout";
import { useAssignmentEditorStore } from "@/lib/timeline-v2/editor-store";
import type { OrderedProjectLane } from "@/lib/timeline-v2/lane-order";
import type { EmployeeRowModel, ProjectLaneModel } from "@/lib/timeline-v2/row-model";
import type { TimelineColumn, TimelineViewMode } from "@/lib/timeline-v2/types";
import { buildSegmentDisplayAssignment } from "@/lib/timeline-v2/plan-display-segments";
import { getTimelineResolution } from "@/lib/timeline-v2/date-range";

function parseLocalDate(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

// A merged segment is move-draggable only when every member row is fully
// visible — shifting just the visible slice would tear a distribution apart.
function areAllMembersVisible(
  assignments: EmployeeRowModel["assignments"],
  columns: TimelineColumn[]
): boolean {
  if (columns.length === 0) return false;
  const rangeStart = columns[0].date;
  const rangeEnd = columns[columns.length - 1].date;
  return assignments.every(
    (assignment) =>
      parseLocalDate(assignment.startDate) >= rangeStart &&
      parseLocalDate(assignment.endDate) <= rangeEnd
  );
}

type ProjectLaneProps = {
  lane: OrderedProjectLane<ProjectLaneModel>;
  resourceId: string;
  resourceAssignments: EmployeeRowModel["assignments"];
  columns: TimelineColumn[];
  viewMode: TimelineViewMode;
  canEditAssignments: boolean;
};

export const ProjectLane = React.memo(function ProjectLane({
  lane,
  resourceId,
  resourceAssignments,
  columns,
  viewMode,
  canEditAssignments,
}: ProjectLaneProps) {
  const openEditor = useAssignmentEditorStore((state) => state.open);
  const campaign = lane.project;
  const isPitch = campaign.projectType === "pitch";
  const brand = lane.brand;
  const monthRangeView = getTimelineResolution(viewMode) === "month";

  // Day-resolution lanes: one pointer-handler set on the canvas replaces the
  // legacy per-cell listener fleet. Drag (or click) opens the create editor.
  const dragToCreate = useDragToCreate({
    enabled: !monthRangeView && canEditAssignments,
    columns,
    onCreate: ({ startDate, endDate }) => {
      openEditor({
        mode: "create",
        resourceId,
        project: campaign,
        startDate,
        endDate,
      });
    },
  });

  const monthClickHandler = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!monthRangeView || !canEditAssignments) return;
    // Pointer math measures the lane canvas rect (DESIGN.md §2.1) instead of
    // consuming a pixel constant.
    const containerRect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - containerRect.left;
    const columnWidth = containerRect.width / Math.max(columns.length, 1);
    const index = Math.max(0, Math.min(columns.length - 1, Math.floor(x / columnWidth)));
    const clickedMonth = columns[index]?.date ?? columns[0]?.date;
    const monthStart = startOfMonth(clickedMonth);
    const monthEnd = endOfMonth(monthStart);
    openEditor({
      mode: "month",
      resourceId,
      project: campaign,
      monthStart,
      monthEnd,
      clickedAssignment: lane.planAssignments[0],
    });
  };

  return (
    <div
      className={cn("flex h-timeline-lane border-b", isPitch ? "bg-amber-50/10" : "bg-blue-50/10", lane.isHighlighted && "bg-amber-50/70")}
      data-testid="resource-row-v2-campaign-row"
    >
      <div
        className={cn(
          "sticky left-0 z-20 flex h-full w-[var(--timeline-resource-col)] shrink-0 items-center gap-2 border-r bg-background pl-12 pr-3",
          lane.isHighlighted && "bg-amber-50/90"
        )}
        data-testid="resource-row-v2-campaign-label"
        onClick={(event) => event.stopPropagation()}
        title={brand?.name ? `${campaign.name} · ${brand.name}` : campaign.name}
      >
        <Icon
          icon={isPitch ? "lucide:megaphone" : "lucide:package"}
          className={cn("h-3.5 w-3.5 shrink-0", lane.isHighlighted || isPitch ? "text-amber-600" : "text-blue-600")}
        />
        <div className="min-w-0">
          <div className={cn("truncate text-xs font-bold uppercase tracking-wider", lane.isHighlighted || isPitch ? "text-amber-800" : "text-blue-800")}>{campaign.name}</div>
          {brand?.name ? (
            <div className="truncate text-[10px] text-muted-foreground">{brand.name}</div>
          ) : null}
        </div>
      </div>

      {/* Click handler lives on the canvas (not the row) so the rect math sees
          only the column area — the resource label must not shift the index. */}
      <div
        className={cn("relative h-full flex-1", !monthRangeView && canEditAssignments && "touch-none")}
        onClick={monthRangeView ? monthClickHandler : undefined}
        onPointerDown={dragToCreate.handlers.onPointerDown}
        onPointerMove={dragToCreate.handlers.onPointerMove}
        onPointerUp={dragToCreate.handlers.onPointerUp}
        onPointerCancel={dragToCreate.handlers.onPointerCancel}
        style={{ "--lane-hover": `${campaign.color || "#64748b"}1f` } as React.CSSProperties}
      >
        {/* Presentational column grid: gridlines plus a per-cell hover tint so
            empty days/months read as schedulable before any click. Cells stay
            event-transparent for logic — pointer events bubble to the canvas. */}
        <div className="timeline-grid absolute inset-0" aria-hidden>
          {columns.map((column) => (
            <div
              key={column.id}
              className={cn(
                "border-r",
                !monthRangeView && column.isWeekend && "bg-muted/30",
                canEditAssignments && "hover:bg-[var(--lane-hover)]",
                canEditAssignments && (monthRangeView ? "cursor-pointer" : "cursor-cell")
              )}
            />
          ))}
        </div>

        {dragToCreate.preview ? (
          <div
            className="absolute inset-y-0.5 z-30 rounded-md border-2 border-dashed pointer-events-none"
            style={{
              ...(() => {
                const pct = getTimelineRangePosition({
                  ...dragToCreate.preview,
                  columnCount: columns.length,
                });
                return { left: `${pct.leftPct}%`, width: `${pct.widthPct}%` };
              })(),
              borderColor: campaign.color || "#64748b",
              backgroundColor: `${campaign.color || "#64748b"}33`,
            }}
            data-testid="assignment-drag-preview"
          />
        ) : null}

        {lane.planDisplaySegments.map((segment) => (
          <AssignmentBar
            key={segment.id}
            assignment={buildSegmentDisplayAssignment(segment)}
            project={campaign}
            columns={columns}
            resolution={monthRangeView ? "month" : "day"}
            interactive={!monthRangeView}
            memberAssignments={segment.assignments}
            draggable={
              !monthRangeView &&
              (segment.assignments.length === 1 || areAllMembersVisible(segment.assignments, columns))
            }
            isHighlighted={lane.isHighlighted}
            disabled={!canEditAssignments}
            onOpenMonth={
              canEditAssignments
                ? () => {
                    const monthStart = startOfMonth(parseLocalDate(segment.startDate));
                    openEditor({
                      mode: "month",
                      resourceId,
                      project: campaign,
                      monthStart,
                      monthEnd: endOfMonth(monthStart),
                      clickedAssignment: segment.sourceAssignment ?? lane.planAssignments[0],
                    });
                  }
                : undefined
            }
          />
        ))}
      </div>
    </div>
  );
});
