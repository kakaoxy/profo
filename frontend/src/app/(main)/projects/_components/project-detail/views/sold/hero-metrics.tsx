"use client";

import { Wallet, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Project } from "../../../../types";

export function HeroMetrics({ project }: { project: Project }) {
  // [优化] 直接读取后端返回的缓存字段，无需前端计算，无需等待
  // 使用 Number() 确保格式安全
  const netProfit = Number(project.net_cash_flow) || 0;
  const roi = Number(project.roi) || 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
      {/* 卡片 1：净利润 */}
      <Card className="bg-emerald-50/50 border-emerald-200 shadow-sm transition-all hover:shadow-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-emerald-800">
            净利润 (Net Profit)
          </CardTitle>
          <Wallet className="h-4 w-4 text-emerald-600" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-extrabold text-emerald-600 tracking-tight font-mono">
            {netProfit > 0 ? "+" : ""}
            {(netProfit / 10000).toFixed(2)}{" "}
            <span className="text-lg font-bold">万</span>
          </div>
          <p className="text-xs text-emerald-700/60 mt-1">
            真实净现金流 (Net Cashflow)
          </p>
        </CardContent>
      </Card>

      {/* 卡片 2：投资回报率 */}
      <Card className="bg-white border-slate-200 shadow-sm transition-all hover:shadow-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-slate-500">
            投资回报率 (ROI)
          </CardTitle>
          <TrendingUp className="h-4 w-4 text-amber-500" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-extrabold text-amber-500 tracking-tight font-mono">
            {roi.toFixed(1)}%
          </div>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-xs text-slate-400">基于现金流实收实付计算</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
