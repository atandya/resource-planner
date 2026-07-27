import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    session: {
      access: { can_view_all: true },
      employee: { uuid: "employee-1" },
    },
  }),
}));

vi.mock("@/lib/query/hooks", () => ({
  useBrands: () => ({ data: [], isLoading: false }),
  useEmployees: () => ({ data: [], isLoading: false }),
  usePlannerTimeline: () => ({
    data: { assignments: [], actualAssignments: [] },
    isFetching: false,
    isRefetchError: false,
    isShowingPreviousData: false,
  }),
  useProjectsByBrand: () => ({ data: [], isLoading: false }),
  useProjectOptions: () => ({ data: [], isLoading: false }),
}));

// The timeline reads a single windowed bootstrap query (deep import path).
vi.mock("@/lib/query/hooks/usePlannerHomeBootstrap", () => ({
  usePlannerHomeBootstrapWindow: () => ({
    data: {
      employees: [],
      employeeTotal: 0,
      departmentsById: {},
      brandsById: {},
      projectsById: {},
      plannerTimeline: {
        assignments: [],
        actualAssignments: [],
        request: {
          viewMode: "quarter",
          resolution: "month",
          startDate: "2026-04-01",
          endDate: "2026-06-30",
          filters: { category: null, status: null },
        },
      },
      metadataPartial: false,
      metadataFreshness: {
        state: "stale",
        lastSuccessfulSyncAt: null,
        latestSyncAt: null,
        stale: false,
        issueCount: 0,
      },
      freshness: {
        directoryFetchedAt: "2026-06-05T00:00:00.000Z",
        plannerFetchedAt: "2026-06-05T00:00:00.000Z",
      },
      request: {
        viewMode: "quarter",
        resolution: "month",
        startDate: "2026-04-01",
        endDate: "2026-06-30",
        filters: { category: null, status: null },
      },
    },
    isLoading: false,
    isFetching: false,
    isPlaceholderData: false,
    isRefetchError: false,
  }),
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: () => ({
    getVirtualItems: () => [],
    scrollToOffset: vi.fn(),
  }),
}));

vi.mock("@/components/timeline-v2/TimelineBody", () => ({
  TimelineBody: () => React.createElement("div", { "data-testid": "timeline-v2-body" }),
}));

vi.mock("@/components/timeline-v2/LoadingStates", () => ({
  TimelineInitialSkeleton: () => React.createElement("div", { "data-testid": "timeline-v2-initial-skeleton" }),
  TimelineEmptyState: () => React.createElement("div", { "data-testid": "timeline-v2-empty-state" }),
}));

describe("timeline-v2 render smoke test", () => {
  it("renders the planner shell without browser automation", async () => {
    const { Timeline } = await import("@/components/timeline-v2");
    const html = renderToStaticMarkup(
      React.createElement(Timeline, {
        initialTimelineAnchor: "2026-06-04",
        brandIds: [],
        departments: [],
        searchQuery: "",
        projectIds: [],
      })
    );

    expect(html).toContain("timeline-v2-root");
    expect(html).toContain("timeline-v2-header-controls");
    expect(html).toContain("timeline-v2-today-button");
    expect(html).toContain("timeline-v2-initial-skeleton");
    expect(html).not.toContain("Directory sync is stale.");
    expect(html).not.toContain("Directory sync is unavailable.");
  });
});
