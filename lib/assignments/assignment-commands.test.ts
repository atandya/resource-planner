import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildAllocationRows } from "./assignment-commands";

describe("buildAllocationRows", () => {
  it("maps monthlyHours into sorted (month, plannedHours, kind) rows", () => {
    expect(buildAllocationRows({ "2026-05-01": 20, "2026-04-01": 10 }, "plan")).toEqual([
      { month: "2026-04-01", plannedHours: 10, kind: "plan" },
      { month: "2026-05-01", plannedHours: 20, kind: "plan" },
    ]);
  });
});

const query = vi.fn();
const release = vi.fn();

vi.mock("@/lib/mysql-assignments/db", () => ({
  assignmentsDb: { getConnection: () => Promise.resolve({ query, release }) },
}));

describe("removeAllocationMonth", () => {
  beforeEach(() => {
    query.mockReset();
    release.mockReset();
  });

  it("deletes the month and shrinks the span when other months remain", async () => {
    query.mockImplementation((sql: string) => {
      if (sql.startsWith("SELECT")) return Promise.resolve({ rows: [{ min_m: "2026-04-01", max_m: "2026-06-01" }] });
      return Promise.resolve({ rows: [] });
    });

    const { removeAllocationMonth } = await import("./assignment-commands");
    const result = await removeAllocationMonth("uuid-1", "2026-05-01", "plan");

    expect(result).toEqual({ engagementDeleted: false });
    expect(query).toHaveBeenCalledWith("BEGIN");
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM planner_assignment_allocations"),
      ["uuid-1", "2026-05-01", "plan"]
    );
    expect(query).toHaveBeenCalledWith(expect.stringContaining("UPDATE planner_assignments"), [
      "uuid-1",
      "2026-04-01",
      "2026-06-01",
    ]);
    expect(query).not.toHaveBeenCalledWith(expect.stringContaining("DELETE FROM planner_assignments"), expect.anything());
    expect(query).toHaveBeenCalledWith("COMMIT");
  });

  it("deletes the engagement when its last allocation is removed", async () => {
    query.mockImplementation((sql: string) => {
      if (sql.startsWith("SELECT")) return Promise.resolve({ rows: [{ min_m: null, max_m: null }] });
      return Promise.resolve({ rows: [] });
    });

    const { removeAllocationMonth } = await import("./assignment-commands");
    const result = await removeAllocationMonth("uuid-1", "2026-05-01", "plan");

    expect(result).toEqual({ engagementDeleted: true });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("DELETE FROM planner_assignments"), ["uuid-1"]);
    expect(query).not.toHaveBeenCalledWith(expect.stringContaining("UPDATE planner_assignments"), expect.anything());
    expect(query).toHaveBeenCalledWith("COMMIT");
  });

  it("rolls back on error", async () => {
    query.mockImplementation((sql: string) => {
      if (sql === "BEGIN") return Promise.resolve({ rows: [] });
      return Promise.reject(new Error("db exploded"));
    });

    const { removeAllocationMonth } = await import("./assignment-commands");
    await expect(removeAllocationMonth("uuid-1", "2026-05-01", "plan")).rejects.toThrow("db exploded");
    expect(query).toHaveBeenCalledWith("ROLLBACK");
  });

  it("rejects a malformed month without touching the db", async () => {
    const { removeAllocationMonth } = await import("./assignment-commands");
    await expect(removeAllocationMonth("uuid-1", "2026-05-15", "plan")).rejects.toThrow("month must be yyyy-MM-01");
    expect(query).not.toHaveBeenCalled();
  });
});
