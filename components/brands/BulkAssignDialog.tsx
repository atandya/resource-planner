"use client";

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Icon } from "@iconify/react";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/use-debounce";
import { useInfiniteEmployees, type Employee } from "@/lib/query/hooks/useEmployees";
import { useProjectsByBrand } from "@/lib/query/hooks/useProjects";
import { useAssignmentCommands } from "@/lib/query/hooks/useAssignmentCommands";
import {
  deriveProjectSpan,
  summarizeBulkAssign,
  applyHoursToAll,
  buildBulkAssignOperations,
  filterProjectsByName,
} from "@/lib/assignments/bulk-assign";
import { toWholeHoursInput } from "@/lib/assignments/split";

interface BulkAssignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  brandName: string;
}

export const BulkAssignDialog: React.FC<BulkAssignDialogProps> = ({
  open,
  onOpenChange,
  brandId,
  brandName,
}) => {
  // ── Project list (full brand list — stable, no search/pagination) ──────────
  const { data: brandProjects = [], isLoading: isLoadingProjects } = useProjectsByBrand(brandId);

  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());

  const toggleProject = (id: string) =>
    setSelectedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectedProjects = useMemo(
    () => brandProjects.filter((p) => selectedProjectIds.has(p.id)),
    [brandProjects, selectedProjectIds],
  );

  const [projectSearch, setProjectSearch] = useState("");
  const filteredProjects = useMemo(
    () => filterProjectsByName(brandProjects, projectSearch),
    [brandProjects, projectSearch],
  );

  // ── Member search + infinite list ─────────────────────────────────────────
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  const {
    data: employeesData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isLoadingEmployees,
  } = useInfiniteEmployees(debouncedSearch, { enabled: open });

  const employees = useMemo(() => {
    if (!employeesData?.pages) return [];
    return employeesData.pages.flatMap((page) => page.data).filter((e) => e.employmentStatus === "active");
  }, [employeesData]);

  // ── Member selection — full objects, independent of the current search ─────
  const [selectedMembers, setSelectedMembers] = useState<Map<string, Employee>>(new Map());

  // ── Per-member hours per month ────────────────────────────────────────────
  const [manHoursByMember, setManHoursByMember] = useState<Record<string, string>>({});

  const toggleMember = (emp: Employee) => {
    if (selectedMembers.has(emp.id)) {
      setSelectedMembers((prev) => {
        const next = new Map(prev);
        next.delete(emp.id);
        return next;
      });
      setManHoursByMember((prev) => {
        const { [emp.id]: _removed, ...rest } = prev;
        return rest;
      });
    } else {
      setSelectedMembers((prev) => {
        const next = new Map(prev);
        next.set(emp.id, emp);
        return next;
      });
    }
  };

  const removeMember = (id: string) => {
    setSelectedMembers((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
    setManHoursByMember((prev) => {
      const { [id]: _removed, ...rest } = prev;
      return rest;
    });
  };

  const selectedMemberList = useMemo(() => Array.from(selectedMembers.values()), [selectedMembers]);

  const setManHours = (memberId: string, value: string) =>
    setManHoursByMember((prev) => ({ ...prev, [memberId]: value }));

  const [applyAllValue, setApplyAllValue] = useState("");

  const applyAll = () => {
    const ids = selectedMemberList.map((m) => m.id);
    setManHoursByMember((prev) => ({ ...prev, ...applyHoursToAll(ids, applyAllValue) }));
  };

  // ── Infinite scroll sentinel ──────────────────────────────────────────────
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const setLoadMoreRef = useCallback(
    (node: HTMLDivElement | null) => {
      observerRef.current?.disconnect();
      if (!node) return;
      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage();
        },
        { root: scrollContainerRef.current, threshold: 0.1, rootMargin: "100px" },
      );
      observerRef.current.observe(node);
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  );

  // ── Reset on close ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      setSelectedProjectIds(new Set());
      setSelectedMembers(new Map());
      setManHoursByMember({});
      setApplyAllValue("");
      setSearch("");
      setProjectSearch("");
    }
  }, [open]);

  // ── Summary + commit ──────────────────────────────────────────────────────
  const { upsert } = useAssignmentCommands();
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const summary = useMemo(
    () => summarizeBulkAssign(selectedMembers.size, selectedProjects),
    [selectedMembers, selectedProjects],
  );

  const commit = useCallback(async () => {
    if (selectedMemberList.length === 0 || selectedProjects.length === 0) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const ops = buildBulkAssignOperations({
        members: selectedMemberList,
        projects: selectedProjects,
        hoursByMember: manHoursByMember,
      });
      await Promise.all(ops.map((op) => upsert.mutateAsync(op)));
      onOpenChange(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save assignments");
    } finally {
      setIsSaving(false);
    }
  }, [selectedMemberList, selectedProjects, manHoursByMember, upsert, onOpenChange]);

  const canSave =
    selectedMemberList.length > 0 &&
    selectedProjects.length > 0 &&
    summary.assignableProjectCount > 0 &&
    !isSaving;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Bulk Assign — {brandName}</DialogTitle>
          <DialogDescription>
            Choose projects and team members, then set hours per member, per month. Each member is
            assigned to every chosen project as a draft.
          </DialogDescription>
        </DialogHeader>

        {/* Two columns on desktop, stacked on mobile */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-6 overflow-y-auto md:overflow-hidden">
          {/* ── Projects column ──────────────────────────────────────────── */}
          <section className="flex flex-col min-h-0 md:flex-1">
            <h3 className="text-sm font-semibold mb-2">
              Projects{" "}
              <span className="text-muted-foreground font-normal">
                ({selectedProjectIds.size} chosen)
              </span>
            </h3>
            {isLoadingProjects ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Icon icon="lucide:loader-2" className="h-4 w-4 animate-spin" />
                Loading projects…
              </div>
            ) : brandProjects.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No projects found for this brand.</p>
            ) : (
              <>
                <div className="relative mb-2">
                  <Icon
                    icon="lucide:search"
                    className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                  />
                  <Input
                    placeholder="Search projects…"
                    value={projectSearch}
                    onChange={(e) => setProjectSearch(e.target.value)}
                    className="pl-9"
                    aria-label="Search projects by name"
                  />
                </div>
                {filteredProjects.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No projects matching &quot;{projectSearch.trim()}&quot;
                  </p>
                ) : (
                  <div className="md:flex-1 md:overflow-y-auto space-y-1 pr-1">
                    {filteredProjects.map((p) => {
                      const isSelected = selectedProjectIds.has(p.id);
                      const isPitch = p.projectType === "pitch";
                      const span = deriveProjectSpan(p);
                      const noDate = !span;
                      return (
                        <label
                          key={p.id}
                          className={cn(
                            "flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer",
                            isSelected
                              ? "bg-primary/5 border-primary"
                              : noDate
                                ? "border-amber-200 bg-amber-50/50 opacity-70"
                                : "hover:bg-accent/50 border-transparent",
                          )}
                        >
                          <div className="w-2 h-6 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">{p.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {isPitch
                                ? `Pitch${span ? ` · ${span.startDate} – ${span.endDate}` : " · no submit date — will be skipped"}`
                                : `Campaign${span ? ` · ${span.startDate} – ${span.endDate}` : " · no dates — will be skipped"}`}
                            </div>
                          </div>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleProject(p.id)}
                            aria-label={`Select project ${p.name}`}
                          />
                        </label>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </section>

          {/* ── Team Members column ──────────────────────────────────────── */}
          <section className="flex flex-col min-h-0 md:flex-1">
            <h3 className="text-sm font-semibold mb-2">
              Team Members{" "}
              <span className="text-muted-foreground font-normal">
                ({selectedMembers.size} chosen)
              </span>
            </h3>

            {/* Chosen tray = hours-per-month editor. Persists across searches. */}
            {selectedMemberList.length > 0 && (
              <div className="mb-3 rounded-lg border bg-muted/30">
                <div className="max-h-[180px] overflow-y-auto p-2 space-y-1">
                  {selectedMemberList.map((emp) => (
                    <div key={emp.id} className="flex items-center gap-2">
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-medium shrink-0"
                        style={{ backgroundColor: emp.department?.color ?? "#6366f1" }}
                      >
                        {emp.fullName.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm flex-1 truncate">{emp.fullName}</span>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        inputMode="numeric"
                        placeholder="0"
                        value={manHoursByMember[emp.id] ?? ""}
                        onChange={(e) => setManHours(emp.id, toWholeHoursInput(e.target.value))}
                        className="w-20 text-right"
                        aria-label={`Hours per month for ${emp.fullName}`}
                      />
                      <span className="text-xs text-muted-foreground w-8">hrs/mo</span>
                      <button
                        type="button"
                        onClick={() => removeMember(emp.id)}
                        aria-label={`Remove ${emp.fullName}`}
                        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent shrink-0"
                      >
                        <Icon icon="lucide:x" className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 border-t px-2 py-2">
                  <span className="text-xs text-muted-foreground flex-1">Apply to all</span>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    placeholder="0"
                    value={applyAllValue}
                    onChange={(e) => setApplyAllValue(toWholeHoursInput(e.target.value))}
                    className="w-20 text-right"
                    aria-label="Hours per month to apply to all chosen members"
                  />
                  <span className="text-xs text-muted-foreground w-8">hrs/mo</span>
                  <Button type="button" variant="outline" size="sm" onClick={applyAll} disabled={!applyAllValue}>
                    Apply
                  </Button>
                </div>
              </div>
            )}

            <div className="relative mb-2">
              <Icon
                icon="lucide:search"
                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
              />
              <Input
                placeholder="Search to add people…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <div ref={scrollContainerRef} className="md:flex-1 md:overflow-y-auto max-h-[260px] md:max-h-none overflow-y-auto space-y-1">
              {isLoadingEmployees && employees.length === 0 ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-lg border animate-pulse">
                      <div className="w-8 h-8 rounded-full bg-gray-200" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-gray-200 rounded w-3/4" />
                        <div className="h-3 bg-gray-200 rounded w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : employees.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  {search ? `No employees matching "${search}"` : "No employees found"}
                </p>
              ) : (
                <>
                  {employees.map((emp) => {
                    const isSelected = selectedMembers.has(emp.id);
                    return (
                      <label
                        key={emp.id}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer",
                          isSelected ? "bg-primary/5 border-primary" : "hover:bg-accent/50 border-transparent",
                        )}
                      >
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white font-medium text-sm shrink-0"
                          style={{ backgroundColor: emp.department?.color ?? "#6366f1" }}
                        >
                          {emp.fullName.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{emp.fullName}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {emp.position}
                            {emp.department && ` · ${emp.department.name}`}
                          </div>
                        </div>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleMember(emp)}
                          aria-label={`Select ${emp.fullName}`}
                        />
                      </label>
                    );
                  })}
                  <div ref={setLoadMoreRef} className="py-2 text-center text-xs text-muted-foreground">
                    {isFetchingNextPage ? (
                      <span className="flex items-center justify-center gap-1">
                        <Icon icon="lucide:loader-2" className="h-3 w-3 animate-spin" />
                        Loading more…
                      </span>
                    ) : hasNextPage ? (
                      "Scroll to load more"
                    ) : employees.length > 0 ? (
                      `${employees.length} employee${employees.length !== 1 ? "s" : ""} shown`
                    ) : null}
                  </div>
                </>
              )}
            </div>
          </section>
        </div>

        {saveError && (
          <p className="text-sm text-red-600 flex items-center gap-1 pt-2">
            <Icon icon="lucide:alert-circle" className="h-4 w-4 shrink-0" />
            {saveError}
          </p>
        )}

        <DialogFooter className="pt-4 border-t mt-2 sm:justify-between items-center">
          <div className="text-sm">
            {selectedMembers.size > 0 || selectedProjects.length > 0 ? (
              <>
                <span className="font-medium">
                  {selectedMembers.size} member{selectedMembers.size !== 1 ? "s" : ""} ×{" "}
                  {summary.assignableProjectCount} project{summary.assignableProjectCount !== 1 ? "s" : ""} ={" "}
                  <span className="text-primary font-semibold">
                    {summary.totalAssignments} assignment{summary.totalAssignments !== 1 ? "s" : ""}
                  </span>
                </span>
                {summary.skippedCount > 0 && (
                  <span className="text-amber-600 text-xs ml-2">
                    ({summary.skippedCount} skipped — no usable dates)
                  </span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">Nothing chosen yet</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={commit} disabled={!canSave}>
              {isSaving ? (
                <>
                  <Icon icon="lucide:loader-2" className="h-4 w-4 mr-1 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Icon icon="lucide:users" className="h-4 w-4 mr-1" />
                  Save {summary.totalAssignments > 0 ? `(${summary.totalAssignments})` : ""}
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
