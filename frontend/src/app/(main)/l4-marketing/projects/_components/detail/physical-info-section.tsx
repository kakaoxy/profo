"use client";

import React, { memo } from "react";
import { InfoCard } from "../ui/InfoCard";
import { DisplayRow } from "../ui/DisplayRow";
import { formatPrice, formatUnitPrice, formatArea } from "@/lib/formatters";
import type { PhysicalInfoSectionProps } from "./types";

// 使用 memo 避免不必要的重渲染
export const PhysicalInfoSection = memo(function PhysicalInfoSection({ project }: PhysicalInfoSectionProps) {
  return (
    <InfoCard title="物理信息（只读）">
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <DisplayRow label="关联主项目ID" value={project.project_id || "-"} />
          <DisplayRow label="小区ID" value={project.community_id || "-"} />
          <DisplayRow label="面积" value={formatArea(project.area)} />
          <DisplayRow label="户型" value={project.layout || "-"} />
          <DisplayRow label="朝向" value={project.orientation || "-"} />
          <DisplayRow label="楼层信息" value={project.floor_info || "-"} />
          <DisplayRow label="总价" value={formatPrice(project.total_price)} />
          <DisplayRow label="单价" value={formatUnitPrice(project.unit_price)} />
        </div>
      </div>
    </InfoCard>
  );
});
