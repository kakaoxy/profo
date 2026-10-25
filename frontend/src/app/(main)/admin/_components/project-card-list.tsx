import type { components } from "@/lib/api-types";
import { ProjectCardClient } from "./project-card-client";

type ProjectResponse = components["schemas"]["ProjectResponse"];
type CommunityMarketStatsResponse = components["schemas"]["CommunityMarketStatsResponse"];

export interface MarketDataMap {
  [communityId: string]: CommunityMarketStatsResponse | null;
}

interface ProjectCardListProps {
  projects: ProjectResponse[];
  marketDataMap: MarketDataMap;
  /**
   * 布局模式：
   * - `rail`（默认）旧版 LegacyDashboard 的横向卡流（固定 280px 宽 + 横滚）
   * - `grid` 新版工作台 monitor_projects widget 的等宽网格（设计稿 `.monitor-row.as-grid`）
   */
  layout?: "rail" | "grid";
}

export async function ProjectCardList({
  projects,
  marketDataMap,
  layout = "rail",
}: ProjectCardListProps) {
  return (
    <>
      {projects.map((project) => (
        <div
          key={project.id}
          className={layout === "grid" ? "min-w-0" : "w-full sm:w-[280px] sm:shrink-0"}
        >
          <ProjectCardClient
            project={project}
            marketData={project.community_id ? marketDataMap[project.community_id] : null}
          />
        </div>
      ))}
    </>
  );
}
