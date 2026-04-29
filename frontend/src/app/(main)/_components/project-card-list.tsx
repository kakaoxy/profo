import type { components } from "@/lib/api-types";
import { batchGetMarketData } from "../_lib/market-data";
import { ProjectCardClient } from "./project-card-client";

type ProjectResponse = components["schemas"]["ProjectResponse"];

interface ProjectCardListProps {
  projects: ProjectResponse[];
}

export async function ProjectCardList({ projects }: ProjectCardListProps) {
  // 提取所有项目的社区ID
  const communityIds = projects.map((p) => p.community_id);

  // 批量获取所有市场数据
  const { data: marketDataMap } = await batchGetMarketData(communityIds);

  return (
    <>
      {projects.map((project) => (
        <div key={project.id} className="w-[280px] shrink-0">
          <ProjectCardClient
            project={project}
            marketData={
              project.community_id
                ? marketDataMap[project.community_id]
                : null
            }
          />
        </div>
      ))}
    </>
  );
}
