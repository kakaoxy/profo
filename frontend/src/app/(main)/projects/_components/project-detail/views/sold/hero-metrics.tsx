"use client";

import { Wallet, TrendingUp, CalendarDays, Timer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Project } from "../../../../types";
import { differenceInDays, parseISO, isValid } from "date-fns";

export function HeroMetrics({ project }: { project: Project }) {
  // [优化] 直接读取后端返回的缓存字段，无需前端计算，无需等待
  // 使用 Number() 确保格式安全
  const netProfit = Number(project.net_cash_flow) || 0;
  const roi = Number(project.roi) || 0;

  // 计算资金占用天数
  const signingDate = project.signing_date ? parseISO(project.signing_date) : null;
  // 优先使用 sold_at (成交时间), 其次 sold_date (可能仅日期), 再次 updated_at
  const soldDate = project.sold_at
    ? parseISO(project.sold_at)
    : project.sold_date
    ? parseISO(project.sold_date)
    : null;

  let occupationDays = 0;
  if (signingDate && soldDate && isValid(signingDate) && isValid(soldDate)) {
    occupationDays = differenceInDays(soldDate, signingDate);
  }

  // 确保天数至少为 1，避免除零错误 (如果当天买卖算1天或0天，根据业务逻辑，这里作为分母通常保底1)
  const safeDays = occupationDays > 0 ? occupationDays : 1;

  // 计算年化收益率 (简单年化: ROI / 天数 * 365)
  // 如果占用天数为 0 (异常情况)，则年化无意义，暂不计算或显式 0
  const annualizedRoR = occupationDays > 0 ? (roi / safeDays) * 365 : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
      {/* 卡片 1：净利润 */}
      <Card className="bg-emerald-50/50 border-emerald-200 shadow-sm transition-all hover:shadow-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-emerald-800">
            净利润 (Net Profit)
          </CardTitle>
          <Wallet className="h-4 w-4 text-emerald-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-extrabold text-emerald-600 tracking-tight font-mono">
            {netProfit > 0 ? "+" : ""}
            {(netProfit / 10000).toFixed(2)}{" "}
            <span className="text-sm font-bold">万</span>
          </div>
          <p className="text-xs text-emerald-700/60 mt-1">
            真实净现金流
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
          <div className="text-2xl font-extrabold text-amber-500 tracking-tight font-mono">
            {roi.toFixed(1)}%
          </div>
          <p className="text-xs text-slate-400 mt-1">基于实收实付</p>
        </CardContent>
      </Card>

      {/* 卡片 3：年化收益率 */}
      <Card className="bg-white border-slate-200 shadow-sm transition-all hover:shadow-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-slate-500">
            年化收益率 (Annualized)
          </CardTitle>
          <Timer className="h-4 w-4 text-blue-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-extrabold text-blue-500 tracking-tight font-mono">
            {annualizedRoR.toFixed(1)}%
          </div>
          <p className="text-xs text-slate-400 mt-1">
            预估年化回报
          </p>
        </CardContent>
      </Card>

      {/* 卡片 4：资金占用天数 */}
      <Card className="bg-white border-slate-200 shadow-sm transition-all hover:shadow-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-slate-500">
            资金占用 (Days)
          </CardTitle>
          <CalendarDays className="h-4 w-4 text-purple-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-extrabold text-purple-500 tracking-tight font-mono">
            {occupationDays} <span className="text-sm">天</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            签约至成交周期
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
