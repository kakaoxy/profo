"use client";

import { useRouter } from "next/navigation";
import { MapPin, Home } from "lucide-react";
import type { components } from "@/lib/api-types";
import { MarketDataSection } from "./market-data-section";
import { ProjectStatsSection } from "./project-stats-section";
import { validateSalesRecords } from "./project-card-types";
import { getStatusLabel, getProjectStatusClassName, DEFAULT_STATUS } from "@/lib/status-colors";

type ProjectResponse = components["schemas"]["ProjectResponse"];
type CommunityMarketStatsResponse = components["schemas"]["CommunityMarketStatsResponse"];

interface ProjectCardClientProps {
  project: ProjectResponse;
  marketData: CommunityMarketStatsResponse | null;
}

/** 工作台「重点监控项目」卡片（Steep m-card 结构：单色洗底徽章 + 虚线分隔 + 双段信息，设计稿决策 08） */
export function ProjectCardClient({ project, marketData }: ProjectCardClientProps) {
  const router = useRouter();

  const contractNo = project.contract_no || "N/A";
  const communityName = project.community_name || "未命名项目";
  const address = project.address || "地址未填写";
  const layout = project.layout || "-";
  const area = project.area ? `${project.area}㎡` : "-";

  const hasCommunityId = !!project.community_id;

  const salesRecords = validateSalesRecords(project.sales_records);

  const status = project.status || DEFAULT_STATUS;

  return (
    <button
      type="button"
      onClick={() => router.push(`/admin/projects/${project.id}`)}
      aria-label={`查看项目 ${communityName} 详情`}
      className="w-full text-left bg-white rounded-cards shadow-steep overflow-hidden flex flex-col hover:-translate-y-[3px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-transform group cursor-pointer motion-safe:animate-fade-in-up"
    >
      <div className="px-[22px] pt-5 pb-1">
        <div className="flex justify-between items-center">
          <span className="text-xs font-[450] text-graphite font-mono tracking-tight">
            #{contractNo}
          </span>
          <span
            className={`inline-flex items-center rounded-full px-[11px] py-[3.5px] text-[12.5px] font-[450] leading-[1.35] whitespace-nowrap ${getProjectStatusClassName(status)}`}
          >
            {getStatusLabel(status)}
          </span>
        </div>
        <h3 className="mt-3 text-lg font-medium text-ink tracking-[-0.01em] truncate">
          {communityName}
        </h3>
        <p className="mt-1 text-[12.5px] text-graphite flex items-center gap-1 min-w-0">
          <MapPin className="w-3 h-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{address}</span>
        </p>
        <p className="mt-0.5 text-[12.5px] text-graphite flex items-center gap-1">
          <Home className="w-3 h-3 shrink-0" aria-hidden="true" />
          {layout} · {area}
        </p>
      </div>

      <div className="px-[22px] pb-5 flex-1 flex flex-col justify-between">
        <div>
          <div className="border-t border-dashed border-dove/45 my-4" aria-hidden="true" />
          <span className="text-[11.5px] font-medium text-graphite tracking-[0.05em] mb-2.5 block">
            项目动态
          </span>
          <ProjectStatsSection salesRecords={salesRecords} />
        </div>

        <div>
          <div className="border-t border-dashed border-dove/45 my-4" aria-hidden="true" />
          <MarketDataSection
            hasCommunityId={hasCommunityId}
            isLoading={false}
            marketData={marketData}
          />
        </div>
      </div>
    </button>
  );
}
