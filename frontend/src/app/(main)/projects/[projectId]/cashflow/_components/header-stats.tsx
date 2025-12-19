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

interface HeaderStatsProps {
  stats: CashFlowStats;
}

export function HeaderStats({ stats }: HeaderStatsProps) {
  return (
    <Card className="shadow-sm border-slate-200">
      <CardContent className="p-0">
        <div className="grid grid-cols-1 md:grid-cols-5 divide-y md:divide-y-0 md:divide-x divide-slate-100">
          {/* 左侧 (60%) - 资金池 */}
          <div className="md:col-span-3 p-6 flex flex-col justify-center space-y-6">
            {/* 净现金流 */}
            <div>
              <div className="text-sm text-slate-500 font-medium mb-1">
                净现金流 (Net Cash Flow)
              </div>
              <div
                className={cn(
                  "text-4xl font-bold font-mono tracking-tight",
                  stats.net_cash_flow >= 0 ? "text-red-600" : "text-emerald-600"
                )}
              >
                {stats.net_cash_flow >= 0 ? "+" : ""}¥
                {(stats.net_cash_flow / 10000).toFixed(2)} 万
              </div>
            </div>

            {/* 收支微观对比 */}
            <div className="flex gap-8">
              <div className="flex items-center gap-2">
                <div className="bg-red-50 p-1.5 rounded-full">
                  <TrendingUp className="h-4 w-4 text-red-600" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-slate-400">总收入</span>
                  <span className="text-sm font-bold text-red-700 font-mono">
                    ¥{(stats.total_income / 10000).toFixed(2)}万
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="bg-emerald-50 p-1.5 rounded-full">
                  <TrendingDown className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-slate-400">总支出</span>
                  <span className="text-sm font-bold text-emerald-700 font-mono">
                    ¥{(stats.total_expense / 10000).toFixed(2)}万
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 右侧 (40%) - 效益分析 */}
          <div className="md:col-span-2 p-6 bg-slate-50/50 flex flex-col justify-center space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-500">ROI (投资回报率)</span>
              <span
                className={cn(
                  "text-xl font-bold",
                  stats.roi >= 0 ? "text-red-600" : "text-emerald-600"
                )}
              >
                {stats.roi.toFixed(2)}%
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-500 flex items-center gap-1">
                年化收益率
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-3 w-3 text-slate-400 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>基于当前持有天数推算，仅供参考</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </span>
              <span className="text-lg font-mono font-semibold text-slate-700">
                {stats.annualized_return}%
              </span>
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-slate-200/60">
              <span className="text-xs text-slate-400">资金占用天数</span>
              <span className="text-sm font-medium text-slate-900">
                {stats.holding_days} 天
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
