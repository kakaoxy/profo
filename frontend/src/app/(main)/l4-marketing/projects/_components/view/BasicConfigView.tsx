"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { InfoCard } from "../ui/InfoCard";
import { DisplayRow } from "../ui/DisplayRow";
import { getStatusConfig, getPublishStatusConfig } from "../detail/utils";
import type { L4MarketingProject } from "../../types";

interface BasicConfigViewProps {
  project?: L4MarketingProject;
}

export function BasicConfigView({ project }: BasicConfigViewProps) {
  const statusConfigItem = getStatusConfig(project?.project_status || "在途");
  const publishConfig = getPublishStatusConfig(project?.publish_status || "草稿");

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
