"use client";

import * as React from "react";
import { Building2, MapPin, Maximize, LayoutGrid, Compass, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProjectListItemProps } from "./types";

/**
 * 项目列表项组件
 * 展示单个L3项目的关键信息
 */
export function ProjectListItem({
  project,
  selected,
  onClick,
}: ProjectListItemProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "relative p-4 rounded-lg border cursor-pointer transition-all duration-200",
        "hover:shadow-md hover:border-blue-300",
        selected
          ? "border-blue-500 bg-blue-50/50 shadow-sm"
          : "border-slate-200 bg-white"
      )}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {/* 选中标记 */}
      {selected && (
        <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center">
          <Check className="w-4 h-4 text-white" />
        </div>
      )}

      {/* 项目名称 */}
      <h4 className="font-semibold text-slate-900 mb-2 pr-8 line-clamp-1">
        {project.name}
      </h4>

      {/* 小区和地址 */}
      <div className="space-y-1.5 mb-3">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Building2 className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <span className="line-clamp-1">{project.community_name}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <span className="line-clamp-1">{project.address}</span>
        </div>
      </div>

      {/* 房源属性 */}
      <div className="flex flex-wrap gap-3">
        {project.area && (
          <div className="flex items-center gap-1 text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">
            <Maximize className="w-3 h-3" />
            <span>{project.area}m²</span>
          </div>
        )}
        {project.layout && (
          <div className="flex items-center gap-1 text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">
            <LayoutGrid className="w-3 h-3" />
            <span>{project.layout}</span>
          </div>
        )}
        {project.orientation && (
          <div className="flex items-center gap-1 text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">
            <Compass className="w-3 h-3" />
            <span>{project.orientation}</span>
          </div>
        )}
      </div>

      {/* 状态标签 */}
      <div className="mt-3">
        <StatusBadge status={project.status} />
      </div>
    </div>
  );
}

/**
 * 状态标签组件
 */
function StatusBadge({ status }: { status: string }) {
  const config = getStatusConfig(status);

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
        config.bgColor,
        config.textColor
      )}
    >
      {config.label}
    </span>
  );
}

/**
 * 获取状态配置
 */
function getStatusConfig(status: string): {
  label: string;
  bgColor: string;
  textColor: string;
} {
  const statusMap: Record<string, { label: string; bgColor: string; textColor: string }> = {
    签约: {
      label: "签约",
      bgColor: "bg-blue-100",
      textColor: "text-blue-700",
    },
    装修: {
      label: "装修中",
      bgColor: "bg-amber-100",
      textColor: "text-amber-700",
    },
    挂牌: {
      label: "挂牌中",
      bgColor: "bg-green-100",
      textColor: "text-green-700",
    },
    已售: {
      label: "已售",
      bgColor: "bg-gray-100",
      textColor: "text-gray-700",
    },
  };

  return (
    statusMap[status] || {
      label: status,
      bgColor: "bg-slate-100",
      textColor: "text-slate-700",
    }
  );
}
