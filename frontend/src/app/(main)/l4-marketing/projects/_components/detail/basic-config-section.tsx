"use client";

import React, { memo, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  getStatusConfig,
  getPublishStatusConfig,
  formatDate,
} from "./utils";
import type { BasicConfigSectionProps } from "./types";

// 状态卡片组件
interface StatusCardProps {
  label: string;
  badge: React.ReactNode;
  color: "green" | "gray";
}

function StatusCard({ label, badge, color }: StatusCardProps) {
  const bgClass = color === "green" ? "bg-emerald-50" : "bg-slate-50";
  const borderClass = color === "green" ? "border-emerald-100" : "border-slate-100";

  return (
    <div className={`rounded-lg p-4 ${bgClass} border ${borderClass}`}>
      <div className="text-xs text-slate-500 mb-2">{label}</div>
      <div>{badge}</div>
    </div>
  );
}

// 管理配置项组件
interface ConfigItemProps {
  label: string;
  value: React.ReactNode;
}

function ConfigItem({ label, value }: ConfigItemProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-sm font-medium text-slate-700">{value}</span>
    </div>
  );
}

// 使用 memo 避免不必要的重渲染
export const BasicConfigSection = memo(function BasicConfigSection({
  project,
}: BasicConfigSectionProps) {
  // 使用 useMemo 缓存配置计算
  const statusConfig = useMemo(
    () => getStatusConfig(project.project_status || "在途"),
    [project.project_status]
  );

  const publishConfig = useMemo(
    () => getPublishStatusConfig(project.publish_status || "草稿"),
    [project.publish_status]
  );

  return (
    <div className="space-y-4">
      {/* 房源状态区域 */}
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <h3 className="text-sm font-medium text-slate-700 mb-3">房源状态</h3>
        <div className="grid grid-cols-2 gap-4">
          {/* 发布状态 */}
          <StatusCard
            label="发布状态"
            color={project.publish_status === "发布" ? "green" : "gray"}
            badge={
              <Badge
                variant="secondary"
                className={`${publishConfig.className} text-xs font-semibold border-0 px-2.5 py-1`}
              >
                {publishConfig.label}
              </Badge>
            }
          />

          {/* 项目进度 */}
          <StatusCard
            label="项目进度"
            color={project.project_status === "在售" ? "green" : "gray"}
            badge={
              <Badge
                variant="secondary"
                className={`${statusConfig.className} text-xs font-semibold border-0 px-2.5 py-1`}
              >
                {statusConfig.label}
              </Badge>
            }
          />
        </div>
      </div>

      {/* 管理配置区域 */}
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <h3 className="text-sm font-medium text-slate-700 mb-3">管理配置</h3>
        <div className="grid grid-cols-4 gap-4">
          <ConfigItem
            label="排序权重"
            value={project.sort_order ?? 0}
          />
          <ConfigItem
            label="关联顾问ID"
            value={project.consultant_id ?? "-"}
          />
          <ConfigItem
            label="关联L3项目ID"
            value={project.project_id ?? "-"}
          />
          <ConfigItem
            label="最后更新"
            value={formatDate(project.updated_at)}
          />
        </div>
      </div>
    </div>
  );
});
