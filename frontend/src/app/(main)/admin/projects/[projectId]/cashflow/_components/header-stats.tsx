// src/app/(main)/projects/[projectId]/cashflow/_components/header-stats.tsx
"use client";

import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CashFlowStats } from "../types";

export interface ProjectInfo {
  contract_no: string | null;
  community_name: string | null;
  address: string | null;
  area: string | null;
  floor_info: string | null;
}

interface HeaderStatsProps {
  stats: CashFlowStats;
  projectInfo?: ProjectInfo | null;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-graphite shrink-0">{label}</span>
      <span className="text-sm font-medium text-ink text-right truncate">
        {value}
      </span>
    </div>
  );
}

export function HeaderStats({ stats, projectInfo }: HeaderStatsProps) {
  const hasProjectInfo = Boolean(projectInfo);

  // 网格布局：有项目信息时 3 栏（3/5/4），否则保持原 2 栏（3/2）
  const gridClass = hasProjectInfo
    ? "grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-dove/40"
    : "grid grid-cols-1 md:grid-cols-5 divide-y md:divide-y-0 md:divide-x divide-dove/40";
  const cashflowColClass = hasProjectInfo ? "md:col-span-5" : "md:col-span-3";
  const roiColClass = hasProjectInfo ? "md:col-span-4" : "md:col-span-2";

  return (
    <Card className="shadow-steep rounded-cards border-0 overflow-hidden">
      <CardContent className="p-0">
        <div className={gridClass}>
          {/* 左栏 - 项目基础信息（仅 projectInfo 存在时渲染） */}
          {hasProjectInfo && (
            <div className="md:col-span-3 p-6 flex flex-col justify-center space-y-3">
              <div className="text-sm font-medium text-ink mb-1">
                项目基础信息
              </div>
              <InfoRow
                label="项目编号"
                value={
                  projectInfo!.contract_no ? (
                    <span className="font-mono">
                      {projectInfo!.contract_no}
                    </span>
                  ) : (
                    "-"
                  )
                }
              />
              <InfoRow
                label="小区"
                value={projectInfo!.community_name || "-"}
              />
              <InfoRow
                label="地址"
                value={projectInfo!.address || "-"}
              />
              <InfoRow
                label="面积"
                value={
                  projectInfo!.area
                    ? `${projectInfo!.area} m²`
                    : "-"
                }
              />
              <InfoRow
                label="楼层"
                value={projectInfo!.floor_info || "-"}
              />
            </div>
          )}

          {/* 中栏 - 资金池 */}
          <div className={cn("p-6 flex flex-col justify-center space-y-6", cashflowColClass)}>
            {/* 净现金流 */}
            <div>
              <div className="text-sm text-graphite font-medium mb-1">
                净现金流 (Net Cash Flow)
              </div>
              <div
                className={cn(
                  "text-4xl font-bold font-mono tracking-tight",
                  stats.net_cash_flow >= 0 ? "text-rust" : "text-ink"
                )}
              >
                {stats.net_cash_flow >= 0 ? "+" : ""}¥
                {(stats.net_cash_flow / 10000).toFixed(2)} 万
              </div>
            </div>

            {/* 收支微观对比 */}
            <div className="flex gap-8">
              <div className="flex items-center gap-2">
                <div className="bg-apricot-wash p-1.5 rounded-full">
                  <TrendingUp className="h-4 w-4 text-rust" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-graphite">总收入</span>
                  <span className="text-sm font-bold text-rust font-mono">
                    ¥{(stats.total_income / 10000).toFixed(2)}万
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="bg-sky-wash p-1.5 rounded-full">
                  <TrendingDown className="h-4 w-4 text-ink" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-graphite">总支出</span>
                  <span className="text-sm font-bold text-ink font-mono">
                    ¥{(stats.total_expense / 10000).toFixed(2)}万
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 右栏 - 效益分析 */}
          <div className={cn("p-6 bg-fog flex flex-col justify-center space-y-4", roiColClass)}>
            <div className="flex justify-between items-center">
              <span className="text-sm text-graphite">ROI (投资回报率)</span>
              <span
                className={cn(
                  "text-xl font-bold",
                  stats.roi >= 0 ? "text-rust" : "text-ink"
                )}
              >
                {stats.roi.toFixed(2)}%
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-sm text-graphite flex items-center gap-1">
                年化收益率
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-3 w-3 text-graphite cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>基于当前持有天数推算，仅供参考</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </span>
              <span className="text-lg font-mono font-semibold text-ink">
                {stats.annualized_return}%
              </span>
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-dove/40">
              <span className="text-xs text-graphite">资金占用天数</span>
              <span className="text-sm font-medium text-ink">
                {stats.holding_days} 天
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
