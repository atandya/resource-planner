import type { ProjectOption } from "@/lib/query/hooks/useProjects";
import { plannerDirectoryRepository } from "@/lib/planner-directory/repository";

const DEFAULT_PAGE_SIZE = 100;

export type ProjectSummaryResult = {
  data: ProjectOption[];
  hasMore: boolean;
  truncated: boolean;
};

function toProjectOption(project: Awaited<ReturnType<typeof plannerDirectoryRepository.listProjects>>[number]): ProjectOption {
  return {
    id: project.sourceProjectId,
    projectKey: `${project.sourceType}:${project.sourceProjectId}`,
    name: project.name,
    brandId: project.brandId,
    color: project.color ?? "#64748b",
    status:
      project.status === "completed" ||
      project.status === "cancelled" ||
      project.status === "active" ||
      project.status === "planning" ||
      project.status === "on_hold"
        ? project.status
        : "planning",
    projectType: project.sourceType,
    startDate: project.startDate,
    endDate: project.endDate,
    submitDate: project.submitDate,
  };
}

export async function fetchProjectSummaries({
  brandId,
  search,
  pageSize = DEFAULT_PAGE_SIZE,
  maxPagesPerSource = 1,
}: {
  brandId?: string;
  search?: string;
  pageSize?: number;
  maxPagesPerSource?: number;
}): Promise<ProjectSummaryResult> {
  const projects = await plannerDirectoryRepository.listProjects();
  const query = search?.trim().toLowerCase();

  const filtered = projects.filter((project) => {
    if (brandId && project.brandId !== brandId) return false;
    if (!query) return true;
    return project.name.toLowerCase().includes(query);
  });

  const limit = Math.max(pageSize * Math.max(maxPagesPerSource, 1), 1);
  const sliced = filtered.slice(0, limit);

  return {
    data: sliced.map(toProjectOption),
    hasMore: filtered.length > sliced.length,
    truncated: filtered.length > sliced.length,
  };
}
