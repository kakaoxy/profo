"use client";

import { Fragment } from "react";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCNY, formatPercent } from "@/lib/formatters";
import { type InvestmentResponse, InvestorTypeIcon, toNum } from "./shared";

/** 收益分配卡：按投资占比或已调整分配比例展示各方收益金额 */
export function ProfitDistributionCard({
  investment,
  onAdjustReturn,
  adjustDisabled = false,
}: {
  investment: InvestmentResponse;
  onAdjustReturn: () => void;
  /** 编辑模式下投资方为本地态，调整分配比例会与未保存编辑冲突，故禁用 */
  adjustDisabled?: boolean;
}) {
  const investors = investment.investors ?? [];
  const totalInvestment = toNum(investment.total_investment);
  const totalReturn = toNum(investment.total_return);
  const savedAdjustments = investment.return_adjustments ?? [];

  const hasNoInvestors = investors.length === 0;
  const hasNoReturn =
    investment.total_return === null || investment.total_return === undefined || totalReturn === 0;

  // 已保存的分配比例调整：investor_id → adjusted_distribution_ratio
  const adjustmentMap = new Map<string, number>();
  for (const adj of savedAdjustments) {
    adjustmentMap.set(adj.investor_id, toNum(adj.adjusted_distribution_ratio));
  }
  const hasAdjustments = adjustmentMap.size > 0;

  // 调整分配比例按钮启用条件：未结算 && 有投资方 && 有收益 && 非编辑禁用
  const canAdjust =
    !adjustDisabled &&
    investment.settlement_status === "unsettled" &&
    !hasNoInvestors &&
    !hasNoReturn;

  return (
    <Card>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <span>📊</span>
            收益分配
          </h2>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={!canAdjust}
            onClick={onAdjustReturn}
            title={
              adjustDisabled
                ? "请先保存或取消编辑后再调整分配比例"
                : canAdjust
                  ? "调整各投资方分配比例"
                  : investment.settlement_status === "settled"
                    ? "已结算，不可调整"
                    : hasNoInvestors
                      ? "暂无投资方"
                      : "暂无收益数据"
            }
          >
            <Settings className="h-4 w-4" />
            调整分配比例
          </Button>
        </div>

        {hasNoInvestors ? (
          <div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
            <span>⚠️</span>
            <span>暂无投资方，请先添加投资方后再配置收益分配</span>
          </div>
        ) : hasNoReturn ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            暂无收益数据
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground rounded-lg bg-muted/40 px-4 py-2.5">
              <span>
                总收益：
                <strong className="font-mono tabular-nums text-foreground">
                  {formatCNY(investment.total_return)}
                </strong>
              </span>
              <span>
                分配方案：
                <strong className="text-foreground">
                  {hasAdjustments ? "已调整分配比例" : "默认按投资占比分配"}
                </strong>
              </span>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="min-w-[200px] text-muted-foreground font-medium">
                      投资方
                    </TableHead>
                    <TableHead className="min-w-[120px] text-right text-muted-foreground font-medium">
                      投资金额
                    </TableHead>
                    <TableHead className="min-w-[100px] text-right text-muted-foreground font-medium">
                      投资占比
                    </TableHead>
                    <TableHead className="min-w-[100px] text-right text-muted-foreground font-medium">
                      分配比例
                    </TableHead>
                    <TableHead className="min-w-[140px] text-right text-muted-foreground font-medium">
                      收益金额
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {investors.map((inv, idx) => {
                    const amount = toNum(inv.invest_amount);
                    const investRatio = toNum(inv.share_ratio);
                    const distRatio = adjustmentMap.get(inv.id) ?? investRatio;
                    const profit = (totalReturn * distRatio) / 100;
                    const subs = inv.sub_investors ?? [];
                    return (
                      <Fragment key={inv.id || `inv-${idx}`}>
                        <TableRow className={subs.length > 0 ? "bg-muted/20" : ""}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <InvestorTypeIcon type={inv.type} />
                              {inv.name}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono tabular-nums text-right">
                            {formatCNY(amount)}
                          </TableCell>
                          <TableCell className="font-mono tabular-nums text-right text-muted-foreground">
                            {formatPercent(investRatio)}
                          </TableCell>
                          <TableCell className="font-mono tabular-nums text-right">
                            {formatPercent(distRatio)}
                            {adjustmentMap.has(inv.id) && (
                              <span className="ml-1 text-xs text-amber-600">●</span>
                            )}
                          </TableCell>
                          <TableCell className="font-mono tabular-nums text-right font-semibold">
                            {formatCNY(profit)}
                          </TableCell>
                        </TableRow>
                        {subs.map((sub, subIdx) => {
                          const subAmount = toNum(sub.invest_amount);
                          const subProfit = (profit * toNum(sub.share_ratio)) / 100;
                          return (
                            <TableRow
                              key={sub.id || `sub-${idx}-${subIdx}`}
                              className="border-l-2 border-muted hover:bg-transparent"
                            >
                              <TableCell className="pl-10 text-muted-foreground">
                                └ {sub.name}
                              </TableCell>
                              <TableCell className="font-mono tabular-nums text-right text-muted-foreground">
                                {formatCNY(subAmount)}
                              </TableCell>
                              <TableCell className="font-mono tabular-nums text-right text-muted-foreground">
                                {formatPercent(toNum(sub.share_ratio))}
                              </TableCell>
                              <TableCell className="font-mono tabular-nums text-right text-muted-foreground">
                                —
                              </TableCell>
                              <TableCell className="font-mono tabular-nums text-right text-muted-foreground">
                                {formatCNY(subProfit)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                  <TableRow className="border-t-2 border-foreground hover:bg-transparent">
                    <TableCell className="font-bold">合计</TableCell>
                    <TableCell className="font-mono tabular-nums font-bold text-right">
                      {formatCNY(totalInvestment)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">—</TableCell>
                    <TableCell className="font-mono tabular-nums font-bold text-right">
                      100.00%
                    </TableCell>
                    <TableCell className="font-mono tabular-nums font-bold text-right">
                      {formatCNY(totalReturn)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
