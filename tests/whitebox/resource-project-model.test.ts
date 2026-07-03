import { describe, expect, it } from "vitest";
import type { Assignment } from "@/lib/query/hooks/useAssignments";
import type { ProjectOption } from "@/lib/query/hooks/useProjects";
import {
  getResourceProjects,
  groupProjectsByDeliverable,
  isDeliverableGroupHighlighted,
  isProjectHighlighted,
  sortResourceProjects,
} from "@/lib/timeline-v2/resource-project-model";

function project(overrides: Partial<ProjectOption>): ProjectOption {
  return {
    id: overrides.id ?? "project-1",
    projectKey: overrides.projectKey ?? `campaign:${overrides.id ?? "project-1"}`,
    name: overrides.name ?? "Alpha",
    color: "#2563eb",
    status: "active",
    projectType: "campaign",
    brandId: overrides.brandId ?? null,
    startDate: null,
    endDate: null,
    ...overrides,
  };
}

function assignment(overrides: Partial<Assignment>): Assignment {
  return {
    id: overrides.id ?? "assignment-1",
    employeeId: overrides.employeeId ?? "emp-1",
    projectKey: overrides.projectKey ?? "campaign:project-1",
    startDate: overrides.startDate ?? "2026-05-18",
    endDate: overrides.endDate ?? "2026-05-18",
    status: "draft",
    note: overrides.note ?? null,
    allocations: overrides.allocations ?? [{ month: "2026-05-01", plannedHours: 160, kind: "plan" }],
    createdBy: null,
    updatedBy: null,
  };
}

describe("resource project model", () => {
  it("keeps only projects with assignments matching by projectKey", () => {
    const projects = [
      project({ id: "project-1", projectKey: "campaign:project-1" }),
      project({ id: "project-2", projectKey: "campaign:project-2" }),
    ];
    const resourceProjects = getResourceProjects(
      [assignment({ id: "a1", projectKey: "campaign:project-1" })],
      projects
    );

    expect(resourceProjects.map((item) => item.id)).toEqual(["project-1"]);
  });

  it("excludes projects with no assignments", () => {
    const projects = [
      project({ id: "project-1", projectKey: "campaign:project-1" }),
      project({ id: "project-2", projectKey: "campaign:project-2" }),
    ];
    const resourceProjects = getResourceProjects(
      [assignment({ id: "a1", projectKey: "campaign:project-1" })],
      projects
    );

    expect(resourceProjects).toHaveLength(1);
    expect(resourceProjects[0].id).toBe("project-1");
  });

  it("sorts brand matches before other projects", () => {
    const sorted = sortResourceProjects({
      projects: [
        project({ id: "project-1", projectKey: "campaign:project-1", name: "Alpha", brandId: "brand-b" }),
        project({ id: "project-2", projectKey: "campaign:project-2", name: "Beta", brandId: "brand-a" }),
      ],
      resourceAssignments: [
        assignment({ id: "a1", projectKey: "campaign:project-1" }),
        assignment({ id: "a2", projectKey: "campaign:project-2" }),
      ],
      brandIds: ["brand-a"],
      days: [new Date("2026-05-18T00:00:00")],
    });

    expect(sorted.map((item) => item.id)).toEqual(["project-2", "project-1"]);
  });

  it("sorts pitch projects after campaign projects", () => {
    const sorted = sortResourceProjects({
      projects: [
        project({ id: "pitch-1", projectKey: "pitch:pitch-1", name: "Alpha Pitch", projectType: "pitch" }),
        project({ id: "project-1", projectKey: "campaign:project-1", name: "Zeta Campaign" }),
      ],
      resourceAssignments: [
        assignment({ id: "a1", projectKey: "pitch:pitch-1" }),
        assignment({ id: "a2", projectKey: "campaign:project-1" }),
      ],
      brandIds: [],
      days: [new Date("2026-05-18T00:00:00")],
    });

    expect(sorted.map((item) => item.id)).toEqual(["project-1", "pitch-1"]);
  });

  it("keeps an explicitly selected pitch ahead of campaigns", () => {
    const sorted = sortResourceProjects({
      projects: [
        project({ id: "project-1", projectKey: "campaign:project-1", name: "Alpha Campaign" }),
        project({ id: "pitch-1", projectKey: "pitch:pitch-1", name: "Beta Pitch", projectType: "pitch" }),
      ],
      resourceAssignments: [
        assignment({ id: "a1", projectKey: "campaign:project-1" }),
        assignment({ id: "a2", projectKey: "pitch:pitch-1" }),
      ],
      brandIds: [],
      selectedProjectIds: ["pitch-1"],
      days: [new Date("2026-05-18T00:00:00")],
    });

    expect(sorted.map((item) => item.id)).toEqual(["pitch-1", "project-1"]);
  });

  it("sorts the selected project before selected brand matches and other projects", () => {
    const sorted = sortResourceProjects({
      projects: [
        project({ id: "project-1", projectKey: "campaign:project-1", name: "Alpha", brandId: "brand-a" }),
        project({ id: "project-2", projectKey: "campaign:project-2", name: "Beta", brandId: "brand-b" }),
        project({ id: "project-3", projectKey: "campaign:project-3", name: "Gamma", brandId: "brand-a" }),
      ],
      resourceAssignments: [
        assignment({ id: "a1", projectKey: "campaign:project-1" }),
        assignment({ id: "a2", projectKey: "campaign:project-2" }),
        assignment({ id: "a3", projectKey: "campaign:project-3" }),
      ],
      brandIds: ["brand-a"],
      selectedProjectIds: ["project-2"],
      days: [new Date("2026-05-18T00:00:00")],
    });

    expect(sorted.map((item) => item.id)).toEqual(["project-2", "project-1", "project-3"]);
  });

  it("highlights projects by selected project or selected brand", () => {
    expect(
      isProjectHighlighted(project({ id: "project-1", brandId: "brand-a" }), {
        selectedProjectIds: ["project-1"],
        selectedBrandIds: [],
      })
    ).toBe(true);

    expect(
      isProjectHighlighted(project({ id: "project-2", brandId: "brand-a" }), {
        selectedProjectIds: [],
        selectedBrandIds: ["brand-a"],
      })
    ).toBe(true);

    expect(
      isProjectHighlighted(project({ id: "project-3", brandId: "brand-b" }), {
        selectedProjectIds: ["project-1"],
        selectedBrandIds: ["brand-a"],
      })
    ).toBe(false);
  });

  it("highlights projects when project id is in a multi-value selectedProjectIds", () => {
    expect(
      isProjectHighlighted(project({ id: "project-2", brandId: null }), {
        selectedProjectIds: ["project-1", "project-2", "project-3"],
        selectedBrandIds: [],
      })
    ).toBe(true);

    expect(
      isProjectHighlighted(project({ id: "project-99", brandId: null }), {
        selectedProjectIds: ["project-1", "project-2", "project-3"],
        selectedBrandIds: [],
      })
    ).toBe(false);
  });

  it("highlights projects when project.brandId is in a multi-value selectedBrandIds", () => {
    expect(
      isProjectHighlighted(project({ id: "project-1", brandId: "brand-b" }), {
        selectedProjectIds: [],
        selectedBrandIds: ["brand-a", "brand-b", "brand-c"],
      })
    ).toBe(true);

    expect(
      isProjectHighlighted(project({ id: "project-2", brandId: null }), {
        selectedProjectIds: [],
        selectedBrandIds: ["brand-a", "brand-b"],
      })
    ).toBe(false);

    expect(
      isProjectHighlighted(project({ id: "project-3", brandId: "brand-z" }), {
        selectedProjectIds: [],
        selectedBrandIds: ["brand-a", "brand-b"],
      })
    ).toBe(false);
  });

  it("does not highlight when neither project id nor brand id matches", () => {
    expect(
      isProjectHighlighted(project({ id: "project-99", brandId: "brand-z" }), {
        selectedProjectIds: ["project-1", "project-2"],
        selectedBrandIds: ["brand-a", "brand-b"],
      })
    ).toBe(false);
  });

  it("highlights deliverable groups when any project row matches the active project or brand filter", () => {
    const groups = groupProjectsByDeliverable({
      sortedProjects: [
        project({ id: "project-1", projectKey: "campaign:project-1", name: "Alpha", brandId: "brand-a" }),
        project({ id: "project-2", projectKey: "campaign:project-2", name: "Beta", brandId: "brand-b" }),
      ],
      resourceAssignments: [
        assignment({ id: "brand-work", projectKey: "campaign:project-1", note: "Deliverables: Banner." }),
        assignment({ id: "other-work", projectKey: "campaign:project-2", note: "Deliverables: Banner." }),
      ],
    });

    const bannerGroup = groups.find((group) => group.name === "Banner");
    expect(bannerGroup).toBeDefined();
    expect(
      isDeliverableGroupHighlighted(bannerGroup!, {
        selectedProjectIds: [],
        selectedBrandIds: ["brand-a"],
      })
    ).toBe(true);
  });

  it("groups projects by deliverable notes with general first", () => {
    const groups = groupProjectsByDeliverable({
      sortedProjects: [project({ id: "project-1", projectKey: "campaign:project-1", name: "Alpha" })],
      resourceAssignments: [
        assignment({ id: "general", projectKey: "campaign:project-1", note: null }),
        assignment({ id: "named", projectKey: "campaign:project-1", note: "Deliverables: Banner, Landing Page." }),
      ],
    });

    expect(groups.map((group) => group.name)).toEqual([null, "Banner", "Landing Page"]);
    expect(groups[1].projects[0].planAssignments.map((item) => item.id)).toEqual(["named"]);
  });

  it("keeps all resource deliverables available even when one selected project is highlighted", () => {
    const groups = groupProjectsByDeliverable({
      sortedProjects: [
        project({ id: "project-selected", projectKey: "campaign:project-selected", name: "Selected Project", brandId: "brand-a" }),
        project({ id: "project-other", projectKey: "campaign:project-other", name: "Other Project", brandId: "brand-b" }),
      ],
      resourceAssignments: [
        assignment({
          id: "selected-deliverable",
          projectKey: "campaign:project-selected",
          note: "Deliverables: Landing Page.",
        }),
        assignment({
          id: "other-deliverable",
          projectKey: "campaign:project-other",
          note: "Deliverables: Banner.",
        }),
      ],
    });

    expect(groups.map((group) => group.name)).toEqual(["Banner", "Landing Page"]);
    expect(
      groups.some((group) =>
        isDeliverableGroupHighlighted(group, {
          selectedProjectIds: ["project-selected"],
          selectedBrandIds: [],
        })
      )
    ).toBe(true);
  });
});
