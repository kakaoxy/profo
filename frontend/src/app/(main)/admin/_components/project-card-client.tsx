"use client";

import { useState, useCallback } from "react";
import { MoreHorizontal, MapPin, Home } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import type { components } from "@/lib/api-types";
import { MarketDataSection } from "./market-data-section";
import { ProjectDetailSheet } from "../projects/_components/project-detail-sheet";
import { updateProjectAction } from "../projects/actions/core";
import type { SigningMaterial } from "../projects/_components/project-detail/types";
import { ProjectStatsSection } from "./project-stats-section";
import { mapProjectResponseToProject } from "./project-card-utils";
import { validateSalesRecords } from "./project-card-types";
import type { Project } from "../projects/types/project";
import { getStatusLabel, getProjectStatusClassName, DEFAULT_STATUS } from "@/lib/status-colors";

type ProjectResponse = components["schemas"]["ProjectResponse"];
type CommunityMarketStatsResponse = components["schemas"]["CommunityMarketStatsResponse"];

interface ProjectCardClientProps {
  project: ProjectResponse;
  marketData: CommunityMarketStatsResponse | null;
}

export function ProjectCardClient({ project, marketData }: ProjectCardClientProps) {
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  // 用 state 缓存 projectData，只在打开抽屉时设置。
  // 避免每次渲染重新计算（新引用）导致 useProjectDetail 的 useEffect([initialProject]) 触发，
  // 进而 formKey 变化使 ProjectFormDialog 重新挂载、activeTab 重置。
  const [projectData, setProjectData] = useState<Project | null>(null);

  const handleUpdateAttachments = useCallback(
    async (attachments: SigningMaterial[]) => {
      const result = await updateProjectAction(project.id, {
        signing_materials: attachments.length
          ? attachments.map((a) => ({ ...a, size: a.size ?? 0 }))
          : null,
      });
      if (!result.success) {
        toast.error(result.message || "附件保存失败");
      }
    },
    [project.id],
  );

  const handleOpen = useCallback(() => {
    setProjectData(mapProjectResponseToProject(project));
    setIsDetailOpen(true);
  }, [project]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setProjectData(mapProjectResponseToProject(project));
        setIsDetailOpen(true);
      }
    },
    [project],
  );

  const contractNo = project.contract_no || "N/A";
  const communityName = project.community_name || "未命名项目";
  const address = project.address || "地址未填写";
  const layout = project.layout || "-";
  const area = project.area ? `${project.area}㎡` : "-";

  const hasCommunityId = !!project.community_id;

  const salesRecords = validateSalesRecords(project.sales_records);

  const status = project.status || DEFAULT_STATUS;

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        onKeyDown={handleKeyDown}
        aria-label={`查看项目 ${communityName} 详情`}
        className="w-full text-left bg-card rounded-xl border border-border shadow-card overflow-hidden flex flex-col hover:border-primary/40 hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-[border-color,transform,box-shadow] group cursor-pointer motion-safe:animate-fade-in-up"
      >
        <div className="p-4 border-b border-border bg-muted">
          <div className="flex justify-between items-start mb-1">
            <span className="text-[10px] text-primary font-bold bg-primary/10 px-2 py-0.5 rounded">
              #{contractNo}
            </span>
            <MoreHorizontal
              className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors"
              aria-hidden="true"
            />
          </div>
          <h3 className="text-lg font-semibold text-foreground truncate">{communityName}</h3>
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
            <MapPin className="w-3 h-3" aria-hidden="true" />
            {address}
          </p>
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
            <Home className="w-3 h-3" aria-hidden="true" />
            {layout} · {area}
          </p>
          <div className="mt-2">
            <Badge
              variant="secondary"
              className={`text-[10px] px-2 py-0 h-5 border-none rounded-md ${getProjectStatusClassName(status)}`}
            >
              {getStatusLabel(status)}
            </Badge>
          </div>
        </div>

        <div className="p-4 flex-1 flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3 block">
              项目动态
            </span>
            <ProjectStatsSection salesRecords={salesRecords} />
          </div>

          <div className="py-2">
            <div className="border-t border-dashed border-border"></div>
          </div>

          <div>
            <MarketDataSection
              hasCommunityId={hasCommunityId}
              isLoading={false}
              marketData={marketData}
            />
          </div>
        </div>
      </button>

      <ProjectDetailSheet
        project={projectData}
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        onUpdateAttachments={handleUpdateAttachments}
      />
    </>
  );
}
