// Query key factory for type-safe query keys
export const queryKeys = {
  // Business Units
  businessUnits: ["business-units"] as const,
  businessUnit: (id: string) => ["business-units", id] as const,

  // Departments
  departments: ["departments"] as const,
  department: (id: string) => ["departments", id] as const,

  // Brands
  brands: ["brands"] as const,
  brandsInfinite: ["brands", "infinite"] as const,
  brand: (id: string) => ["brands", id] as const,

  // Employees
  employees: ["employees"] as const,
  employeesInfinite: ["employees", "infinite"] as const,
  employee: (id: string) => ["employees", id] as const,
  employeeBrands: (employeeId: string) => ["employees", employeeId, "brands"] as const,

  // Project Categories
  projectCategories: ["project-categories"] as const,
  projectCategory: (id: string) => ["project-categories", id] as const,

  // Projects
  projects: ["projects"] as const,
  projectsInfinite: ["projects", "infinite"] as const,
  project: (id: string) => ["projects", id] as const,
  projectsByBrand: (brandId: string) => ["projects", "brand", brandId] as const,
  projectDetail: (type: "campaign" | "pitch", id: string) =>
    ["projects", "detail", type, id] as const,

  // Channel Classifications
  channelClassifications: ["channel-classifications"] as const,
  channelClassification: (id: string) => ["channel-classifications", id] as const,

  // Deliverables
  deliverables: ["deliverables"] as const,
  deliverable: (id: string) => ["deliverables", id] as const,
  deliverablesByChannel: (channelId: string) => ["deliverables", "channel", channelId] as const,
  deliverablesByProject: (type: string, id: string) => ["deliverables", "project", type, id] as const,

  // Assignments
  assignments: ["assignments"] as const,
  assignmentsByProject: (projectId: string) => ["assignments", "project", projectId] as const,
  assignmentsByEmployee: (employeeId: string) => ["assignments", "employee", employeeId] as const,

  // Planner timeline
  plannerHomeBootstrap: ["planner-home-bootstrap"] as const,
  plannerTimeline: ["planner-timeline"] as const,
  plannerFilterBrands: ["planner-filter-brands"] as const,
  plannerFilterProjects: ["planner-filter-projects"] as const,
  plannerFilterBrandsInfinite: ["planner-filter-brands", "infinite"] as const,
  plannerFilterProjectsInfinite: ["planner-filter-projects", "infinite"] as const,
} as const;
