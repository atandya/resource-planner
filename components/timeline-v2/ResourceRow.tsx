"use client";

import React, { useMemo } from "react";
import { CapacityStrip } from "@/components/timeline-v2/CapacityStrip";
import { ProjectLane } from "@/components/timeline-v2/ProjectLane";
import { AddProjectLaneRow } from "@/components/timeline-v2/AddProjectLaneRow";
import { ResourceIdentityCell } from "@/components/timeline-v2/ResourceIdentityCell";
import { TimelineExpandedSkeleton, TimelineRowLoadingCells } from "@/components/timeline-v2/LoadingStates";
import { useIsRowExpanded, useTimelineExpansionStore } from "@/lib/timeline-v2/expansion-store";
import { orderProjectLanes } from "@/lib/timeline-v2/lane-order";
import type { EmployeeRowModel } from "@/lib/timeline-v2/row-model";
import type { TimelineColumn, TimelineProjectTypeScope, TimelineViewMode } from "@/lib/timeline-v2/types";

type ResourceRowProps = {
  row: EmployeeRowModel;
  columns: TimelineColumn[];
  viewMode: TimelineViewMode;
  showTimelineLoading: boolean;
  showExpandedLoading: boolean;
  canEditAssignments: boolean;
  brandIds: string[];
  projectIds: string[];
  projectTypeScope?: TimelineProjectTypeScope;
};

export const ResourceRow = React.memo(function ResourceRow({
  row,
  columns,
  viewMode,
  showTimelineLoading,
  showExpandedLoading,
  canEditAssignments,
  brandIds,
  projectIds,
  projectTypeScope,
}: ResourceRowProps) {
  const isExpanded = useIsRowExpanded(row.id);
  const toggleExpanded = useTimelineExpansionStore((state) => state.toggle);
  const projectDays = useMemo(() => columns.map((item) => item.date), [columns]);

  // Lane sorting + highlight flags are filter-dependent and cheap, so they are
  // derived per row — only when the row is actually expanded.
  const orderedLanes = useMemo(
    () =>
      isExpanded
        ? orderProjectLanes({
            lanes: row.projectLanes,
            resourceAssignments: row.assignments,
            brandIds,
            projectIds,
            projectTypeScope,
            days: projectDays,
          })
        : [],
    [brandIds, isExpanded, projectDays, projectIds, projectTypeScope, row.assignments, row.projectLanes]
  );

  // Project IDs (ProjectOption.id) this employee already has lanes for — used
  // to disable them in the Add-project picker.
  const assignedProjectIds = useMemo(
    () => row.projectLanes.map((lane) => lane.project.id),
    [row.projectLanes]
  );

  return (
    <div className="relative z-0 border-b" data-testid="resource-row-v2" data-resource-id={row.resource.id}>
      <div className="flex h-timeline-row hover:bg-accent/5 transition-colors group">
        <ResourceIdentityCell
          name={row.resource.name}
          role={row.resource.role}
          department={row.resource.department}
          expanded={isExpanded}
          onToggleExpanded={() => toggleExpanded(row.id)}
        />
        {showTimelineLoading ? (
          <TimelineRowLoadingCells dayCount={columns.length} />
        ) : (
          <CapacityStrip cells={row.allocationCells} />
        )}
      </div>

      {isExpanded ? (
        <div>
          {showExpandedLoading ? (
            <TimelineExpandedSkeleton />
          ) : (
            <>
              {orderedLanes.map((lane) => (
                <ProjectLane
                  key={lane.projectKey}
                  lane={lane}
                  resourceId={row.resource.id}
                  resourceAssignments={row.assignments}
                  columns={columns}
                  viewMode={viewMode}
                  canEditAssignments={canEditAssignments}
                />
              ))}
              {canEditAssignments ? (
                <AddProjectLaneRow
                  resourceId={row.resource.id}
                  assignedProjectIds={assignedProjectIds}
                />
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
});
