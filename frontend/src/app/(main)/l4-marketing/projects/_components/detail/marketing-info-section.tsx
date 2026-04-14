"use client";

import React, { memo, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Home, 
  LayoutGrid, 
  Compass, 
  Building2, 
  Tag,
  User,
  Ruler,
  Coins,
  TrendingUp
} from "lucide-react";
import { formatPrice, formatUnitPrice, formatArea } from "@/lib/formatters";
import type { MarketingInfoSectionProps } from "./types";

// 信息项组件 - 与 project-detail 保持一致，每行一个
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
      <div className={`text-sm font-medium text-slate-800 ${highlight ? "font-bold" : ""}`}>
        {value}
      </div>
    </div>
  );
}

// 使用 memo 避免不必要的重渲染
export const MarketingInfoSection = memo(function MarketingInfoSection({ 
  project 
}: MarketingInfoSectionProps) {
  // 缓存标签渲染
  const tagsContent = useMemo(() => {
    if (typeof project.tags === "string" && project.tags) {
      return (
        <div className="flex flex-wrap gap-1.5 justify-end">
          {project.tags.split(",").map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="bg-slate-100 text-slate-600 text-xs font-medium px-2 py-0.5"
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
    <Card className="shadow-sm border-slate-200 mb-6 bg-white overflow-hidden">
      <div className="flex flex-col md:flex-row">
        
        {/* 左侧：核心价格区 (35% 宽度) - 高亮背景 */}
        <div className="w-full md:w-[35%] bg-gradient-to-br from-red-50/80 to-orange-50/50 p-6 flex flex-col justify-center border-b md:border-b-0 md:border-r border-slate-100 relative overflow-hidden group">
          {/* 背景装饰印花 */}
          <Coins className="absolute -right-4 -bottom-4 w-24 h-24 text-red-100/50 rotate-12 group-hover:rotate-0 transition-transform duration-500" />
          
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-3">
              <span className="bg-red-100 text-red-600 text-[10px] px-2 py-0.5 rounded-full font-bold">
                挂牌价
              </span>
              {project.unit_price && (
                <span className="text-xs text-slate-500">
                  单价 {formatUnitPrice(project.unit_price)}
                </span>
              )}
            </div>
            
            <div className="flex items-baseline gap-1.5 overflow-hidden">
              <span className="text-4xl lg:text-5xl font-extrabold text-red-600 tracking-tight">
                {project.total_price ? project.total_price.toLocaleString() : "-"}
              </span>
              <span className="text-lg text-red-500 font-medium">万</span>
            </div>

            {/* 涨跌幅模拟占位 */}
            <div className="mt-3 flex items-center text-xs text-slate-400">
               <TrendingUp className="w-3.5 h-3.5 mr-1" />
               <span className="opacity-80">根据市场波动适时调整</span>
            </div>
          </div>
        </div>

        {/* 右侧：详细信息区 (65% 宽度) */}
        <div className="flex-1 p-6">
          {/* 顶部标题栏 - 小区名称 */}
          <div className="flex items-start justify-between mb-4 pb-4 border-b border-slate-100">
            <div className="space-y-1">
               <div className="flex items-center gap-2 text-slate-400 text-xs font-medium">
                 <Home className="w-3.5 h-3.5" />
                 <span>小区名称</span>
               </div>
               <div className="text-lg font-bold text-slate-900 leading-tight">
                 {project.community_name || "未填写小区名称"}
               </div>
            </div>
          </div>

          {/* 下方信息列表 - 每行一个 */}
          <div className="space-y-1">
            {/* 房源标题 */}
            <InfoItem 
              label="房源标题" 
              value={project.title} 
              icon={<Tag className="w-3.5 h-3.5" />}
              highlight
            />

            {/* 户型 */}
            <InfoItem 
              label="户型" 
              value={project.layout} 
              icon={<LayoutGrid className="w-3.5 h-3.5" />}
            />

            {/* 建筑面积 */}
            <InfoItem 
              label="建筑面积" 
              value={formatArea(project.area)} 
              icon={<Ruler className="w-3.5 h-3.5" />}
            />

            {/* 楼层信息 */}
            <InfoItem 
              label="楼层信息" 
              value={project.floor_info} 
              icon={<Building2 className="w-3.5 h-3.5" />}
            />

            {/* 朝向 */}
            <InfoItem 
              label="朝向" 
              value={project.orientation} 
              icon={<Compass className="w-3.5 h-3.5" />}
            />

            {/* 标签 */}
            {project.tags && (
              <div className="flex items-start justify-between py-2">
                <div className="flex items-center gap-2 text-xs text-slate-500 font-medium pt-1">
                  <Tag className="w-3.5 h-3.5" />
                  <span>标签</span>
                </div>
                <div className="text-sm text-slate-700 max-w-[60%]">
                  {tagsContent}
                </div>
              </div>
            )}

            {/* 项目负责人 */}
            {(project as any).manager_name && (
              <InfoItem 
                label="项目负责人" 
                value={(project as any).manager_name}
                icon={<User className="w-3.5 h-3.5" />}
              />
            )}
          </div>
        </div>
      </div>
    </Card>
  );
});
