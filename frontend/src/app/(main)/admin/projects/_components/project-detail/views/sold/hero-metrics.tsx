"use client";

import { useCurrentDate } from "@/hooks/use-current-date";
import { Wallet, TrendingUp, CalendarDays, Timer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Project } from "../../../../types";
import { differenceInDays, parseISO, isValid } from "date-fns";

export function HeroMetrics({ project }: { project: Project }) {
  // [优化] 直接读取后端返回的缓存字段，无需前端计算，无需等待
  // 使用 Number() 确保格式安全
  const netProfit = Number(project.net_cash_flow) || 0;
  const roi = Number(project.roi) || 0;

  const today = useCurrentDate();

  // 计算资金占用天数
  // 逻辑与 ledger 保持一致：开工取签约日期或创建日期，售出取成交日期或今天
  const rawStartDate = project.signing_date || project.created_at;
  const signingDate = rawStartDate ? parseISO(rawStartDate) : null;

  const rawSoldDate = project.sold_at || project.sold_date;
  const soldDate = rawSoldDate ? parseISO(rawSoldDate) : null;
 
  let occupationDays = 0;
  if (signingDate && isValid(signingDate)) {
    // 如果已售取成交日期，未售取今天
    const end = (soldDate && isValid(soldDate)) ? soldDate : (today || new Date());
    // 统一逻辑：差值天数，保底 0
    occupationDays = Math.max(0, differenceInDays(end, signingDate));
  }

  // 确保天数至少为 1，避免除零错误 (如果当天买卖算1天或0天，根据业务逻辑，这里作为分母通常保底1)
  const safeDays = occupationDays > 0 ? occupationDays : 1;

  // 计算年化收益率 (简单年化: ROI / 天数 * 365)
  // 如果占用天数为 0 (异常情况)，则年化无意义，暂不计算或显式 0
  const annualizedRoR = occupationDays > 0 ? (roi / safeDays) * 365 : 0;

  // 用时（来自后端 days_on_market = sold_date - listing_date，已售项目用）
  const daysOnMarket = project.days_on_market;

  // 委托期限范围
  const commissionStart = project.commission_start_date;
  const commissionEnd = project.commission_end_date;
  const commissionRange =
    commissionStart && commissionEnd
      ? `${commissionStart} 至 ${commissionEnd}`
      : commissionStart || commissionEnd || null;

  return (
    <div className="mt-6 space-y-4">
      {(daysOnMarket != null || commissionRange) && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-lg bg-muted/60 border border-border text-sm">
          {daysOnMarket != null && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">成交用时：</span>
              <span className="font-bold text-foreground tabular-nums">
                {daysOnMarket} 天
              </span>
              <span className="text-xs text-muted-foreground">(上架至成交)</span>
            </div>
          )}
          {daysOnMarket != null && (
            <div className="flex items-center gap-2 sm:ml-4 sm:pl-4 sm:border-l border-border">
              <span className="text-muted-foreground">委托期限：</span>
              {commissionRange ? (
                <span className="font-semibold text-foreground">{commissionRange}</span>
              ) : (
                <span className="text-muted-foreground">--</span>
              )}
            </div>
          )}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 卡片 1：净利润 */}
      <Card className="bg-error-container/50 border-error/30 shadow-sm transition-all hover:shadow-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-money-positive">
            净利润 (Net Profit)
          </CardTitle>
          <Wallet className="h-4 w-4 text-money-positive" />
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-extrabold tracking-tight font-mono ${netProfit >= 0 ? "text-money-positive" : "text-money-negative"}`}>
            {netProfit > 0 ? "+" : ""}
            {(netProfit / 10000).toFixed(2)}{" "}
            <span className="text-sm font-bold">万</span>
          </div>
          <p className="text-xs text-money-positive/60 mt-1">
            真实净现金流
          </p>
        </CardContent>
      </Card>

      {/* 卡片 2：投资回报率 */}
      <Card className="bg-card border shadow-sm transition-all hover:shadow-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            投资回报率 (ROI)
          </CardTitle>
          <TrendingUp className="h-4 w-4 text-status-pending" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-extrabold text-status-pending tracking-tight font-mono">
            {roi.toFixed(1)}%
          </div>
          <p className="text-xs text-muted-foreground mt-1">基于实收实付</p>
        </CardContent>
      </Card>

      {/* 卡片 3：年化收益率 */}
      <Card className="bg-card border shadow-sm transition-all hover:shadow-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            年化收益率 (Annualized)
          </CardTitle>
          <Timer className="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-extrabold text-primary tracking-tight font-mono">
            {annualizedRoR.toFixed(1)}%
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            预估年化回报
          </p>
        </CardContent>
      </Card>

      {/* 卡片 4：资金占用天数 */}
      <Card className="bg-card border shadow-sm transition-all hover:shadow-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            资金占用 (Days)
          </CardTitle>
          <CalendarDays className="h-4 w-4 text-tertiary" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-extrabold text-tertiary tracking-tight font-mono">
            {occupationDays} <span className="text-sm">天</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            签约至成交周期
          </p>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
