"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatCNY, formatPercent, safeFormatDate } from "@/lib/formatters";
import {
  type InvestmentResponse,
  countTotalInvestors,
  InfoCell,
  ratioColorClass,
  toNum,
} from "./shared";

/** 基础信息卡（只读）：项目编号、小区、金额、回报率、投资方数量、时间等 */
export function BasicInfoCard({ investment }: { investment: InvestmentResponse }) {
  const totalInvestment = toNum(investment.total_investment);
  const totalReturn = toNum(investment.total_return);
  const returnRatio =
    totalInvestment > 0 ? (totalReturn / totalInvestment) * 100 : null;
  const investors = investment.investors ?? [];
  const totalInvestorCount = countTotalInvestors(investors);
  const createdBy = investment.created_by
    ? investment.created_by.slice(0, 8)
    : "-";

  return (
    <Card>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <span>📋</span>
            基础信息
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-5">
          <InfoCell label="项目编号">
            <span className="font-mono text-xs">
              {investment.project_code || "-"}
            </span>
          </InfoCell>
          <InfoCell label="小区">
            {investment.project_name || "-"}
          </InfoCell>
          <InfoCell label="物业地址">-</InfoCell>
          <InfoCell label="项目状态">-</InfoCell>
          <InfoCell label="投资总额">
            <span className="font-mono text-base font-semibold tabular-nums">
              {formatCNY(investment.total_investment)}
            </span>
          </InfoCell>
          <InfoCell label="收益总额">
            <span
              className={cn(
                "font-mono text-base font-semibold tabular-nums",
                totalReturn > 0 && "text-money-positive",
              )}
            >
              {investment.total_return ? formatCNY(investment.total_return) : "-"}
            </span>
          </InfoCell>
          <InfoCell label="回报率">
            {returnRatio === null ? (
              <span className="text-muted-foreground">-</span>
            ) : (
              <span
                className={cn(
                  "font-mono text-lg font-bold tabular-nums",
                  ratioColorClass(returnRatio),
                )}
              >
                {formatPercent(returnRatio)}
              </span>
            )}
          </InfoCell>
          <InfoCell label="投资方数量">
            {investors.length} 个
          </InfoCell>
          <InfoCell label="投资人总数">
            {totalInvestorCount} 人
          </InfoCell>
          <InfoCell label="创建人">
            <span className="font-mono text-xs">{createdBy}</span>
          </InfoCell>
          <InfoCell label="创建时间">
            <span className="font-mono text-xs">
              {safeFormatDate(investment.created_at, "yyyy-MM-dd HH:mm")}
            </span>
          </InfoCell>
          <InfoCell label="更新时间">
            <span className="font-mono text-xs">
              {safeFormatDate(investment.updated_at, "yyyy-MM-dd HH:mm")}
            </span>
          </InfoCell>
        </div>
      </CardContent>
    </Card>
  );
}
