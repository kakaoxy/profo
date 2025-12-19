"use client";

import { MapPin, ChevronDown, Check, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Project } from "../../../../types";
import { STAGE_CONFIG, ViewMode } from "../../constants";
import { getStatusColor } from "../../utils";

// [修改] 扩展 Props 接口，接收视图控制参数
interface SoldHeaderProps {
  project: Project;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  currentProjectStageIndex: number;
}

export function SoldHeader({
  project,
  viewMode,
  setViewMode,
  currentProjectStageIndex,
}: SoldHeaderProps) {
  const unitPrice =
    project.soldPrice && project.area
      ? (project.soldPrice * 10000) / project.area
      : 0;

  return (
    <div className="w-full bg-gradient-to-r from-emerald-50/80 via-white to-white border-b px-6 py-5">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        {/* 左侧：房源身份 + 阶段切换器 */}
        <div className="space-y-2">
          {/* [修改] 使用 Flex 布局将 标题 和 切换按钮 并排 */}
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              {project.name}
            </h1>

            {/* [新增] 阶段切换下拉菜单 (复用自标准 Header) */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    "inline-flex items-center justify-center rounded-full text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
                    "h-6 px-3 shadow-sm",
                    // 这里会自动获取 'sold' 对应的绿色，非常契合当前页面风格
                    getStatusColor(project.status),
                    "text-white border-0 hover:opacity-85 hover:shadow-md active:scale-95"
                  )}
                >
                  {STAGE_CONFIG.find((s) => s.key === viewMode)?.label}
                  <ChevronDown className="ml-1 h-3 w-3 opacity-80" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                  切换项目阶段视图
                </DropdownMenuLabel>
                <DropdownMenuSeparator />

                {STAGE_CONFIG.map((stage, index) => {
                  const isAccessible = index <= currentProjectStageIndex;
                  const isCurrentView = viewMode === stage.key;

                  return (
                    <DropdownMenuItem
                      key={stage.key}
                      disabled={!isAccessible}
                      onClick={() => setViewMode(stage.key)}
                      className="flex items-center justify-between"
                    >
                      <span className={cn(!isAccessible && "opacity-50")}>
                        {stage.label}
                      </span>
                      {isCurrentView && (
                        <Check className="h-4 w-4 text-emerald-600" />
                      )}
                      {!isAccessible && (
                        <Lock className="h-3 w-3 text-muted-foreground" />
                      )}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4 text-slate-400" />
            <span>
              {project.community_name} {project.address}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-1">
            <Badge variant="secondary" className="bg-slate-100 text-slate-700">
              {project.area}m²
            </Badge>
            <Badge
              variant="outline"
              className="border-emerald-200 text-emerald-700 font-mono"
            >
              成交单价 ¥{Math.round(unitPrice).toLocaleString()}/m²
            </Badge>
          </div>
        </div>

        {/* 右侧：结案状态 (保持不变) */}
        <div className="flex flex-col items-end gap-1">
          <Badge className="bg-emerald-600 hover:bg-emerald-700 text-base px-3 py-1 shadow-sm">
            🎉 已售罄 (Sold)
          </Badge>
          <span className="text-xs text-slate-400 font-mono">
            结案日期:{" "}
            {project.sold_date ? project.sold_date.split("T")[0] : "-"}
          </span>
        </div>
      </div>
    </div>
  );
}
