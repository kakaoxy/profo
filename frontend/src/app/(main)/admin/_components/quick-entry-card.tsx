"use client";

import { type ReactNode, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { components } from "@/lib/api-types";
import { validateSalesRecords } from "./project-card-types";
import { getListingDaysText } from "./project-card-utils";
import { RENOVATION_STAGES } from "../projects/_components/project-detail/constants";

type ProjectResponse = components["schemas"]["ProjectResponse"];

interface QuickEntryCardProps {
  title: string;
  icon: LucideIcon;
  projects: ProjectResponse[];
  emptyText: string;
  viewAllHref: string;
  accentClass: string;
  routeSuffix: string;
  renderRow: (project: ProjectResponse) => ReactNode;
}

export function QuickEntryCard({
  title,
  icon: Icon,
  projects,
  emptyText,
  viewAllHref,
  accentClass,
  routeSuffix,
  renderRow,
}: QuickEntryCardProps) {
  const router = useRouter();

  const iconBgClass = accentClass.replace("text-", "bg-").concat("/10");
  const visibleProjects = projects.slice(0, 5);

  const handleRowClick = useCallback(
    (project: ProjectResponse) => {
      router.push(`/admin/projects/${project.id}${routeSuffix}`);
    },
    [router, routeSuffix],
  );

  return (
    <div className="bg-card rounded-xl border border-border shadow-card">
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg",
              iconBgClass,
            )}
          >
            <Icon className={cn("h-4 w-4", accentClass)} aria-hidden="true" />
          </span>
          <h2 className="text-sm font-bold text-foreground">{title}</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {projects.length}个项目
          </span>
          <Link
            href={viewAllHref}
            className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
          >
            查看全部
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </div>
      </div>

      {visibleProjects.length === 0 ? (
        <div className="py-8 text-center text-xs text-muted-foreground">
          {emptyText}
        </div>
      ) : (
        <div className="flex flex-col">
          {visibleProjects.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => handleRowClick(project)}
              className="flex w-full items-center border-b border-border p-3 text-left transition-colors last:border-b-0 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring min-h-[56px]"
            >
              {renderRow(project)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function RenovationRow(project: ProjectResponse): ReactNode {
  const communityName = project.community_name || "未命名项目";
  const contractNo = project.contract_no
    ? `合同号${project.contract_no}`
    : "无合同号";
  const stage = RENOVATION_STAGES.find(
    (s) => s.value === project.renovation_stage,
  );
  const stageLabel = stage ? stage.label : "未知阶段";

  return (
    <div className="flex w-full items-center justify-between">
      <div className="min-w-0 flex-1 mr-2">
        <p className="truncate text-sm font-semibold text-foreground">
          {communityName}
        </p>
        <p className="text-[10px] text-muted-foreground">{contractNo}</p>
      </div>
      <Badge
        variant="secondary"
        className="h-5 rounded-md border border-status-renovating/20 bg-status-renovating/10 px-2 py-0 text-[10px] text-status-renovating"
      >
        {stageLabel}
      </Badge>
    </div>
  );
}

export function SellingRow(project: ProjectResponse): ReactNode {
  const communityName = project.community_name || "未命名项目";
  const listingText = getListingDaysText(project.listing_date);

  // 合并三次过滤为单次循环，避免多次遍历同一数组
  const records = validateSalesRecords(project.sales_records);
  const stats = { viewing: 0, offer: 0, negotiation: 0 };
  for (const r of records) {
    if (r.record_type === "viewing") stats.viewing++;
    else if (r.record_type === "offer") stats.offer++;
    else if (r.record_type === "negotiation") stats.negotiation++;
  }

  return (
    <div className="flex w-full items-center justify-between">
      <div className="min-w-0 flex-1 mr-2">
        <p className="truncate text-sm font-semibold text-foreground">
          {communityName}
        </p>
        <p className="text-[10px] text-muted-foreground">{listingText}</p>
      </div>
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <span className="rounded bg-status-selling/10 px-1.5 py-0.5 text-status-selling tabular-nums">
          带看{stats.viewing}
        </span>
        <span aria-hidden="true">·</span>
        <span className="rounded bg-status-selling/10 px-1.5 py-0.5 text-status-selling tabular-nums">
          出价{stats.offer}
        </span>
        <span aria-hidden="true">·</span>
        <span className="rounded bg-status-selling/10 px-1.5 py-0.5 text-status-selling tabular-nums">
          面谈{stats.negotiation}
        </span>
      </div>
    </div>
  );
}
