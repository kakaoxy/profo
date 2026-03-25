"use client";

import * as React from "react";
import { InfoCard } from "../ui/InfoCard";
import { DisplayRow } from "../ui/DisplayRow";
import type { L4MarketingProject } from "../../types";

interface PhysicalInfoViewProps {
  project?: L4MarketingProject;
}

export function PhysicalInfoView({ project }: PhysicalInfoViewProps) {
  return (
    <InfoCard title="物理信息（只读）">
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <DisplayRow label="关联主项目ID" value={project?.project_id || "-"} />
          <DisplayRow label="物业地址" value={project?.address || "-"} />
          <DisplayRow
            label="面积"
            value={project?.area ? `${project.area} m²` : "-"}
          />
          <DisplayRow label="户型" value={project?.layout || "-"} />
          <DisplayRow label="朝向" value={project?.orientation || "-"} />
          <DisplayRow label="楼层信息" value={project?.floor_info || "-"} />
          <DisplayRow
            label="预估售价"
            value={
              project?.price ? `¥${project.price.toLocaleString()}` : "-"
            }
          />
        </div>
      </div>
    </InfoCard>
  );
}
