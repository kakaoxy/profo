"use client";

import React, { memo, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Activity, 
  BarChart3, 
  FileCheck,
  Clock,
  CalendarDays,
  RefreshCw,
  Sparkles
} from "lucide-react";
import { getStatusConfig, getPublishStatusConfig, formatDate, getRelativeTime } from "./utils";
import type { BasicConfigSectionProps } from "./types";

// 状态卡片组件 - 突出显示核心状态
interface StatusCardProps {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  className?: string;
}

function StatusCard({ label, value, icon, className }: StatusCardProps) {
  return (
    <div className={`relative overflow-hidden rounded-lg p-4 ${className}`}>
      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-2">
          {icon}
          <span className="text-xs font-medium opacity-80">{label}</span>
        </div>
        <div className="text-base font-semibold">{value}</div>
      </div>
    </div>
  );
}

// 信息行组件 - 简洁的键值对展示
interface InfoRowProps {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
}

function InfoRow({ label, value, icon }: InfoRowProps) {
  if (value === undefined || value === null || value === "") return null;
  
  return (
    <div className="flex items-center justify-between py-2.5">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        {icon && <span className="text-slate-400">{icon}</span>}
        <span>{label}</span>
      </div>
      <div className="text-sm font-medium text-slate-700">{value}</div>
    </div>
  );
}

// 时间线项组件
interface TimelineItemProps {
  icon: React.ReactNode;
  label: string;
  time: string;
  relativeTime?: string;
  isLast?: boolean;
}

function TimelineItem({ icon, label, time, relativeTime, isLast }: TimelineItemProps) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className="w-7 h-7 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center">
          {icon}
        </div>
        {!isLast && <div className="w-px flex-1 bg-slate-100 my-1" />}
      </div>
      <div className="flex-1 pb-4">
        <div className="text-xs text-slate-500 mb-0.5">{label}</div>
        <div className="text-sm font-medium text-slate-700">{time}</div>
        {relativeTime && (
          <div className="text-xs text-slate-400 mt-0.5">{relativeTime}</div>
        )}
      </div>
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

  const createdDate = useMemo(() => formatDate(project.created_at), [project.created_at]);
  const updatedDate = useMemo(() => formatDate(project.updated_at), [project.updated_at]);
  const relativeTime = useMemo(() => getRelativeTime(project.created_at), [project.created_at]);
  const updateRelativeTime = useMemo(
    () => project.updated_at ? getRelativeTime(project.updated_at) : null,
    [project.updated_at]
  );

  const hasUpdateTime = project.updated_at && project.updated_at !== project.created_at;

  return (
    <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
      {/* 头部 */}
      <CardHeader className="!pb-3 px-5 border-b border-slate-100 bg-slate-50/50">
        <CardTitle className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-slate-500" />
          状态信息
        </CardTitle>
      </CardHeader>

      <CardContent className="px-0 !pt-0 !pb-0">
        {/* 核心状态区域 - 双卡片布局 */}
        <div className="p-5">
          <div className="grid grid-cols-2 gap-3">
            {/* 发布状态 */}
            <StatusCard
              label="发布状态"
              value={
                <Badge
                  variant="secondary"
                  className={`${publishConfig.className} text-xs font-semibold border-0 px-2.5 py-1`}
                >
                  {publishConfig.label}
                </Badge>
              }
              icon={<FileCheck className="w-3.5 h-3.5" />}
              className="bg-gradient-to-br from-blue-50 to-indigo-50/50 border border-blue-100 text-blue-700"
            />

            {/* 项目进度 */}
            <StatusCard
              label="项目进度"
              value={
                <Badge
                  variant="secondary"
                  className={`${statusConfig.className} text-xs font-semibold border-0 px-2.5 py-1`}
                >
                  {statusConfig.label}
                </Badge>
              }
              icon={<Sparkles className="w-3.5 h-3.5" />}
              className="bg-gradient-to-br from-amber-50 to-orange-50/50 border border-amber-100 text-amber-700"
            />
          </div>
        </div>

        <Separator className="bg-slate-100" />

        {/* 配置信息区域 */}
        <div className="px-5 py-4">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <BarChart3 className="w-3 h-3" />
            配置参数
          </div>
          
          <div className="space-y-0.5">
            {/* 排序权重 */}
            <InfoRow
              label="排序权重"
              value={
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                    {project.sort_order ?? 0}
                  </span>
                  <span className="text-xs text-slate-400">数值越大排序越靠前</span>
                </div>
              }
            />

            {/* 装修风格 */}
            {project.decoration_style && (
              <InfoRow
                label="装修风格"
                value={
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                    {project.decoration_style}
                  </span>
                }
              />
            )}
          </div>
        </div>

        <Separator className="bg-slate-100" />

        {/* 时间线区域 */}
        <div className="px-5 py-4 bg-slate-50/30">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Clock className="w-3 h-3" />
            时间记录
          </div>

          <div className="space-y-0">
            {/* 创建时间 */}
            <TimelineItem
              icon={<CalendarDays className="w-3.5 h-3.5 text-slate-400" />}
              label="创建时间"
              time={createdDate}
              relativeTime={`${relativeTime}`}
              isLast={!hasUpdateTime}
            />

            {/* 更新时间 */}
            {hasUpdateTime && (
              <TimelineItem
                icon={<RefreshCw className="w-3.5 h-3.5 text-slate-400" />}
                label="最后更新"
                time={updatedDate}
                relativeTime={updateRelativeTime ? `${updateRelativeTime}` : undefined}
                isLast={true}
              />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
});
