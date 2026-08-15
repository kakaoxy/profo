"use client";

import { Plus } from "lucide-react";
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
import {
  type InvestmentResponse,
  type InvestorResponse,
  InvestorTypeIcon,
  countTotalInvestors,
  toNum,
} from "./shared";

/** 只读投资方管理卡：投资方表格（母投资方 + 子投资人 + 小计 + 合计） */
export function InvestorsCard({ investment }: { investment: InvestmentResponse }) {
  const investors = investment.investors ?? [];
  const totalInvestment = toNum(investment.total_investment);
  const totalInvestorCount = countTotalInvestors(investors);
  const totalRatio = investors.reduce((sum, inv) => sum + toNum(inv.share_ratio), 0);

  if (investors.length === 0) {
    return (
      <Card>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <span>👥</span>
              投资方管理
            </h2>
            <Button variant="outline" size="sm" disabled className="gap-1.5" title="只读模式不可用">
              <Plus className="h-4 w-4" />
              添加投资方
            </Button>
          </div>
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <span className="text-3xl">📭</span>
            <p className="text-sm text-muted-foreground">暂无投资方</p>
            <p className="text-xs text-muted-foreground">点击下方按钮开始录入投资方信息</p>
            <Button variant="outline" size="sm" disabled className="gap-1.5" title="只读模式不可用">
              <Plus className="h-4 w-4" />
              添加投资方
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <span>👥</span>
            投资方管理
          </h2>
          <Button variant="outline" size="sm" disabled className="gap-1.5" title="只读模式不可用">
            <Plus className="h-4 w-4" />
            添加投资方
          </Button>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="min-w-[240px] text-muted-foreground font-medium">
                  投资方
                </TableHead>
                <TableHead className="min-w-[100px] text-muted-foreground font-medium">
                  投资占比
                </TableHead>
                <TableHead className="min-w-[160px] text-right text-muted-foreground font-medium">
                  投资金额
                </TableHead>
                <TableHead className="min-w-[60px] text-center text-muted-foreground font-medium">
                  子投资人
                </TableHead>
                <TableHead className="w-16 text-center text-muted-foreground font-medium">
                  操作
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {investors.map((inv) => {
                const subs = inv.sub_investors ?? [];
                const subCount = subs.length;
                const subRatioSum = subs.reduce((s, sub) => s + toNum(sub.share_ratio), 0);
                const subAmountSum = subs.reduce((s, sub) => s + toNum(sub.invest_amount), 0);
                return (
                  <InvestorRowGroup
                    key={inv.id}
                    investor={inv}
                    subCount={subCount}
                    subRatioSum={subRatioSum}
                    subAmountSum={subAmountSum}
                  />
                );
              })}
              <TableRow className="border-t-2 border-foreground hover:bg-transparent">
                <TableCell className="font-bold">合计</TableCell>
                <TableCell className="font-mono tabular-nums font-bold">
                  {formatPercent(totalRatio)}
                </TableCell>
                <TableCell className="font-mono tabular-nums font-bold text-right">
                  {formatCNY(totalInvestment)}
                </TableCell>
                <TableCell className="text-center font-bold">{totalInvestorCount}人</TableCell>
                <TableCell className="text-center text-muted-foreground">—</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

/** 只读投资方行组（母投资方 + 子投资人 + 小计） */
function InvestorRowGroup({
  investor,
  subCount,
  subRatioSum,
  subAmountSum,
}: {
  investor: InvestorResponse;
  subCount: number;
  subRatioSum: number;
  subAmountSum: number;
}) {
  const subs = investor.sub_investors ?? [];
  return (
    <>
      <TableRow className="bg-muted/30 hover:bg-muted/40">
        <TableCell>
          <div className="flex items-center gap-2.5">
            <InvestorTypeIcon type={investor.type} />
            <span className="font-medium">{investor.name}</span>
          </div>
        </TableCell>
        <TableCell className="font-mono tabular-nums">
          {formatPercent(toNum(investor.share_ratio))}
        </TableCell>
        <TableCell className="font-mono tabular-nums text-right">
          {formatCNY(investor.invest_amount)}
        </TableCell>
        <TableCell className="text-center">{subCount > 0 ? `${subCount}人` : "—"}</TableCell>
        <TableCell className="text-center text-muted-foreground">—</TableCell>
      </TableRow>
      {subs.map((sub) => (
        <TableRow key={sub.id} className="border-l-2 border-accent hover:bg-transparent">
          <TableCell className="pl-12 font-normal text-muted-foreground">{sub.name}</TableCell>
          <TableCell className="pl-12 font-mono tabular-nums font-normal text-muted-foreground">
            {formatPercent(toNum(sub.share_ratio))}
          </TableCell>
          <TableCell className="pl-12 font-mono tabular-nums text-right font-normal text-muted-foreground">
            {formatCNY(sub.invest_amount)}
          </TableCell>
          <TableCell className="pl-12 text-center text-muted-foreground">—</TableCell>
          <TableCell className="text-center text-muted-foreground">—</TableCell>
        </TableRow>
      ))}
      {subCount > 0 && (
        <TableRow className="border-t border-dashed border-border hover:bg-transparent">
          <TableCell className="pl-12 italic text-muted-foreground text-sm">小计</TableCell>
          <TableCell className="pl-12 font-mono tabular-nums italic text-muted-foreground text-sm">
            {formatPercent(subRatioSum)}
          </TableCell>
          <TableCell className="pl-12 font-mono tabular-nums text-right italic text-muted-foreground text-sm">
            {formatCNY(subAmountSum)}
          </TableCell>
          <TableCell className="pl-12 text-center text-muted-foreground">—</TableCell>
          <TableCell className="text-center text-muted-foreground">—</TableCell>
        </TableRow>
      )}
    </>
  );
}
