"use client";

import { Badge } from "@/components/ui/badge";
import { InfoCard } from "../ui/InfoCard";
import { DisplayRow } from "../ui/DisplayRow";
import { formatPrice, formatUnitPrice, formatArea } from "@/lib/formatters";
import type { MarketingInfoSectionProps } from "./types";

export function MarketingInfoSection({ project }: MarketingInfoSectionProps) {
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
        <DisplayRow
          label="标签"
          value={
            typeof project.tags === "string" && project.tags ? (
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
            ) : (
              "-"
            )
          }
        />
      </div>
    </InfoCard>
  );
}
