"use client";

import * as React from "react";
import { Building2, MapPin, Maximize, LayoutGrid, Compass, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { getStatusLabel, getProjectStatusBadgeClass, PROJECT_STATUS_MAPPING } from "@/lib/status-colors";
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
        "hover:shadow-md hover:border-primary/30",
        selected
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-border bg-card"
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
        <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
          <Check className="w-4 h-4 text-white" />
        </div>
      )}

      {/* 项目名称 */}
      <h4 className="font-semibold text-foreground mb-2 pr-8 line-clamp-1">
        {project.name}
      </h4>

      {/* 小区和地址 */}
      <div className="space-y-1.5 mb-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Building2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span className="line-clamp-1">{project.community_name}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span className="line-clamp-1">{project.address}</span>
        </div>
      </div>

      {/* 房源属性 */}
      <div className="flex flex-wrap gap-3">
        {project.area && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
            <Maximize className="w-3 h-3" />
            <span>{project.area}m²</span>
          </div>
        )}
        {project.layout && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
            <LayoutGrid className="w-3 h-3" />
            <span>{project.layout}</span>
          </div>
        )}
        {project.orientation && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
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

function StatusBadge({ status }: { status: string }) {
  const mapped = PROJECT_STATUS_MAPPING[status];
  const label = mapped ? getStatusLabel(mapped) : status;
  const className = mapped
    ? getProjectStatusBadgeClass(mapped)
    : "bg-muted text-foreground";

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
        className
      )}
    >
      {label}
    </span>
  );
}
