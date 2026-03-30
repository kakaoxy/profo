"use client";

import React, { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { InfoCard } from "../ui/InfoCard";
import { DisplayRow } from "../ui/DisplayRow";
import { formatPrice, formatUnitPrice, formatArea } from "@/lib/formatters";
import type { MarketingInfoSectionProps } from "./types";

// 使用 memo 避免不必要的重渲染
export const MarketingInfoSection = memo(function MarketingInfoSection({ project }: MarketingInfoSectionProps) {
  // 缓存标签渲染
  const tagsContent = React.useMemo(() => {
    if (typeof project.tags === "string" && project.tags) {
      return (
        <div className="flex flex-wrap gap-2">
          {project.tags.split(",").map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="bg-slate-100 text-slate-700"
            >
              {tag.trim()}
            </Badge>
          ))}
        </div>
      );
    }
    return "-";
  }, [project.tags]);

  return (
    <InfoCard title="营销信息">
      <div className="space-y-4">
        <DisplayRow
          label="标题"
          value={
            <span className="text-lg font-semibold text-slate-900">
              {project.title || "-"}
            </span>
          }
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <DisplayRow label="小区ID" value={project.community_id || "-"} />
          <DisplayRow label="户型" value={project.layout || "-"} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <DisplayRow label="朝向" value={project.orientation || "-"} />
          <DisplayRow label="楼层" value={project.floor_info || "-"} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <DisplayRow label="面积" value={formatArea(project.area)} />
          <DisplayRow label="总价" value={formatPrice(project.total_price)} />
        </div>
        <DisplayRow label="单价" value={formatUnitPrice(project.unit_price)} />
        <DisplayRow label="标签" value={tagsContent} />
      </div>
    </InfoCard>
  );
});
