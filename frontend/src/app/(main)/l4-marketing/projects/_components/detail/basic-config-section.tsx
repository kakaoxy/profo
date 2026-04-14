"use client";

import React, { memo, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Settings, 
  BarChart3, 
  FileCheck,
  Clock,
  CalendarDays
} from "lucide-react";
import { getStatusConfig, getPublishStatusConfig, formatDate, getRelativeTime } from "./utils";
import type { BasicConfigSectionProps } from "./types";

// 信息项组件 - 每行一个，与 project-detail 保持一致
interface InfoItemProps {
  label: string;
  value?: React.ReactNode;
  icon?: React.ReactNode;
}

function InfoItem({ label, value, icon }: InfoItemProps) {
  if (value === undefined || value === null || value === "") return null;
  
  return (
    <div className="flex items-center justify-between py-2 min-h-[36px]">
      <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-sm font-medium text-slate-800">
        {value}
      </div>
    </div>
  );
}

// 使用 memo 避免不必要的重渲染
export const BasicConfigSection = memo(function BasicConfigSection({
  project,
}: BasicConfigSectionProps) {
  // 使用 useMemo 缓存配置计算
  const statusConfigItem = useMemo(
    () => getStatusConfig(project.project_status || "在途"),
    [project.project_status]
  );
  
  const publishStatusConfig = useMemo(
    () => getPublishStatusConfig(project.publish_status || "草稿"),
    [project.publish_status]
  );

  const createdDate = useMemo(() => formatDate(project.created_at), [project.created_at]);
  const updatedDate = useMemo(() => formatDate(project.updated_at), [project.updated_at]);
  const relativeTime = useMemo(() => getRelativeTime(project.created_at), [project.created_at]);

  return (
    <Card className="bg-white border-slate-200 shadow-sm">
      <CardHeader className="!pb-3 px-5 border-b border-slate-100">
        <CardTitle className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
          <Settings className="w-3.5 h-3.5 text-slate-400" />
          基础配置
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 !pt-3 !pb-4">
        <div className="space-y-1">
          {/* 排序权重 */}
          <InfoItem 
            label="排序权重" 
            value={
              <span className="font-mono font-semibold text-slate-700">
                {project.sort_order ?? 0}
              </span>
            }
            icon={<BarChart3 className="w-3.5 h-3.5" />}
          />

          {/* 发布状态 */}
          <InfoItem 
            label="发布状态" 
            value={
              <Badge
                variant="secondary"
                className={`${publishStatusConfig.className} text-xs font-medium border-0`}
              >
                {publishStatusConfig.label}
              </Badge>
            }
            icon={<FileCheck className="w-3.5 h-3.5" />}
          />

          {/* 项目状态 */}
          <InfoItem 
            label="项目进度" 
            value={
              <Badge variant="secondary" className={`${statusConfigItem.className} text-xs font-medium border-0`}>
                {statusConfigItem.label}
              </Badge>
            }
            icon={<Clock className="w-3.5 h-3.5" />}
          />

          {/* 装修风格 */}
          {project.decoration_style && (
            <InfoItem 
              label="装修风格" 
              value={project.decoration_style}
              icon={<Settings className="w-3.5 h-3.5" />}
            />
          )}
        </div>

        {/* 时间信息 */}
        <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <CalendarDays className="w-3.5 h-3.5" />
            <span>创建于 {createdDate}</span>
            <span className="text-slate-300">({relativeTime})</span>
          </div>
          {project.updated_at && project.updated_at !== project.created_at && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Clock className="w-3.5 h-3.5" />
              <span>更新于 {updatedDate}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
});
