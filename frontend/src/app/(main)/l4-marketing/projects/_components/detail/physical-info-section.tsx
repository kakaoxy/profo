"use client";

import { InfoCard } from "../ui/InfoCard";
import { DisplayRow } from "../ui/DisplayRow";
import { formatPrice, formatArea } from "./utils";
import type { PhysicalInfoSectionProps } from "./types";

export function PhysicalInfoSection({ project }: PhysicalInfoSectionProps) {
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
          <DisplayRow label="单价" value={formatPrice(project.unit_price)} />
        </div>
      </div>
    </InfoCard>
  );
}
