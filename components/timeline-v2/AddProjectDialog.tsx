"use client";

import React, { useMemo, useState } from "react";
import { format } from "date-fns";
import { Icon } from "@iconify/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDebounce } from "@/hooks/use-debounce";
import { usePlannerFilterProjects } from "@/lib/query/hooks";
import { hasProjectCriteria } from "@/lib/query/filterCriteria";
import { useAssignmentCommands } from "@/lib/query/hooks/useAssignmentCommands";
import { useAssignmentsByEmployee } from "@/lib/query/hooks/useAssignments";
import { toast } from "@/hooks/use-toast";
import { useAddProjectStore } from "@/lib/timeline-v2/add-project-store";
import {
  countAssignmentWorkingDays,
  getDefaultAssignmentRange,
  parseManHoursInput,
  splitTotalAcrossMonths,
  splitTotalAcrossMonthsMap,
  toDateInputValue,
  toWholeHoursInput,
} from "@/lib/assignments/split";
import { getOverCapacityMonths, sumExistingMonthlyHours } from "@/lib/assignments/capacity-warning";
import type { ProjectOption } from "@/lib/query/hooks/useProjects";

type AddProjectDialogProps = {
  createdByUuid: string | null;
};

// Picker (search + Brand|Project table) stays open in the background; selecting
// a project opens the assign form as a second modal on top. Closing the assign
// form (cancel/X/assign) returns to the still-open picker so the planner can
// enroll the employee on several projects in one session. Mirrors Setup's
// Assign Member; view-mode independent.
export function AddProjectDialog({ createdByUuid: _createdByUuid }: AddProjectDialogProps) {
  const target = useAddProjectStore((state) => state.target);
  const closePicker = useAddProjectStore((state) => state.close);
  const { upsert } = useAssignmentCommands();

  // Picker state
  const [projectSearch, setProjectSearch] = useState("");
  const debouncedProjectSearch = useDebounce(projectSearch, 300);
  // Projects assigned during THIS picker session (optimistic), unioned with the
  // employee's already-assigned ids so just-assigned rows disable immediately.
  const [justAssignedIds, setJustAssignedIds] = useState<string[]>([]);

  // Assign-form state (second modal)
  const [selectedProject, setSelectedProject] = useState<ProjectOption | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [hoursInput, setHoursInput] = useState("");
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [customMonthly, setCustomMonthly] = useState<Record<string, string>>({});
  const [capacityConfirmOpen, setCapacityConfirmOpen] = useState(false);

  const projectQuery = usePlannerFilterProjects({ search: debouncedProjectSearch });
  const employeeAssignmentsQuery = useAssignmentsByEmployee(target?.resourceId ?? null, {
    enabled: !!target,
  });

  const projects = useMemo(
    () => projectQuery.data?.pages.flatMap((page) => page.projects) ?? [],
    [projectQuery.data]
  );
  const projectTotal = projectQuery.data?.pages[0]?.total ?? projects.length;

  const renderedProjects = useMemo(() => {
    const byId = new Map<string, ProjectOption>();
    for (const project of projects) {
      if (!byId.has(project.id)) byId.set(project.id, project);
    }
    return Array.from(byId.values());
  }, [projects]);

  const assignedIds = useMemo(
    () => new Set<string>([...(target?.assignedProjectIds ?? []), ...justAssignedIds]),
    [target, justAssignedIds]
  );

  const projectHasQuery = hasProjectCriteria({
    search: projectSearch,
    brandIds: [],
    status: null,
    sourceType: null,
  });
  const projectSearchPending =
    projectSearch.trim() !== debouncedProjectSearch.trim() || projectQuery.isFetching;

  const resetForm = () => {
    setSelectedProject(null);
    setStartDate("");
    setEndDate("");
    setHoursInput("");
    setIsCustomizing(false);
    setCustomMonthly({});
    setCapacityConfirmOpen(false);
  };

  const evenMonthlyStrings = (total: number, from: string, to: string): Record<string, string> =>
    Object.fromEntries(
      Object.entries(splitTotalAcrossMonthsMap(total, from, to)).map(([m, h]) => [m, String(Math.round(h))]),
    );

  const enableCustomize = () => {
    setCustomMonthly(evenMonthlyStrings(totalHours ?? 0, startDate, endDate));
    setIsCustomizing(true);
  };

  const handleClosePicker = () => {
    closePicker();
    setProjectSearch("");
    setJustAssignedIds([]);
    resetForm();
  };

  const handlePickProject = (project: ProjectOption) => {
    if (assignedIds.has(project.id)) return;
    const range = getDefaultAssignmentRange(project);
    setSelectedProject(project);
    setStartDate(range.startDate);
    setEndDate(range.endDate);
    setHoursInput("");
  };

  const totalHours = parseManHoursInput(hoursInput);
  // The editable range is clamped to the project's own span (when it has one).
  const projectStart = toDateInputValue(selectedProject?.startDate ?? null);
  const projectEnd = toDateInputValue(selectedProject?.endDate ?? null);
  const orderValid = !!startDate && !!endDate && startDate <= endDate;
  const withinProjectBounds =
    (!projectStart || startDate >= projectStart) && (!projectEnd || endDate <= projectEnd);
  const rangeValid = orderValid && withinProjectBounds;
  const workingDays = rangeValid ? countAssignmentWorkingDays({ startDate, endDate }) : 0;

  const spanMonths = useMemo(
    () => (rangeValid ? splitTotalAcrossMonths(0, startDate, endDate).map((m) => m.month) : []),
    [rangeValid, startDate, endDate],
  );
  const customMonthlyTotal = useMemo(
    () => spanMonths.reduce((sum, m) => sum + (parseManHoursInput(customMonthly[m]) ?? 0), 0),
    [spanMonths, customMonthly],
  );

  const proposedMonthlyHours = useMemo(() => {
    if (!rangeValid) return {};
    return isCustomizing
      ? Object.fromEntries(spanMonths.map((m) => [m, parseManHoursInput(customMonthly[m]) ?? 0]))
      : splitTotalAcrossMonthsMap(totalHours ?? 0, startDate, endDate);
  }, [rangeValid, isCustomizing, spanMonths, customMonthly, totalHours, startDate, endDate]);

  const existingMonthlyHours = useMemo(() => {
    if (!selectedProject || !employeeAssignmentsQuery.data) return {};
    return sumExistingMonthlyHours(employeeAssignmentsQuery.data, selectedProject.projectKey);
  }, [selectedProject, employeeAssignmentsQuery.data]);

  const overCapacityMonths = useMemo(
    () => getOverCapacityMonths({ existingByMonth: existingMonthlyHours, proposedByMonth: proposedMonthlyHours }),
    [existingMonthlyHours, proposedMonthlyHours],
  );

  const canSave =
    rangeValid &&
    !upsert.isPending &&
    (isCustomizing ? customMonthlyTotal > 0 : totalHours !== null && totalHours > 0);

  const performAssign = async () => {
    if (!target || !selectedProject || !canSave) return;
    const assignedId = selectedProject.id;
    try {
      await upsert.mutateAsync({
        employeeUuid: target.resourceId,
        projectKey: selectedProject.projectKey,
        span: { startDate, endDate },
        monthlyHours: proposedMonthlyHours,
        status: "draft",
        mode: "merge",
      });
      setJustAssignedIds((prev) => [...prev, assignedId]);
      resetForm(); // back to the still-open picker
    } catch {
      toast({
        variant: "destructive",
        title: "Failed to assign project",
        description: "Refresh and try again.",
      });
    }
  };

  const handleAssign = () => {
    if (!canSave) return;
    if (overCapacityMonths.length > 0) {
      setCapacityConfirmOpen(true);
      return;
    }
    void performAssign();
  };

  const handleConfirmOverCapacity = () => {
    setCapacityConfirmOpen(false);
    void performAssign();
  };

  if (!target) return null;

  return (
    <>
      {/* Picker (background modal) */}
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) handleClosePicker();
        }}
      >
        <DialogContent
          className="flex max-h-[80vh] flex-col p-0 sm:max-w-[640px]"
          data-testid="add-project-dialog"
        >
          <DialogHeader className="shrink-0 px-6 pb-2 pt-6">
            <DialogTitle>Assign to a project</DialogTitle>
            <DialogDescription>
              Search a brand or project to add to this person&rsquo;s plan.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 space-y-3 overflow-y-auto px-6 pb-6">
            <div className="relative">
              <Icon
                icon="lucide:search"
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={projectSearch}
                onChange={(event) => setProjectSearch(event.target.value)}
                placeholder="Search brands or projects..."
                className="h-9 pl-9"
                data-testid="add-project-search-input"
              />
            </div>

            <div className="rounded-md border">
              <div className="grid grid-cols-[1fr_72px_2fr] gap-2 border-b bg-muted/30 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <span>Brand</span>
                <span>Type</span>
                <span>Project</span>
              </div>
              <ScrollArea className="h-[320px]">
                <div>
                  {!projectHasQuery ? (
                    <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                      Search a brand or project to begin&hellip;
                    </div>
                  ) : (
                    <>
                      {renderedProjects.map((project) => {
                        const isAssigned = assignedIds.has(project.id);
                        if (isAssigned) {
                          return (
                            <div
                              key={project.id}
                              className="grid w-full cursor-not-allowed grid-cols-[1fr_72px_2fr] items-center gap-2 px-3 py-2 text-left text-sm opacity-50"
                              aria-disabled="true"
                              data-testid="add-project-option-disabled"
                            >
                              <span className="truncate text-xs text-muted-foreground">
                                {project.brandName ?? "—"}
                              </span>
                              <span className="truncate text-xs text-muted-foreground">
                                {project.projectType === "pitch" ? "Pitch" : "Campaign"}
                              </span>
                              <span className="flex min-w-0 items-center gap-2">
                                <span
                                  aria-hidden="true"
                                  className="h-3 w-3 shrink-0 rounded-full"
                                  style={{ backgroundColor: project.color }}
                                />
                                <span className="truncate">{project.name}</span>
                                <span className="ml-auto shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                  Assigned
                                </span>
                              </span>
                            </div>
                          );
                        }
                        return (
                          <button
                            key={project.id}
                            type="button"
                            className="grid w-full grid-cols-[1fr_72px_2fr] items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                            onClick={() => handlePickProject(project)}
                            data-testid="add-project-option"
                          >
                            <span className="truncate text-xs text-muted-foreground">
                              {project.brandName ?? "—"}
                            </span>
                            <span className="truncate text-xs text-muted-foreground">
                              {project.projectType === "pitch" ? "Pitch" : "Campaign"}
                            </span>
                            <span className="flex min-w-0 items-center gap-2">
                              <span
                                aria-hidden="true"
                                className="h-3 w-3 shrink-0 rounded-full"
                                style={{ backgroundColor: project.color }}
                              />
                              <span className="truncate">{project.name}</span>
                            </span>
                          </button>
                        );
                      })}

                      {renderedProjects.length === 0 && projectSearchPending ? (
                        <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                          Searching&hellip;
                        </div>
                      ) : null}
                      {renderedProjects.length === 0 && !projectSearchPending ? (
                        <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                          No brands or projects found
                        </div>
                      ) : null}

                      {projectQuery.hasNextPage ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="m-1 w-[calc(100%-0.5rem)] text-xs"
                          disabled={projectQuery.isFetchingNextPage}
                          onClick={() => projectQuery.fetchNextPage()}
                        >
                          {projectQuery.isFetchingNextPage ? "Loading more…" : "Load more"}
                        </Button>
                      ) : null}
                    </>
                  )}
                </div>
              </ScrollArea>
            </div>

            {projectHasQuery && renderedProjects.length > 0 ? (
              <div className="text-xs text-muted-foreground">
                {`${renderedProjects.length} of ${projectTotal} results`}
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign form (overlay modal); closing returns to the picker */}
      <Dialog
        open={!!selectedProject}
        onOpenChange={(open) => {
          if (!open) resetForm();
        }}
      >
        <DialogContent
          className="flex max-h-[80vh] flex-col p-0 sm:max-w-[440px]"
          data-testid="add-project-assign-dialog"
        >
          {selectedProject ? (
            <>
              <DialogHeader className="shrink-0 px-6 pb-2 pt-6">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: selectedProject.color }}
                  />
                  <DialogTitle>{selectedProject.name}</DialogTitle>
                </div>
                <DialogDescription>Assign this person to the project</DialogDescription>
              </DialogHeader>

              <div className="min-h-0 space-y-4 overflow-y-auto px-6 pb-6">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Date Range</label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="date"
                      value={startDate}
                      min={projectStart || undefined}
                      max={endDate || projectEnd || undefined}
                      onChange={(event) => {
                        const next = event.target.value;
                        setStartDate(next);
                        if (isCustomizing) setCustomMonthly(evenMonthlyStrings(totalHours ?? 0, next, endDate));
                      }}
                      className="h-9"
                      data-testid="add-project-start-date"
                    />
                    <span className="text-xs text-muted-foreground">to</span>
                    <Input
                      type="date"
                      value={endDate}
                      min={startDate || projectStart || undefined}
                      max={projectEnd || undefined}
                      onChange={(event) => {
                        const next = event.target.value;
                        setEndDate(next);
                        if (isCustomizing) setCustomMonthly(evenMonthlyStrings(totalHours ?? 0, startDate, next));
                      }}
                      className="h-9"
                      data-testid="add-project-end-date"
                    />
                  </div>
                  {!orderValid ? (
                    <p className="mt-1 text-xs text-red-500">
                      End date must be on or after the start date.
                    </p>
                  ) : !withinProjectBounds ? (
                    <p className="mt-1 text-xs text-red-500">
                      {projectStart && projectEnd
                        ? `Dates must be within the project range (${projectStart} – ${projectEnd}).`
                        : "Dates must be within the project range."}
                    </p>
                  ) : null}
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="block text-xs text-muted-foreground">Total Hours</label>
                    {rangeValid && spanMonths.length > 1 ? (
                      <button
                        type="button"
                        className="text-xs font-medium text-blue-600 hover:underline"
                        onClick={() => (isCustomizing ? setIsCustomizing(false) : enableCustomize())}
                        data-testid="add-project-customize-toggle"
                      >
                        {isCustomizing ? "Use even split" : "Customize per month"}
                      </button>
                    ) : null}
                  </div>
                  {isCustomizing ? (
                    <>
                      <div className="mb-3 text-sm">
                        <span className="font-medium">{customMonthlyTotal}</span>{" "}
                        <span className="text-xs text-muted-foreground">total hours (sum of months)</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {spanMonths.map((month) => (
                          <div key={month}>
                            <label className="mb-1 block text-[11px] text-muted-foreground">
                              {format(new Date(`${month}T00:00:00`), "MMM yyyy")}
                            </label>
                            <Input
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={customMonthly[month] ?? ""}
                              onChange={(event) =>
                                setCustomMonthly((prev) => ({
                                  ...prev,
                                  [month]: toWholeHoursInput(event.target.value),
                                }))
                              }
                              placeholder="0"
                              className="h-9 text-center"
                              data-testid={`add-project-month-input-${month}`}
                            />
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Input
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={hoursInput}
                        onChange={(event) => setHoursInput(toWholeHoursInput(event.target.value))}
                        placeholder="0"
                        className="h-9 w-28 text-center"
                        data-testid="add-project-hours-input"
                      />
                      <span className="text-xs text-muted-foreground">
                        {rangeValid
                          ? `over ${workingDays} working ${workingDays === 1 ? "day" : "days"}`
                          : "hours"}
                      </span>
                    </div>
                  )}
                  {overCapacityMonths.length > 0 ? (
                    <p className="mt-2 text-xs text-red-500" data-testid="add-project-capacity-warning-text">
                      {overCapacityMonths
                        .map((m) => `${m.monthLabel}: ${m.overPercentage}% over capacity`)
                        .join(", ")}
                    </p>
                  ) : null}
                </div>
              </div>

              <DialogFooter className="shrink-0 px-6 pb-6 pt-2">
                <Button variant="outline" onClick={resetForm} className="text-sm">
                  Cancel
                </Button>
                <Button
                  onClick={handleAssign}
                  disabled={!canSave}
                  className="text-sm"
                  data-testid="add-project-save"
                >
                  {upsert.isPending ? "Saving…" : "Assign"}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Over-capacity confirmation; stacks on top of the still-open assign form */}
      <AlertDialog open={capacityConfirmOpen} onOpenChange={setCapacityConfirmOpen}>
        <AlertDialogContent data-testid="add-project-capacity-warning">
          <AlertDialogHeader>
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100">
                <Icon icon="lucide:alert-triangle" className="h-5 w-5 text-red-600" />
              </span>
              <AlertDialogTitle>Over monthly capacity</AlertDialogTitle>
            </div>
            <AlertDialogDescription asChild>
              <div className="mt-3 space-y-1">
                {overCapacityMonths.map((m) => (
                  <div key={m.month} className="text-sm text-foreground">
                    <span className="font-semibold">
                      {m.monthLabel}: {m.overPercentage}% over
                    </span>{" "}
                    <span className="text-muted-foreground">({m.totalHours}h of 160h)</span>
                  </div>
                ))}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmOverCapacity}
              className="bg-black text-sm text-white hover:bg-black/90"
              data-testid="add-project-capacity-confirm"
            >
              Assign anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
