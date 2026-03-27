"use client";

import * as React from "react";
import { InfoCard } from "../ui/InfoCard";
import { DisplayRow } from "../ui/DisplayRow";
import { formatUnitPrice } from "@/lib/formatters";
import type { L4MarketingProject } from "../../types";

interface PhysicalInfoViewProps {
  project?: L4MarketingProject;
}

export function PhysicalInfoView({ project }: PhysicalInfoViewProps) {
  return (
    <InfoCard title="物理信息">
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <DisplayRow label="关联主项目ID" value={project?.project_id || "-"} />
          <DisplayRow label="小区ID" value={project?.community_id || "-"} />
          <DisplayRow
            label="面积"
            value={project?.area ? `${project.area} m²` : "-"}
          />
          <DisplayRow label="户型" value={project?.layout || "-"} />
          <DisplayRow label="朝向" value={project?.orientation || "-"} />
          <DisplayRow label="楼层信息" value={project?.floor_info || "-"} />
          <DisplayRow
            label="总价"
            value={
              project?.total_price
                ? `¥${Number(project.total_price).toLocaleString()} 万`
                : "-"
            }
          />
          <DisplayRow
            label="单价"
            value={formatUnitPrice(project?.unit_price)}
          />
        </div>
      </div>
    </InfoCard>
  );
}
