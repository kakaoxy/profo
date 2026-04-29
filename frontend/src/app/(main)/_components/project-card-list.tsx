import type { components } from "@/lib/api-types";
import { ProjectCardClient } from "./project-card-client";

type ProjectResponse = components["schemas"]["ProjectResponse"];
type CommunityMarketStatsResponse =
  components["schemas"]["CommunityMarketStatsResponse"];

export interface MarketDataMap {
  [communityId: string]: CommunityMarketStatsResponse | null;
}

interface ProjectCardListProps {
  projects: ProjectResponse[];
  marketDataMap: MarketDataMap;
}

export async function ProjectCardList({
  projects,
  marketDataMap,
}: ProjectCardListProps) {
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
