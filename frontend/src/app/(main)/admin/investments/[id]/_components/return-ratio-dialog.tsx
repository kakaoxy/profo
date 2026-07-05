"use client";

/**
 * 调整回报率弹窗（Phase 5.1）
 *
 * 列：投资方 / 投资比例 / 投资金额 / 默认收益 / 回报率输入+进度条 / 调整后收益
 * 校验：所有投资方调整后收益合计 = total_return（容差 0.01 元）
 * 「恢复默认」：将所有回报率重置为默认值（= total_return / total_investment × 100%）
 *
 * 注意：InvestmentResponse 不暴露已保存的 return_adjustments，弹窗打开时所有
 * 投资方回报率均初始化为默认值；用户调整后提交覆盖后端记录。
 */

import * as React from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatCNY, formatPercent } from "@/lib/formatters";
import { adjustReturn } from "../../actions";
import type { components } from "@/lib/api-types";

type InvestmentResponse = components["schemas"]["InvestmentResponse"];

interface ReturnRatioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  investment: InvestmentResponse;
}

/** 数值安全转换 */
function toNum(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return isNaN(n) ? 0 : n;
}

/** 合计容差（元） */
const SUM_EPS = 0.01;

/** 进度条最大值（200%），超过 100% 标红 */
const PROGRESS_MAX = 200;

export function ReturnRatioDialog({
  open,
  onOpenChange,
  investment,
}: ReturnRatioDialogProps) {
  const investors = investment.investors ?? [];
  const totalInvestment = toNum(investment.total_investment);
  const totalReturn = toNum(investment.total_return);
  const defaultRatio =
    totalInvestment > 0 ? (totalReturn / totalInvestment) * 100 : 0;

  // ratios: investor_id → 输入文本（保留中间输入态）
  const [ratios, setRatios] = React.useState<Record<string, string>>({});
  const [submitting, setSubmitting] = React.useState(false);

  // 打开时初始化为默认回报率
  React.useEffect(() => {
    if (open) {
      const init: Record<string, string> = {};
      for (const inv of investors) {
        init[inv.id] = defaultRatio.toFixed(2);
      }
      setRatios(init);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, investment.id]);

  const rows = investors.map((inv) => {
    const amount = toNum(inv.invest_amount);
    const ratioNum = parseFloat(ratios[inv.id] ?? "") || 0;
    const defaultProfit = (amount * defaultRatio) / 100;
    const adjustedProfit = (amount * ratioNum) / 100;
    return {
      inv,
      amount,
      ratioNum,
      defaultProfit,
      adjustedProfit,
    };
  });

  const adjustedSum = rows.reduce((s, r) => s + r.adjustedProfit, 0);
  const diff = adjustedSum - totalReturn;
  const valid = Math.abs(diff) <= SUM_EPS;
  const hasInvestors = investors.length > 0;

  const handleRatioChange = (investorId: string, value: string): void => {
    setRatios((prev) => ({ ...prev, [investorId]: value }));
  };

  const handleResetDefault = (): void => {
    const reset: Record<string, string> = {};
    for (const inv of investors) {
      reset[inv.id] = defaultRatio.toFixed(2);
    }
    setRatios(reset);
  };

  const handleSubmit = async (): Promise<void> => {
    if (!valid) {
      toast.error(
        `调整后收益合计 ${formatCNY(adjustedSum)} 与总收益 ${formatCNY(
          totalReturn,
        )} 不一致（差额 ${formatCNY(diff)}）`,
      );
      return;
    }
    setSubmitting(true);
    try {
      const res = await adjustReturn(
        investment.id,
        rows.map((r) => ({
          investor_id: r.inv.id,
          adjusted_return_ratio: r.ratioNum,
        })),
      );
      if (res.success) {
        toast.success("回报率调整已保存");
        onOpenChange(false);
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error("保存失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] grid-rows-[auto_auto_1fr_auto] gap-0 overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>调整回报率</DialogTitle>
          <DialogDescription className="text-xs">
            默认回报率 = 收益总额 / 投资总额 × 100% = {formatPercent(defaultRatio)}
            ；调整后收益合计需等于总收益 {formatCNY(totalReturn)}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto px-6 py-4">
          {hasInvestors ? (
            <div className="space-y-4">
              <div className="overflow-x-auto rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="min-w-[140px] text-muted-foreground font-medium">
                        投资方
                      </TableHead>
                      <TableHead className="min-w-[90px] text-right text-muted-foreground font-medium">
                        投资比例
                      </TableHead>
                      <TableHead className="min-w-[120px] text-right text-muted-foreground font-medium">
                        投资金额
                      </TableHead>
                      <TableHead className="min-w-[120px] text-right text-muted-foreground font-medium">
                        默认收益
                      </TableHead>
                      <TableHead className="min-w-[180px] text-muted-foreground font-medium">
                        回报率(%)
                      </TableHead>
                      <TableHead className="min-w-[120px] text-right text-muted-foreground font-medium">
                        调整后收益
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => {
                      const overDefault = r.ratioNum > defaultRatio;
                      const overHundred = r.ratioNum > 100;
                      const progressValue = Math.min(
                        (r.ratioNum / PROGRESS_MAX) * 100,
                        100,
                      );
                      return (
                        <TableRow key={r.inv.id}>
                          <TableCell className="font-medium">
                            {r.inv.name}
                          </TableCell>
                          <TableCell className="font-mono tabular-nums text-right text-muted-foreground">
                            {formatPercent(toNum(r.inv.share_ratio))}
                          </TableCell>
                          <TableCell className="font-mono tabular-nums text-right">
                            {formatCNY(r.amount)}
                          </TableCell>
                          <TableCell className="font-mono tabular-nums text-right text-muted-foreground">
                            {formatCNY(r.defaultProfit)}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  placeholder={defaultRatio.toFixed(2)}
                                  value={ratios[r.inv.id] ?? ""}
                                  onChange={(e) =>
                                    handleRatioChange(r.inv.id, e.target.value)
                                  }
                                  className="h-8 w-28 font-mono tabular-nums"
                                />
                                <span className="text-xs text-muted-foreground">
                                  %
                                </span>
                              </div>
                              <Progress
                                value={progressValue}
                                indicatorClassName={cn(
                                  overHundred
                                    ? "bg-red-500"
                                    : overDefault
                                      ? "bg-amber-500"
                                      : "bg-primary",
                                )}
                              />
                            </div>
                          </TableCell>
                          <TableCell className="font-mono tabular-nums text-right font-semibold">
                            {formatCNY(r.adjustedProfit)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="border-t-2 border-foreground hover:bg-transparent">
                      <TableCell className="font-bold" colSpan={5}>
                        合计（需 = 总收益 {formatCNY(totalReturn)}）
                      </TableCell>
                      <TableCell
                        className={cn(
                          "font-mono tabular-nums text-right font-bold",
                          valid ? "text-emerald-600" : "text-red-500",
                        )}
                      >
                        {formatCNY(adjustedSum)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              <div
                className={cn(
                  "flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5 text-sm",
                  valid
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400"
                    : "border-red-200 bg-red-50 text-red-600 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400",
                )}
              >
                <span>
                  {valid
                    ? `✅ 校验通过，调整后收益合计 = 总收益`
                    : `⚠️ 差额 ${formatCNY(diff)}，需调整至合计 = ${formatCNY(
                        totalReturn,
                      )}`}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={handleResetDefault}
                  disabled={submitting}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  恢复默认
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              暂无投资方，无法调整回报率
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-3 border-t border-border bg-card gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            取消
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !valid || !hasInvestors}
            className="bg-primary hover:bg-primary/90"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                保存中...
              </>
            ) : (
              "确认调整"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
