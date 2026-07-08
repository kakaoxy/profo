"use client";

/**
 * 调整分配比例弹窗
 *
 * 列：投资方 / 投资占比 / 投资金额 / 默认分配比例 / 分配比例输入+进度条 / 调整后收益
 * 校验：所有投资方分配比例合计 = 100%
 * 「恢复默认」：将所有分配比例重置为投资占比（share_ratio）
 *
 * 分配比例 = 该投资方占 total_return 的百分比，默认等于投资占比。
 * 适用于优先资金等场景：投70%但只分配30%收益。
 * 调整后收益 = total_return × 分配比例 / 100。
 */

import * as React from "react";
import { useRouter } from "next/navigation";
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
import { adjustDistribution } from "../../actions";
import type { components } from "@/lib/api-types";

type InvestmentResponse = components["schemas"]["InvestmentResponse"];

interface DistributionRatioDialogProps {
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

/** 比例合计容差（%） */
const SUM_EPS = 0.01;

/** 进度条最大值（100%） */
const PROGRESS_MAX = 100;

export function DistributionRatioDialog({
  open,
  onOpenChange,
  investment,
}: DistributionRatioDialogProps) {
  const router = useRouter();
  const investors = investment.investors ?? [];
  const totalReturn = toNum(investment.total_return);
  const savedAdjustments = investment.return_adjustments ?? [];

  // ratios: investor_id → 输入文本（保留中间输入态）
  const [ratios, setRatios] = React.useState<Record<string, string>>({});
  const [submitting, setSubmitting] = React.useState(false);

  // 打开时初始化：优先用已保存的调整值，否则用投资占比
  React.useEffect(() => {
    if (open) {
      const savedMap: Record<string, number> = {};
      for (const adj of savedAdjustments) {
        savedMap[adj.investor_id] = toNum(adj.adjusted_distribution_ratio);
      }
      const init: Record<string, string> = {};
      for (const inv of investors) {
        const saved = savedMap[inv.id];
        init[inv.id] = (saved ?? toNum(inv.share_ratio)).toFixed(2);
      }
      setRatios(init);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, investment.id]);

  const rows = investors.map((inv) => {
    const amount = toNum(inv.invest_amount);
    const defaultRatio = toNum(inv.share_ratio);
    const ratioNum = parseFloat(ratios[inv.id] ?? "") || 0;
    const defaultProfit = (totalReturn * defaultRatio) / 100;
    const adjustedProfit = (totalReturn * ratioNum) / 100;
    return {
      inv,
      amount,
      defaultRatio,
      ratioNum,
      defaultProfit,
      adjustedProfit,
    };
  });

  const ratioSum = rows.reduce((s, r) => s + r.ratioNum, 0);
  const diff = ratioSum - 100;
  const valid = Math.abs(diff) <= SUM_EPS;
  const hasInvestors = investors.length > 0;

  const handleRatioChange = (investorId: string, value: string): void => {
    setRatios((prev) => ({ ...prev, [investorId]: value }));
  };

  const handleResetDefault = (): void => {
    const reset: Record<string, string> = {};
    for (const inv of investors) {
      reset[inv.id] = toNum(inv.share_ratio).toFixed(2);
    }
    setRatios(reset);
  };

  const handleSubmit = async (): Promise<void> => {
    if (!valid) {
      toast.error(
        `分配比例合计 ${ratioSum.toFixed(2)}% 不等于 100%（差额 ${diff.toFixed(2)}%）`,
      );
      return;
    }
    setSubmitting(true);
    try {
      const res = await adjustDistribution(
        investment.id,
        rows.map((r) => ({
          investor_id: r.inv.id,
          adjusted_distribution_ratio: r.ratioNum,
        })),
      );
      if (res.success) {
        toast.success("分配比例调整已保存");
        onOpenChange(false);
        router.refresh();
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
          <DialogTitle>调整分配比例</DialogTitle>
          <DialogDescription className="text-xs">
            分配比例 = 占收益总额的百分比，默认等于投资占比。
            调整后各投资方分配比例合计需等于 100%。总收益 {formatCNY(totalReturn)}
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
                      <TableHead className="min-w-[120px] text-right text-muted-foreground font-medium">
                        投资金额
                      </TableHead>
                      <TableHead className="min-w-[100px] text-right text-muted-foreground font-medium">
                        投资占比
                      </TableHead>
                      <TableHead className="min-w-[120px] text-right text-muted-foreground font-medium">
                        默认收益
                      </TableHead>
                      <TableHead className="min-w-[180px] text-muted-foreground font-medium">
                        分配比例(%)
                      </TableHead>
                      <TableHead className="min-w-[120px] text-right text-muted-foreground font-medium">
                        调整后收益
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => {
                      const overDefault = r.ratioNum > r.defaultRatio;
                      const overHundred = r.ratioNum > 100;
                      const progressValue = Math.min(
                        (r.ratioNum / PROGRESS_MAX) * 100,
                        100,
                      );
                      return (
                        <TableRow key={r.inv.id || `inv-${r.inv.name}`}>
                          <TableCell className="font-medium">
                            {r.inv.name}
                          </TableCell>
                          <TableCell className="font-mono tabular-nums text-right">
                            {formatCNY(r.amount)}
                          </TableCell>
                          <TableCell className="font-mono tabular-nums text-right text-muted-foreground">
                            {formatPercent(r.defaultRatio)}
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
                                  max="100"
                                  placeholder={r.defaultRatio.toFixed(2)}
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
                      <TableCell className="font-bold" colSpan={4}>
                        合计（需 = 100%）
                      </TableCell>
                      <TableCell
                        className={cn(
                          "font-mono tabular-nums text-right font-bold",
                          valid ? "text-emerald-600" : "text-red-500",
                        )}
                      >
                        {ratioSum.toFixed(2)}%
                      </TableCell>
                      <TableCell
                        className={cn(
                          "font-mono tabular-nums text-right font-bold",
                          valid ? "text-emerald-600" : "text-red-500",
                        )}
                      >
                        {formatCNY(rows.reduce((s, r) => s + r.adjustedProfit, 0))}
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
                    ? "✅ 校验通过，分配比例合计 = 100%"
                    : `⚠️ 差额 ${diff.toFixed(2)}%，需调整至合计 = 100%`}
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
              暂无投资方，无法调整分配比例
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
