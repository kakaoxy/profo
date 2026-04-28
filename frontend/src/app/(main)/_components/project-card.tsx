"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { MoreHorizontal, MapPin, Home } from "lucide-react";
import type { components } from "@/lib/api-types";
import { MarketDataSection } from "./market-data-section";
import { ProjectDetailSheet } from "../projects/_components/project-detail-sheet";
import { ProjectStatsSection } from "./project-stats-section";
import { useMarketData } from "./use-market-data";
import { mapProjectResponseToProject, statusMap } from "./project-card-utils";

type ProjectResponse = components["schemas"]["ProjectResponse"];
type ApiSalesRecord = {
  id: string;
  record_type: string;
  price?: string | null;
  record_date: string;
  customer_name?: string | null;
  notes?: string | null;
};

interface ProjectCardProps {
  project: ProjectResponse;
}

export function ProjectCard({ project }: ProjectCardProps) {
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const { marketData, isLoading } = useMarketData(project.community_id);

  const contractNo = project.contract_no || "N/A";
  const communityName = project.community_name || "未命名项目";
  const address = project.address || "地址未填写";
  const layout = project.layout || "-";
  const area = project.area ? `${project.area}㎡` : "-";

  const statusInfo = statusMap[project.status] || { label: project.status, color: "bg-gray-100 text-gray-700" };
  const hasCommunityId = !!project.community_id;

  const salesRecords = (project.sales_records || []) as ApiSalesRecord[];
  const projectData = mapProjectResponseToProject(project);

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ scale: 1.01 }}
        onClick={() => setIsDetailOpen(true)}
        className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden flex flex-col hover:border-primary/40 transition-all group cursor-pointer"
      >
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex justify-between items-start mb-1">
            <span className="text-[10px] text-primary font-bold bg-primary/10 px-2 py-0.5 rounded">
              #{contractNo}
            </span>
            <MoreHorizontal className="w-4 h-4 text-slate-300 group-hover:text-primary transition-colors" />
          </div>
          <h4 className="text-lg font-semibold text-on-surface truncate">
            {communityName}
          </h4>
          <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
            <MapPin className="w-3 h-3" />
            {address}
          </p>
          <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
            <Home className="w-3 h-3" />
            {layout} · {area}
          </p>
        </div>

        <div className="p-4 flex-1 flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 block">
              项目动态 STATS
            </span>
            <ProjectStatsSection salesRecords={salesRecords} />
          </div>

          <div className="py-2">
            <div className="border-t border-dashed border-slate-200"></div>
          </div>

          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 block">
              市场数据 MARKET
            </span>
            <MarketDataSection
              hasCommunityId={hasCommunityId}
              isLoading={isLoading}
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
