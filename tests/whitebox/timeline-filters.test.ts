import { describe, expect, it } from "vitest";
import type { Assignment } from "@/lib/query/hooks/useAssignments";
import type { ProjectOption } from "@/lib/query/hooks/useProjects";
import {
  getMatchingTimelineEmployeeIds,
  hasActiveTimelineScopeFilter,
} from "@/lib/timeline-v2/timeline-filters";

const makeAssignment = (overrides: Partial<Assignment>): Assignment => ({
  id: "assignment-1",
  employeeId: "employee-1",
  projectKey: "campaign:project-1",
  startDate: "2026-06-01",
  endDate: "2026-06-01",
  status: "confirmed",
  note: null,
  allocations: [{ month: "2026-06-01", plannedHours: 160, kind: "plan" }],
  createdBy: null,
  updatedBy: null,
  ...overrides,
});

const makeProject = (overrides: Partial<ProjectOption>): ProjectOption => ({
  id: "project-1",
  projectKey: "campaign:project-1",
  name: "Project 1",
  color: "#2563eb",
  status: "active",
  projectType: "campaign",
  brandId: "brand-1",
  startDate: null,
  endDate: null,
  ...overrides,
});

describe("timeline scope filters", () => {
  it("reports whether a brand or project resource filter is active", () => {
    expect(hasActiveTimelineScopeFilter({ brandIds: [], projectIds: [] })).toBe(false);
    expect(hasActiveTimelineScopeFilter({ brandIds: ["brand-1"], projectIds: [] })).toBe(true);
    expect(hasActiveTimelineScopeFilter({ brandIds: [], projectIds: ["project-1"] })).toBe(true);
    expect(hasActiveTimelineScopeFilter({ brandIds: [], projectIds: [], projectTypeScope: "all" })).toBe(false);
    expect(hasActiveTimelineScopeFilter({ brandIds: [], projectIds: [], projectTypeScope: "pitch" })).toBe(true);
    expect(hasActiveTimelineScopeFilter({ brandIds: [], projectIds: [], projectTypeScope: "campaign" })).toBe(true);
  });

  it("matches only employees with work of the scoped project type", () => {
    const employeeIds = getMatchingTimelineEmployeeIds({
      dateFilteredAssignments: [
        makeAssignment({ id: "pitch-work", employeeId: "employee-pitch", projectKey: "pitch:pitch-1" }),
        makeAssignment({ id: "campaign-work", employeeId: "employee-campaign", projectKey: "campaign:project-1" }),
      ],
      projectByKey: new Map([
        ["pitch:pitch-1", makeProject({ id: "pitch-1", projectKey: "pitch:pitch-1", projectType: "pitch" })],
        ["campaign:project-1", makeProject({})],
      ]),
      selectedBrandProjectKeys: new Set(),
      filters: { brandIds: [], projectIds: [], projectTypeScope: "pitch" },
    });

    expect(employeeIds).toEqual(new Set(["employee-pitch"]));
  });

  it("applies no employee restriction when the type scope is all", () => {
    const employeeIds = getMatchingTimelineEmployeeIds({
      dateFilteredAssignments: [
        makeAssignment({ id: "pitch-work", employeeId: "employee-pitch", projectKey: "pitch:pitch-1" }),
      ],
      projectByKey: new Map([
        ["pitch:pitch-1", makeProject({ id: "pitch-1", projectKey: "pitch:pitch-1", projectType: "pitch" })],
      ]),
      selectedBrandProjectKeys: new Set(),
      filters: { brandIds: [], projectIds: [], projectTypeScope: "all" },
    });

    expect(employeeIds).toBeNull();
  });

  it("returns null when no brand or project filter is active", () => {
    const employeeIds = getMatchingTimelineEmployeeIds({
      dateFilteredAssignments: [makeAssignment({ employeeId: "employee-1" })],
      projectByKey: new Map([["campaign:project-1", makeProject({ id: "project-1", brandId: "brand-1" })]]),
      selectedBrandProjectKeys: new Set(),
      filters: { brandIds: [], projectIds: [] },
    });

    expect(employeeIds).toBeNull();
  });

  it("matches brand resources from visible planned assignments", () => {
    const employeeIds = getMatchingTimelineEmployeeIds({
      dateFilteredAssignments: [
        makeAssignment({ id: "planned-brand", employeeId: "employee-planned", projectKey: "campaign:project-brand" }),
        makeAssignment({ id: "planned-other", employeeId: "employee-other", projectKey: "campaign:project-other" }),
      ],
      projectByKey: new Map([
        ["campaign:project-brand", makeProject({ id: "project-brand", projectKey: "campaign:project-brand", brandId: "brand-1" })],
        ["campaign:project-other", makeProject({ id: "project-other", projectKey: "campaign:project-other", brandId: "brand-2" })],
      ]),
      selectedBrandProjectKeys: new Set(),
      filters: { brandIds: ["brand-1"], projectIds: [] },
    });

    expect(Array.from(employeeIds ?? []).sort()).toEqual(["employee-planned"]);
  });

  it("matches brand resources when the selected brand project is missing from the generic project map", () => {
    const employeeIds = getMatchingTimelineEmployeeIds({
      dateFilteredAssignments: [
        makeAssignment({
          id: "planned-brand",
          employeeId: "employee-planned",
          projectKey: "campaign:project-from-brand-summary",
        }),
      ],
      projectByKey: new Map(),
      selectedBrandProjectKeys: new Set(["campaign:project-from-brand-summary"]),
      filters: { brandIds: ["brand-1"], projectIds: [] },
    });

    expect(Array.from(employeeIds ?? []).sort()).toEqual(["employee-planned"]);
  });

  it("matches project resources from visible planned assignments", () => {
    // projectIds are project.id (UUID); source resolves them via projectByKey
    const employeeIds = getMatchingTimelineEmployeeIds({
      dateFilteredAssignments: [
        makeAssignment({ id: "planned-match", employeeId: "employee-planned", projectKey: "campaign:project-1" }),
        makeAssignment({ id: "planned-other", employeeId: "employee-other", projectKey: "campaign:project-2" }),
      ],
      projectByKey: new Map([
        ["campaign:project-1", makeProject({ id: "project-1", projectKey: "campaign:project-1" })],
        ["campaign:project-2", makeProject({ id: "project-2", projectKey: "campaign:project-2" })],
      ]),
      selectedBrandProjectKeys: new Set(),
      filters: { brandIds: [], projectIds: ["project-1"] },
    });

    expect(Array.from(employeeIds ?? []).sort()).toEqual(["employee-planned"]);
  });

  it("intersects brand and project filters when both are selected", () => {
    const employeeIds = getMatchingTimelineEmployeeIds({
      dateFilteredAssignments: [
        makeAssignment({ id: "brand-and-project", employeeId: "employee-match", projectKey: "campaign:project-1" }),
        makeAssignment({ id: "brand-only", employeeId: "employee-brand-only", projectKey: "campaign:project-2" }),
        makeAssignment({ id: "project-only", employeeId: "employee-project-only", projectKey: "campaign:project-3" }),
      ],
      projectByKey: new Map([
        ["campaign:project-1", makeProject({ id: "project-1", projectKey: "campaign:project-1", brandId: "brand-1" })],
        ["campaign:project-2", makeProject({ id: "project-2", projectKey: "campaign:project-2", brandId: "brand-1" })],
        ["campaign:project-3", makeProject({ id: "project-3", projectKey: "campaign:project-3", brandId: "brand-2" })],
      ]),
      selectedBrandProjectKeys: new Set(["campaign:project-1", "campaign:project-2"]),
      filters: { brandIds: ["brand-1"], projectIds: ["project-1"] },
    });

    expect(Array.from(employeeIds ?? [])).toEqual(["employee-match"]);
  });

  // --- Multi-select tests ---

  it("multi-brand union: returns employees from either selected brand", () => {
    const employeeIds = getMatchingTimelineEmployeeIds({
      dateFilteredAssignments: [
        makeAssignment({ id: "a1", employeeId: "employee-a", projectKey: "campaign:project-brand1" }),
        makeAssignment({ id: "a2", employeeId: "employee-b", projectKey: "campaign:project-brand2" }),
        makeAssignment({ id: "a3", employeeId: "employee-c", projectKey: "campaign:project-other" }),
      ],
      projectByKey: new Map([
        ["campaign:project-brand1", makeProject({ id: "project-brand1", projectKey: "campaign:project-brand1", brandId: "brand-1" })],
        ["campaign:project-brand2", makeProject({ id: "project-brand2", projectKey: "campaign:project-brand2", brandId: "brand-2" })],
        ["campaign:project-other", makeProject({ id: "project-other", projectKey: "campaign:project-other", brandId: "brand-3" })],
      ]),
      selectedBrandProjectKeys: new Set(),
      filters: { brandIds: ["brand-1", "brand-2"], projectIds: [] },
    });

    expect(Array.from(employeeIds ?? []).sort()).toEqual(["employee-a", "employee-b"]);
  });

  it("multi-project union: returns employees from either selected project", () => {
    const employeeIds = getMatchingTimelineEmployeeIds({
      dateFilteredAssignments: [
        makeAssignment({ id: "p1", employeeId: "employee-a", projectKey: "campaign:project-1" }),
        makeAssignment({ id: "p2", employeeId: "employee-b", projectKey: "campaign:project-2" }),
        makeAssignment({ id: "p3", employeeId: "employee-c", projectKey: "campaign:project-3" }),
      ],
      projectByKey: new Map([
        ["campaign:project-1", makeProject({ id: "project-1", projectKey: "campaign:project-1" })],
        ["campaign:project-2", makeProject({ id: "project-2", projectKey: "campaign:project-2" })],
        ["campaign:project-3", makeProject({ id: "project-3", projectKey: "campaign:project-3" })],
      ]),
      selectedBrandProjectKeys: new Set(),
      filters: { brandIds: [], projectIds: ["project-1", "project-2"] },
    });

    expect(Array.from(employeeIds ?? []).sort()).toEqual(["employee-a", "employee-b"]);
  });

  it("brand∩project intersection: only returns employee on both a selected brand AND selected project", () => {
    const employeeIds = getMatchingTimelineEmployeeIds({
      dateFilteredAssignments: [
        makeAssignment({ id: "both", employeeId: "employee-match", projectKey: "campaign:project-1" }),
        makeAssignment({ id: "brand-only", employeeId: "employee-brand-only", projectKey: "campaign:project-2" }),
      ],
      projectByKey: new Map([
        ["campaign:project-1", makeProject({ id: "project-1", projectKey: "campaign:project-1", brandId: "brand-1" })],
        ["campaign:project-2", makeProject({ id: "project-2", projectKey: "campaign:project-2", brandId: "brand-1" })],
      ]),
      selectedBrandProjectKeys: new Set(),
      filters: { brandIds: ["brand-1"], projectIds: ["project-1"] },
    });

    expect(Array.from(employeeIds ?? []).sort()).toEqual(["employee-match"]);
  });
});
