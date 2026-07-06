import { describe, expect, it } from "vitest";
import type { Assignment } from "@/lib/query/hooks/useAssignments";
import type { ProjectOption } from "@/lib/query/hooks/useProjects";
import { orderProjectLanes } from "@/lib/timeline-v2/lane-order";
import { sortResourceProjects } from "@/lib/timeline-v2/resource-project-model";

const project = (id: string, brandId: string | null = null): ProjectOption => ({
  id,
  name: `Project ${id}`,
  color: "#2563eb",
  status: "active",
  projectType: "campaign",
  brandId,
  startDate: null,
  endDate: null,
});

const assignment = (overrides: Partial<Assignment>): Assignment => ({
  id: overrides.id ?? "assignment-1",
  employeeId: overrides.employeeId ?? "employee-1",
  projectId: overrides.projectId ?? "project-1",
  taskId: null,
  startDate: overrides.startDate ?? "2026-06-01",
  endDate: overrides.endDate ?? "2026-06-05",
  hoursPerDay: "8",
  totalHours: null,
  allocationPercentage: null,
  isTimeOff: overrides.isTimeOff ?? false,
  isAdjustment: false,
  timeOffTypeId: null,
  category: "Other",
  isBillable: true,
  status: "draft",
  note: null,
  createdById: null,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
});

const lane = (laneProject: ProjectOption, planAssignments: Assignment[] = []) => ({
  id: `lane-${laneProject.id}`,
  project: laneProject,
  planAssignments,
});

function dateRange(startDay: number, endDay: number) {
  const dates: Date[] = [];

  for (let day = startDay; day <= endDay; day += 1) {
    dates.push(new Date(`2026-06-${String(day).padStart(2, "0")}T00:00:00`));
  }

  return dates;
}

describe("timeline-v2 lane order", () => {
  it("emits lanes in the exact order sortResourceProjects produces for the same inputs", () => {
    const projects = [
      project("project-a", "brand-1"),
      project("project-b", "brand-2"),
      project("project-c", "brand-1"),
    ];
    const resourceAssignments = [
      // project-c active inside the visible window → sorts ahead of inactive ones
      assignment({ id: "c-active", projectId: "project-c", startDate: "2026-06-03", endDate: "2026-06-05" }),
      // project-a outside the window, later start than project-b
      assignment({ id: "a-late", projectId: "project-a", startDate: "2026-07-10", endDate: "2026-07-12" }),
      assignment({ id: "b-early", projectId: "project-b", startDate: "2026-07-01", endDate: "2026-07-02" }),
    ];
    const days = dateRange(1, 18);

    const expectedOrder = sortResourceProjects({
      projects,
      resourceAssignments,
      brandIds: ["brand-2"],
      selectedProjectIds: [],
      days,
    }).map((item) => item.id);

    const ordered = orderProjectLanes({
      lanes: projects.map((item) => lane(item)),
      resourceAssignments,
      brandIds: ["brand-2"],
      projectIds: [],
      days,
    });

    expect(ordered.map((item) => item.project.id)).toEqual(expectedOrder);
    // Sanity: the sort actually reordered something, so the cross-check is meaningful.
    expect(expectedOrder).not.toEqual(projects.map((item) => item.id));
  });

  it("flags lanes whose project brand matches the brand filter", () => {
    const ordered = orderProjectLanes({
      lanes: [
        lane(project("project-a", "brand-1")),
        lane(project("project-b", "brand-2")),
      ],
      resourceAssignments: [],
      brandIds: ["brand-1"],
      projectIds: [],
      days: dateRange(1, 5),
    });

    const byId = new Map(ordered.map((item) => [item.project.id, item.isHighlighted]));
    expect(byId.get("project-a")).toBe(true);
    expect(byId.get("project-b")).toBe(false);
  });

  it("flags the lane whose project matches the project filter", () => {
    const ordered = orderProjectLanes({
      lanes: [
        lane(project("project-a", "brand-1")),
        lane(project("project-b", "brand-1")),
      ],
      resourceAssignments: [],
      brandIds: [],
      projectIds: ["project-b"],
      days: dateRange(1, 5),
    });

    const byId = new Map(ordered.map((item) => [item.project.id, item.isHighlighted]));
    expect(byId.get("project-b")).toBe(true);
    expect(byId.get("project-a")).toBe(false);
  });

  it("keeps insertion order and produces no highlights when filters are null", () => {
    const sharedProject = project("project-a", "brand-1");
    const lanes = [
      { ...lane(sharedProject), id: "lane-1" },
      { ...lane(sharedProject), id: "lane-2" },
      { ...lane(sharedProject), id: "lane-3" },
    ];

    const ordered = orderProjectLanes({
      lanes,
      resourceAssignments: [],
      brandIds: [],
      projectIds: [],
      days: dateRange(1, 5),
    });

    expect(ordered.map((item) => item.id)).toEqual(["lane-1", "lane-2", "lane-3"]);
    expect(ordered.every((item) => item.isHighlighted === false)).toBe(true);
  });

  it("hides lanes outside the project type scope", () => {
    const pitchProject: ProjectOption = { ...project("pitch-a"), projectType: "pitch" };
    const lanes = [
      lane(project("project-a", "brand-1")),
      lane(pitchProject),
    ];

    const pitchOnly = orderProjectLanes({
      lanes,
      resourceAssignments: [],
      brandIds: [],
      projectIds: [],
      projectTypeScope: "pitch",
      days: dateRange(1, 5),
    });
    expect(pitchOnly.map((item) => item.project.id)).toEqual(["pitch-a"]);

    const campaignOnly = orderProjectLanes({
      lanes,
      resourceAssignments: [],
      brandIds: [],
      projectIds: [],
      projectTypeScope: "campaign",
      days: dateRange(1, 5),
    });
    expect(campaignOnly.map((item) => item.project.id)).toEqual(["project-a"]);

    const both = orderProjectLanes({
      lanes,
      resourceAssignments: [],
      brandIds: [],
      projectIds: [],
      projectTypeScope: "all",
      days: dateRange(1, 5),
    });
    expect(both.map((item) => item.project.id)).toEqual(["project-a", "pitch-a"]);
  });

  it("preserves lane payload fields alongside the highlight flag", () => {
    const ordered = orderProjectLanes({
      lanes: [
        {
          ...lane(project("project-a", "brand-1"), [assignment({ id: "plan-1", projectId: "project-a" })]),
          extra: "payload",
        },
      ],
      resourceAssignments: [],
      brandIds: [],
      projectIds: [],
      days: dateRange(1, 5),
    });

    expect(ordered[0].extra).toBe("payload");
    expect(ordered[0].planAssignments.map((item) => item.id)).toEqual(["plan-1"]);
  });
});
