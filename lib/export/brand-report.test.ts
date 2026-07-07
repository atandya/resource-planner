import { describe, it, expect } from "vitest";
import { buildBrandReportRows, type BrandReportInput } from "@/lib/export/brand-report";

const emptyDirectory = {
  projects: [] as BrandReportInput["projects"],
  employees: [] as BrandReportInput["employees"],
  brands: [] as BrandReportInput["brands"],
};

describe("buildBrandReportRows", () => {
  it("rolls hours up to one row per brand+employee, split by project type", () => {
    const input: BrandReportInput = {
      engagements: [
        { assignment_uuid: "a1", employee_uuid: "e1", project_key: "campaign:p1" },
        { assignment_uuid: "a2", employee_uuid: "e1", project_key: "pitch:p2" },
      ],
      allocations: [
        { assignment_uuid: "a1", planned_hours: 100 },
        { assignment_uuid: "a1", planned_hours: 20.5 },
        { assignment_uuid: "a2", planned_hours: 30 },
      ],
      projects: [
        { projectKey: "campaign:p1", brandId: "b1", brandName: "BAF", sourceType: "campaign" },
        { projectKey: "pitch:p2", brandId: "b1", brandName: "BAF", sourceType: "pitch" },
      ],
      employees: [{ employeeUuid: "e1", fullName: "Andi" }],
      brands: [{ brandId: "b1", name: "BAF" }],
    };
    expect(buildBrandReportRows(input)).toEqual([
      { brand: "BAF", employee: "Andi", campaignHours: 120.5, pitchHours: 30, otherHours: 0, totalHours: 150.5 },
    ]);
  });

  it("puts hours from an unresolved project type into otherHours", () => {
    const input: BrandReportInput = {
      engagements: [{ assignment_uuid: "a1", employee_uuid: "e1", project_key: "excel:p1" }],
      allocations: [{ assignment_uuid: "a1", planned_hours: 15 }],
      projects: [{ projectKey: "excel:p1", brandId: "b1", brandName: "BAF", sourceType: null }],
      employees: [{ employeeUuid: "e1", fullName: "Andi" }],
      brands: [{ brandId: "b1", name: "BAF" }],
    };
    expect(buildBrandReportRows(input)).toEqual([
      { brand: "BAF", employee: "Andi", campaignHours: 0, pitchHours: 0, otherHours: 15, totalHours: 15 },
    ]);
  });

  it("drops employees whose total hours in range is zero", () => {
    const input: BrandReportInput = {
      ...emptyDirectory,
      engagements: [{ assignment_uuid: "a1", employee_uuid: "e1", project_key: "campaign:p1" }],
      allocations: [],
      projects: [{ projectKey: "campaign:p1", brandId: "b1", brandName: "BAF", sourceType: "campaign" }],
      employees: [{ employeeUuid: "e1", fullName: "Andi" }],
      brands: [{ brandId: "b1", name: "BAF" }],
    };
    expect(buildBrandReportRows(input)).toEqual([]);
  });

  it("honors the brand id filter", () => {
    const input: BrandReportInput = {
      engagements: [
        { assignment_uuid: "a1", employee_uuid: "e1", project_key: "campaign:p1" },
        { assignment_uuid: "a2", employee_uuid: "e1", project_key: "campaign:p2" },
      ],
      allocations: [
        { assignment_uuid: "a1", planned_hours: 10 },
        { assignment_uuid: "a2", planned_hours: 20 },
      ],
      projects: [
        { projectKey: "campaign:p1", brandId: "b1", brandName: "BAF", sourceType: "campaign" },
        { projectKey: "campaign:p2", brandId: "b2", brandName: "Pegadaian", sourceType: "campaign" },
      ],
      employees: [{ employeeUuid: "e1", fullName: "Andi" }],
      brands: [{ brandId: "b1", name: "BAF" }, { brandId: "b2", name: "Pegadaian" }],
      brandIdFilter: ["b1"],
    };
    expect(buildBrandReportRows(input)).toEqual([
      { brand: "BAF", employee: "Andi", campaignHours: 10, pitchHours: 0, otherHours: 0, totalHours: 10 },
    ]);
  });
});
