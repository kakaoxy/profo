"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { InfoCard } from "../ui/InfoCard";
import { DisplayRow } from "../ui/DisplayRow";
import type { L4MarketingProject } from "../../types";

// 状态配置
const statusConfig: Record<string, { label: string; className: string }> = {
  "在售": {
    label: "在售",
    className: "bg-emerald-500 text-white",
  },
  "已售": {
    label: "已售",
    className: "bg-slate-300 text-slate-700",
  },
  "在途": {
    label: "在途",
    className: "bg-blue-500 text-white",
  },
};

// 发布状态配置
const publishStatusConfig: Record<string, { label: string; className: string }> = {
  "发布": {
    label: "已发布",
    className: "bg-emerald-100 text-emerald-700",
  },
  "草稿": {
    label: "草稿",
    className: "bg-amber-100 text-amber-700",
  },
};

interface BasicConfigViewProps {
  project?: L4MarketingProject;
}

export function BasicConfigView({ project }: BasicConfigViewProps) {
  const projectStatus = project?.project_status || "在途";
  const statusConfigItem = statusConfig[projectStatus] || {
    label: projectStatus,
    className: "bg-slate-100 text-slate-600",
  };

  const publishStatus = project?.publish_status || "草稿";
  const publishConfig = publishStatusConfig[publishStatus] || {
    label: publishStatus,
    className: "bg-slate-100 text-slate-600",
  };

  return (
    <InfoCard title="基础配置">
      <div className="space-y-4">
        <DisplayRow label="排序权重" value={project?.sort_order ?? 0} />
        <DisplayRow
          label="发布状态"
          value={
            <Badge variant="secondary" className={publishConfig.className}>
              {publishConfig.label}
            </Badge>
          }
        />
        <DisplayRow
          label="项目状态"
          value={
            <Badge variant="secondary" className={statusConfigItem.className}>
              {statusConfigItem.label}
            </Badge>
          }
        />
        <DisplayRow label="装修风格" value={project?.decoration_style || "-"} />
        <div className="pt-4 border-t border-slate-100">
          <div className="grid grid-cols-1 gap-2 text-xs text-slate-500">
            <div>创建时间: {project?.created_at || "-"}</div>
            <div>更新时间: {project?.updated_at || "-"}</div>
          </div>
        </div>
      </div>
    </InfoCard>
  );
}
