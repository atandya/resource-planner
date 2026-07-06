import { describe, expect, it } from "vitest";
import type { Assignment } from "@/lib/query/hooks/useAssignments";
import type { Brand } from "@/lib/query/hooks/useBrands";
import type { Employee } from "@/lib/query/hooks/useEmployees";
import type { ProjectOption } from "@/lib/query/hooks/useProjects";
import {
  buildEmployeeRowModels,
  groupTimelineAssignmentsByEmployee,
} from "@/lib/timeline-v2/row-model";

const employee = (id: string, name: string): Employee => ({
  id,
  employeeNumber: null,
  fullName: name,
  nickname: name,
  email: null,
  photo: null,
  position: "Designer",
  departmentId: "dept-1",
  businessUnitId: null,
  directSupervisorId: null,
  weeklyCapacity: 40,
  workStartDate: null,
  dateOfBirth: null,
  employmentStatus: "active",
  visibility: "active",
  gender: null,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
  department: { id: "dept-1", name: "Creative", color: "#111827" },
  assignments: [],
  employeeBrandAssignments: [],
}) as Employee;

// June 2026 has 22 weekdays. 22 * 8h = 176h → exactly 8h per weekday.
const JUN_FULL_ALLOC = [{ month: "2026-06-01", plannedHours: 176, kind: "plan" as const }];
// 4h per weekday: 22 * 4 = 88h
const JUN_HALF_ALLOC = [{ month: "2026-06-01", plannedHours: 88, kind: "plan" as const }];

const assignment = (overrides: Partial<Assignment>): Assignment => ({
  id: overrides.id ?? "assignment-1",
  employeeId: overrides.employeeId ?? "employee-1",
  projectKey: overrides.projectKey ?? "campaign:project-1",
  startDate: overrides.startDate ?? "2026-06-01",
  endDate: overrides.endDate ?? "2026-06-05",
  status: "draft",
  note: overrides.note ?? null,
  allocations: overrides.allocations ?? JUN_FULL_ALLOC,
  createdBy: null,
  updatedBy: null,
});

const project = (id: string): ProjectOption => ({
  id,
  projectKey: `campaign:${id}`,
  name: `Project ${id}`,
  color: "#2563eb",
  status: "active",
  projectType: "campaign",
  brandId: "brand-1",
  startDate: null,
  endDate: null,
});

const brandById = new Map<string, Brand>([
  ["brand-1", { id: "brand-1", name: "Brand One", color: "#000000" } as Brand],
]);

function dateRange(startDay: number, endDay: number) {
  const dates: Date[] = [];

  for (let day = startDay; day <= endDay; day += 1) {
    dates.push(new Date(`2026-06-${String(day).padStart(2, "0")}T00:00:00`));
  }

  return dates;
}

describe("timeline-v2 row model", () => {
  it("groups assignments by employee", () => {
    const grouped = groupTimelineAssignmentsByEmployee([
      assignment({ id: "a", employeeId: "employee-1" }),
      assignment({ id: "b", employeeId: "employee-2" }),
      assignment({ id: "c", employeeId: "employee-1" }),
    ]);

    expect(grouped.get("employee-1")?.map((item) => item.id)).toEqual(["a", "c"]);
    expect(grouped.get("employee-2")?.map((item) => item.id)).toEqual(["b"]);
  });

  it("returns a map keyed by employee id, keeping employees without lanes", () => {
    const models = buildEmployeeRowModels({
      employees: [employee("employee-1", "Ada Lovelace"), employee("employee-2", "No Assignments")],
      assignments: [assignment({ id: "plan-1", employeeId: "employee-1", projectKey: "campaign:project-1" })],
      projects: [project("project-1")],
      brandById,
      days: dateRange(1, 18),
      viewMode: "month",
    });

    expect([...models.keys()]).toEqual(["employee-1", "employee-2"]);
    expect(models.get("employee-1")?.resource.name).toBe("Ada Lovelace");
    expect(models.get("employee-2")?.projectLanes).toEqual([]);
    expect(models.get("employee-2")?.allocationCells).toHaveLength(18);
  });

  it("builds lanes from planned assignments", () => {
    const models = buildEmployeeRowModels({
      employees: [employee("employee-1", "Ada Lovelace")],
      assignments: [
        assignment({ id: "plan-1", employeeId: "employee-1", projectKey: "campaign:project-1" }),
      ],
      projects: [project("project-1")],
      brandById,
      days: dateRange(1, 18),
      viewMode: "month",
    });

    const model = models.get("employee-1")!;
    expect(model.assignments.map((item) => item.id)).toEqual(["plan-1"]);
    expect(model.projectLanes.map((lane) => lane.projectKey)).toEqual(["campaign:project-1"]);
    expect(model.projectLanes[0].project.name).toBe("Project project-1");
    expect(model.projectLanes[0].planAssignments.map((item) => item.id)).toEqual(["plan-1"]);
    expect(model.projectLanes[0].brand?.name).toBe("Brand One");
  });

  it("builds lanes for pitch projects alongside campaigns", () => {
    const pitchProject: ProjectOption = {
      id: "pitch-1",
      projectKey: "pitch:pitch-1",
      name: "Pitch One",
      color: "#f59e0b",
      status: "active",
      projectType: "pitch",
      brandId: "brand-1",
      startDate: null,
      endDate: null,
    };

    const models = buildEmployeeRowModels({
      employees: [employee("employee-1", "Ada Lovelace")],
      assignments: [
        assignment({ id: "plan-1", employeeId: "employee-1", projectKey: "campaign:project-1" }),
        assignment({ id: "plan-2", employeeId: "employee-1", projectKey: "pitch:pitch-1" }),
      ],
      projects: [project("project-1"), pitchProject],
      brandById,
      days: dateRange(1, 18),
      viewMode: "month",
    });

    const lanes = models.get("employee-1")?.projectLanes ?? [];
    expect(lanes.map((lane) => lane.projectKey)).toEqual(["campaign:project-1", "pitch:pitch-1"]);
    expect(lanes[1].project.projectType).toBe("pitch");
    expect(lanes[1].planDisplaySegments.length).toBeGreaterThan(0);
  });

  it("keeps lanes in assignment insertion order without highlight flags", () => {
    const models = buildEmployeeRowModels({
      employees: [employee("employee-1", "Ada Lovelace")],
      assignments: [
        assignment({ id: "plan-1", employeeId: "employee-1", projectKey: "campaign:project-b" }),
        assignment({ id: "plan-2", employeeId: "employee-1", projectKey: "campaign:project-a", startDate: "2026-06-08", endDate: "2026-06-12" }),
      ],
      projects: [project("project-a"), project("project-b")],
      brandById,
      days: dateRange(1, 18),
      viewMode: "month",
    });

    const lanes = models.get("employee-1")?.projectLanes ?? [];
    expect(lanes.map((lane) => lane.projectKey)).toEqual(["campaign:project-b", "campaign:project-a"]);
    expect(lanes.every((lane) => !("isHighlighted" in lane))).toBe(true);
  });

  it("merges contiguous assignments into one display segment", () => {
    const first = assignment({ id: "plan-1", projectKey: "campaign:project-1", startDate: "2026-06-01", endDate: "2026-06-10" });
    const second = assignment({ id: "plan-2", projectKey: "campaign:project-1", startDate: "2026-06-11", endDate: "2026-06-18" });

    const models = buildEmployeeRowModels({
      employees: [employee("employee-1", "Ada Lovelace")],
      assignments: [first, second],
      projects: [project("project-1")],
      brandById,
      days: dateRange(1, 18),
      viewMode: "month",
    });

    const lane = models.get("employee-1")!.projectLanes[0];
    expect(lane.planAssignments).toEqual([first, second]);
    expect(lane.planDisplaySegments).toHaveLength(1);
    expect(lane.planDisplaySegments[0]).toMatchObject({
      startDate: "2026-06-01",
      endDate: "2026-06-18",
      sourceAssignment: first,
      assignments: [first, second],
    });
  });

  it("omits lanes when no display segment is visible in the range", () => {
    const models = buildEmployeeRowModels({
      employees: [employee("employee-1", "Ada Lovelace")],
      assignments: [
        assignment({
          id: "out-of-range",
          projectKey: "campaign:project-1",
          startDate: "2026-07-01",
          endDate: "2026-07-31",
          allocations: [{ month: "2026-07-01", plannedHours: 160, kind: "plan" }],
        }),
      ],
      projects: [project("project-1")],
      brandById,
      days: dateRange(1, 30),
      viewMode: "month",
    });

    const model = models.get("employee-1")!;
    expect(model.assignments.map((item) => item.id)).toEqual(["out-of-range"]);
    expect(model.projectLanes).toEqual([]);
  });

  it("prepares one allocation cell per visible day with plan percentage", () => {
    // Jun 1-3 (Mon-Wed): 88h over 22 weekdays = 4h per weekday → planPct = 4/8 = 0.5
    const models = buildEmployeeRowModels({
      employees: [employee("employee-1", "Ada Lovelace")],
      assignments: [
        assignment({
          id: "plan-1",
          projectKey: "campaign:project-1",
          startDate: "2026-06-01",
          endDate: "2026-06-03",
          allocations: JUN_HALF_ALLOC,
        }),
      ],
      projects: [project("project-1")],
      brandById,
      days: [
        new Date("2026-06-01T00:00:00"),
        new Date("2026-06-02T00:00:00"),
        new Date("2026-06-03T00:00:00"),
      ],
      viewMode: "month",
    });

    const cells = models.get("employee-1")!.allocationCells;
    expect(cells.map((cell) => cell.date)).toEqual(["2026-06-01", "2026-06-02", "2026-06-03"]);
    // 88h / 22 weekdays = 4h per day → planPct = 4/8 = 0.5 → "50%"
    cells.forEach((cell) => {
      expect(cell.model).toMatchObject({ kind: "allocation", planPct: 0.5, planLabel: "50%" });
    });
  });

  it("prepares allocation cells from only the current employee's data", () => {
    // employee-1: 176h over 22 weekdays = 8h/day → planPct = 8/8 = 1 → 100%
    // employee-2: 88h over 22 weekdays = 4h/day → planPct = 4/8 = 0.5 → 50%
    const models = buildEmployeeRowModels({
      employees: [employee("employee-1", "Ada Lovelace"), employee("employee-2", "Grace Hopper")],
      assignments: [
        assignment({ id: "plan-1", employeeId: "employee-1", projectKey: "campaign:project-1", startDate: "2026-06-01", endDate: "2026-06-01", allocations: JUN_FULL_ALLOC }),
        assignment({ id: "plan-2", employeeId: "employee-2", projectKey: "campaign:project-1", startDate: "2026-06-01", endDate: "2026-06-01", allocations: JUN_HALF_ALLOC }),
      ],
      projects: [project("project-1")],
      brandById: new Map(),
      days: [new Date("2026-06-01T00:00:00")],
      viewMode: "month",
    });

    expect(models.get("employee-1")!.allocationCells[0].model).toMatchObject({
      kind: "allocation",
      planPct: 1,
      planLabel: "100%",
    });
    expect(models.get("employee-2")!.allocationCells[0].model).toMatchObject({
      kind: "allocation",
      planPct: 0.5,
      planLabel: "50%",
    });
  });

  it("aggregates full calendar months for month-resolution views", () => {
    // Assignment with 88h allocated to June (= 4h per weekday across all 22 weekdays).
    // Quarter view: the Jun cell aggregates ALL 22 June weekdays from the dayMap.
    // Total = 22 * 4 = 88h. planPct = 88/160 = 0.55 → "55%".
    const models = buildEmployeeRowModels({
      employees: [employee("employee-1", "Ada Lovelace")],
      assignments: [
        assignment({
          id: "plan-1",
          projectKey: "campaign:project-1",
          startDate: "2026-06-01",
          endDate: "2026-06-30",
          allocations: [{ month: "2026-06-01", plannedHours: 88, kind: "plan" }],
        }),
      ],
      projects: [project("project-1")],
      brandById,
      days: [new Date("2026-04-01T00:00:00"), new Date("2026-05-01T00:00:00"), new Date("2026-06-01T00:00:00")],
      viewMode: "quarter",
    });

    const cells = models.get("employee-1")!.allocationCells;
    expect(cells[0].model).toEqual({ kind: "empty" }); // Apr: no assignments
    expect(cells[1].model).toEqual({ kind: "empty" }); // May: no assignments
    // Jun: 22 weekdays * 4h = 88h → 88/160 = 0.55 → "55%"
    expect(cells[2].model).toMatchObject({ kind: "allocation", planLabel: "55%" });
  });
});
