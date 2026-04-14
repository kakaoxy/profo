"use client";

import React, { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Building2, 
  LayoutGrid, 
  Compass, 
  Ruler, 
  Coins,
  TrendingUp,
  Hash,
  Link2
} from "lucide-react";
import { formatPrice, formatUnitPrice, formatArea } from "@/lib/formatters";
import type { PhysicalInfoSectionProps } from "./types";

// 信息项组件 - 每行一个，与 project-detail 保持一致
interface InfoItemProps {
  label: string;
  value?: React.ReactNode;
  icon?: React.ReactNode;
  highlight?: boolean;
}

function InfoItem({ label, value, icon, highlight }: InfoItemProps) {
  if (value === undefined || value === null || value === "") return null;
  
  return (
    <div className="flex items-center justify-between py-2 min-h-[36px]">
      <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`text-sm font-medium text-slate-800 ${highlight ? "font-bold text-slate-900" : ""}`}>
        {value}
      </div>
    </div>
  );
}

// 使用 memo 避免不必要的重渲染
export const PhysicalInfoSection = memo(function PhysicalInfoSection({ 
  project 
}: PhysicalInfoSectionProps) {
  const hasAnyData = project.area || project.layout || project.orientation || project.floor_info || project.total_price;

  return (
    <Card className="bg-white border-slate-200 shadow-sm">
      <CardHeader className="!pb-3 px-5 border-b border-slate-100">
        <CardTitle className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
          <Building2 className="w-3.5 h-3.5 text-slate-400" />
          物理信息
          <Badge variant="secondary" className="ml-2 text-[10px] bg-slate-100 text-slate-500">
            只读
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 !pt-3 !pb-4">
        {hasAnyData ? (
          <div className="space-y-1">
            {/* 关联主项目ID */}
            {project.project_id && (
              <InfoItem 
                label="关联主项目ID" 
                value={
                  <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded">
                    {project.project_id}
                  </span>
                }
                icon={<Link2 className="w-3.5 h-3.5" />}
              />
            )}

            {/* 小区ID */}
            {project.community_id && (
              <InfoItem 
                label="小区ID" 
                value={
                  <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded">
                    {project.community_id}
                  </span>
                }
                icon={<Hash className="w-3.5 h-3.5" />}
              />
            )}

            {/* 建筑面积 */}
            <InfoItem 
              label="建筑面积" 
              value={formatArea(project.area)}
              icon={<Ruler className="w-3.5 h-3.5" />}
              highlight
            />

            {/* 户型 */}
            <InfoItem 
              label="户型" 
              value={project.layout}
              icon={<LayoutGrid className="w-3.5 h-3.5" />}
            />

            {/* 朝向 */}
            <InfoItem 
              label="朝向" 
              value={project.orientation}
              icon={<Compass className="w-3.5 h-3.5" />}
            />

            {/* 楼层信息 */}
            <InfoItem 
              label="楼层信息" 
              value={project.floor_info}
              icon={<Building2 className="w-3.5 h-3.5" />}
            />

            {/* 总价 */}
            <InfoItem 
              label="总价" 
              value={
                project.total_price ? (
                  <span className="text-red-600 font-bold">
                    ¥{project.total_price.toLocaleString()}万
                  </span>
                ) : "-"
              }
              icon={<Coins className="w-3.5 h-3.5" />}
              highlight
            />

            {/* 单价 */}
            <InfoItem 
              label="单价" 
              value={formatUnitPrice(project.unit_price)}
              icon={<TrendingUp className="w-3.5 h-3.5" />}
            />
          </div>
        ) : (
          /* 空状态提示 */
          <div className="text-center py-6 text-slate-400">
            <Building2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">暂无物理信息</p>
            <p className="text-xs mt-1">数据来源于关联的主项目</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
});
