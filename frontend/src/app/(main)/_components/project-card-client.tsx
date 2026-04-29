"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { MoreHorizontal, MapPin, Home } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { components } from "@/lib/api-types";
import { MarketDataSection } from "./market-data-section";
import { ProjectDetailSheet } from "../projects/_components/project-detail-sheet";
import { ProjectStatsSection } from "./project-stats-section";
import {
  mapProjectResponseToProject,
  validateSalesRecords,
} from "./project-card-utils";
import { getStatusLabel, getProjectStatusClassName, DEFAULT_STATUS } from "@/lib/status-colors";

type ProjectResponse = components["schemas"]["ProjectResponse"];
type CommunityMarketStatsResponse =
  components["schemas"]["CommunityMarketStatsResponse"];

interface ProjectCardClientProps {
  project: ProjectResponse;
  marketData: CommunityMarketStatsResponse | null;
}

export function ProjectCardClient({
  project,
  marketData,
}: ProjectCardClientProps) {
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const contractNo = project.contract_no || "N/A";
  const communityName = project.community_name || "未命名项目";
  const address = project.address || "地址未填写";
  const layout = project.layout || "-";
  const area = project.area ? `${project.area}㎡` : "-";

  const hasCommunityId = !!project.community_id;

  const salesRecords = validateSalesRecords(project.sales_records);
  const projectData = mapProjectResponseToProject(project);

  const status = project.status || DEFAULT_STATUS;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ scale: 1.01 }}
        onClick={() => setIsDetailOpen(true)}
        className="bg-card rounded-xl border border-border shadow-card overflow-hidden flex flex-col hover:border-primary/40 transition-all group cursor-pointer"
      >
        <div className="p-4 border-b border-border bg-muted">
          <div className="flex justify-between items-start mb-1">
            <span className="text-[10px] text-primary font-bold bg-primary/10 px-2 py-0.5 rounded">
              #{contractNo}
            </span>
            <MoreHorizontal className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
          <h4 className="text-lg font-semibold text-foreground truncate">
            {communityName}
          </h4>
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
            <MapPin className="w-3 h-3" />
            {address}
          </p>
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
            <Home className="w-3 h-3" />
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
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3 block">
              市场数据
            </span>
            <MarketDataSection
              hasCommunityId={hasCommunityId}
              isLoading={false}
              marketData={marketData}
            />
          </div>
        </div>
      </motion.div>

      <ProjectDetailSheet
        project={projectData}
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
      />
    </>
  );
}
