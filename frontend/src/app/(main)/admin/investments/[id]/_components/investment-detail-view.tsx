"use client";

/**
 * 跟投详情视图（Phase 3 只读 + Phase 4 编辑模式 + Phase 5 收益分配/结算流转）
 *
 * 本文件 >250 行：只读视图（4 个卡片区）与编辑视图共享同一 `investment` prop 与数值
 * 派生逻辑（toNum / 比例计算），拆分会引入大量重复 props 传递。编辑模式按交互边界
 * 抽出 InvestorDialog（investor-dialog.tsx）；Phase 5 弹窗（调整回报率/结算/反结算/复制）
 * 抽出独立组件文件；其余编辑态（基础信息、投资方表格内联编辑、总额联动确认、保存提交）
 * 与只读视图共用派生工具，保留在同文件内。
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Pencil,
  Download,
  Plus,
  Settings,
  Lock,
  Building2,
  User,
  Trash2,
  Save,
  X,
  AlertTriangle,
  MoreHorizontal,
  CheckCircle,
  RotateCcw,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatCNY, formatPercent, safeFormatDate } from "@/lib/formatters";
import type { components } from "@/lib/api-types";
import {
  addInvestor,
  deleteInvestor,
  deleteInvestment,
  updateInvestment,
  updateInvestor,
} from "../../actions";
import {
  InvestorDialog,
  type LocalInvestor,
  type LocalSubInvestor,
} from "./investor-dialog";
import { ReturnRatioDialog } from "./return-ratio-dialog";
import { SettleDialog } from "./settle-dialog";
import { UnsettleDialog } from "./unsettle-dialog";
import { CopyInvestmentDialog } from "./copy-investment-dialog";

type InvestmentResponse = components["schemas"]["InvestmentResponse"];
type InvestorResponse = components["schemas"]["InvestorResponse"];
type InvestmentLogResponse = components["schemas"]["InvestmentLogResponse"];
type InvestmentActionType = components["schemas"]["InvestmentActionType"];
type InvestmentUpdate = components["schemas"]["InvestmentUpdate"];
type InvestorCreate = components["schemas"]["InvestorCreate"];
type InvestorUpdate = components["schemas"]["InvestorUpdate"];

interface DetailViewProps {
  investment: InvestmentResponse;
}

/** 字符串/数字安全转 number，空或非法返回 0 */
function toNum(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return isNaN(n) ? 0 : n;
}

/** 回报率配色：正绿 / 负红 / 零灰 */
function ratioColorClass(ratio: number): string {
  if (ratio > 0) return "text-emerald-600 dark:text-emerald-400";
  if (ratio < 0) return "text-red-600 dark:text-red-400";
  return "text-muted-foreground";
}

/** 投资人总数 = 各母投资方子投资人数之和，无子投资人则母投资方算 1 人 */
function countTotalInvestors(investors: InvestorResponse[]): number {
  return investors.reduce((sum, inv) => {
    const subCount = inv.sub_investors?.length ?? 0;
    return sum + (subCount > 0 ? subCount : 1);
  }, 0);
}

/** 操作日志内容：action_type 翻译为中文 + detail 摘要 */
function formatLogContent(
  actionType: InvestmentActionType,
  detail: { [key: string]: unknown } | undefined,
): string {
  const d = detail ?? {};
  const str = (v: unknown): string => (v == null ? "" : String(v));
  switch (actionType) {
    case "create":
      return `创建跟投记录${
        d.total_investment ? `，投资总额 ${formatCNY(str(d.total_investment))}` : ""
      }`;
    case "status_change":
      return `状态变更${d.action === "soft_delete" ? "（软删除）" : ""}`;
    case "ratio_adjust":
      return `调整回报率${
        d.default_ratio ? `，默认回报率 ${d.default_ratio}%` : ""
      }${d.count ? `，共 ${d.count} 项` : ""}`;
    case "investor_add":
      return `添加投资方：${d.name ?? "-"}${
        d.share_ratio ? `（${d.share_ratio}%）` : ""
      }${d.sub_count ? `，含 ${d.sub_count} 位子投资人` : ""}`;
    case "investor_edit":
      return `编辑投资方：${d.name ?? "-"}`;
    case "investor_delete":
      return `删除投资方：${d.name ?? "-"}`;
    case "sub_investor_add":
      return `添加子投资人${d.name ? `：${d.name}` : ""}`;
    case "sub_investor_edit":
      return `编辑子投资人${d.name ? `：${d.name}` : ""}`;
    case "sub_investor_delete":
      return `删除子投资人${d.name ? `：${d.name}` : ""}`;
    case "total_investment_change": {
      const ti = d.total_investment as { from?: string; to?: string } | undefined;
      return `修改投资总额${
        ti ? `：${formatCNY(ti.from)} → ${formatCNY(ti.to)}` : ""
      }`;
    }
    case "total_return_change": {
      const tr = d.total_return as { from?: string; to?: string } | undefined;
      return `修改收益总额${
        tr ? `：${formatCNY(tr.from)} → ${formatCNY(tr.to)}` : ""
      }`;
    }
    case "settle":
      return `结算跟投记录${
        d.settled_date ? `，结算日期 ${d.settled_date}` : ""
      }`;
    case "unsettle":
      return `反结算：${d.reason ?? "-"}`;
    default:
      return actionType;
  }
}

function SettlementBadge({ status }: { status: string }) {
  if (status === "settled") {
    return (
      <Badge
        variant="secondary"
        className="gap-1.5 bg-emerald-500/10 text-emerald-600 border-transparent px-3 py-1"
      >
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        跟投状态：已结算
      </Badge>
    );
  }
  return (
    <Badge
      variant="secondary"
      className="gap-1.5 bg-blue-500/10 text-blue-600 border-transparent px-3 py-1"
    >
      <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
      跟投状态：未结算
    </Badge>
  );
}

function DetailHeader({
  investment,
  onSettle,
  onUnsettle,
  onDelete,
  onCopy,
}: {
  investment: InvestmentResponse;
  onSettle: () => void;
  onUnsettle: () => void;
  onDelete: () => void;
  onCopy: () => void;
}) {
  const isSettled = investment.settlement_status === "settled";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <Link
            href="/admin/investments"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
          >
            <ArrowLeft className="h-4 w-4" />
            返回跟投列表
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            💰 跟投详情 — {investment.project_code || "-"}{" "}
            {investment.project_name || ""}
          </h1>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <SettlementBadge status={investment.settlement_status} />
          {isSettled ? (
            <Button
              variant="outline"
              size="sm"
              disabled
              className="gap-1.5"
              title="已结算，不可编辑"
            >
              <Pencil className="h-4 w-4" />
              编辑
            </Button>
          ) : (
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link href={`?edit=1`} prefetch={false}>
                <Pencil className="h-4 w-4" />
                编辑
              </Link>
            </Button>
          )}
          {isSettled ? (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={onUnsettle}
            >
              <RotateCcw className="h-4 w-4" />
              反结算
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={onSettle}
            >
              <CheckCircle className="h-4 w-4" />
              结算
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled
            className="gap-1.5 text-muted-foreground"
            title="导出功能暂未实现"
          >
            <Download className="h-4 w-4" />
            导出
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5">
                <MoreHorizontal className="h-4 w-4" />
                更多操作
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onCopy}>
                <Copy className="h-4 w-4" />
                复制跟投配置
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={onDelete}
              >
                <Trash2 className="h-4 w-4" />
                删除跟投记录
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {isSettled && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 px-4 py-2.5 text-sm text-amber-700 dark:text-amber-400">
          <Lock className="h-4 w-4 shrink-0" />
          <span>该项目已结算，不可编辑</span>
        </div>
      )}
    </div>
  );
}

function InfoCell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </label>
      <div className="text-sm font-medium text-foreground">{children}</div>
    </div>
  );
}

function BasicInfoCard({ investment }: { investment: InvestmentResponse }) {
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
                totalReturn > 0 && "text-emerald-600 dark:text-emerald-400",
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

function InvestorTypeIcon({ type }: { type: InvestorResponse["type"] }) {
  if (type === "enterprise") {
    return (
      <span className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
        <Building2 className="h-4 w-4 text-muted-foreground" />
      </span>
    );
  }
  return (
    <span className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
      <User className="h-4 w-4 text-muted-foreground" />
    </span>
  );
}

function InvestorsCard({ investment }: { investment: InvestmentResponse }) {
  const investors = investment.investors ?? [];
  const totalInvestment = toNum(investment.total_investment);
  const totalInvestorCount = countTotalInvestors(investors);
  const totalRatio = investors.reduce(
    (sum, inv) => sum + toNum(inv.share_ratio),
    0,
  );

  if (investors.length === 0) {
    return (
      <Card>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <span>👥</span>
              投资方管理
            </h2>
            <Button
              variant="outline"
              size="sm"
              disabled
              className="gap-1.5"
              title="只读模式不可用"
            >
              <Plus className="h-4 w-4" />
              添加投资方
            </Button>
          </div>
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <span className="text-3xl">📭</span>
            <p className="text-sm text-muted-foreground">暂无投资方</p>
            <p className="text-xs text-muted-foreground">
              点击下方按钮开始录入投资方信息
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled
              className="gap-1.5"
              title="只读模式不可用"
            >
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
          <Button
            variant="outline"
            size="sm"
            disabled
            className="gap-1.5"
            title="只读模式不可用"
          >
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
                const subRatioSum = subs.reduce(
                  (s, sub) => s + toNum(sub.share_ratio),
                  0,
                );
                const subAmountSum = subs.reduce(
                  (s, sub) => s + toNum(sub.invest_amount),
                  0,
                );
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
                <TableCell className="text-center font-bold">
                  {totalInvestorCount}人
                </TableCell>
                <TableCell className="text-center text-muted-foreground">
                  —
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

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
        <TableCell className="text-center">
          {subCount > 0 ? `${subCount}人` : "—"}
        </TableCell>
        <TableCell className="text-center text-muted-foreground">—</TableCell>
      </TableRow>
      {subs.map((sub) => (
        <TableRow
          key={sub.id}
          className="border-l-2 border-accent hover:bg-transparent"
        >
          <TableCell className="pl-12 font-normal text-muted-foreground">
            {sub.name}
          </TableCell>
          <TableCell className="pl-12 font-mono tabular-nums font-normal text-muted-foreground">
            {formatPercent(toNum(sub.share_ratio))}
          </TableCell>
          <TableCell className="pl-12 font-mono tabular-nums text-right font-normal text-muted-foreground">
            {formatCNY(sub.invest_amount)}
          </TableCell>
          <TableCell className="pl-12 text-center text-muted-foreground">
            —
          </TableCell>
          <TableCell className="text-center text-muted-foreground">—</TableCell>
        </TableRow>
      ))}
      {subCount > 0 && (
        <TableRow className="border-t border-dashed border-border hover:bg-transparent">
          <TableCell className="pl-12 italic text-muted-foreground text-sm">
            小计
          </TableCell>
          <TableCell className="pl-12 font-mono tabular-nums italic text-muted-foreground text-sm">
            {formatPercent(subRatioSum)}
          </TableCell>
          <TableCell className="pl-12 font-mono tabular-nums text-right italic text-muted-foreground text-sm">
            {formatCNY(subAmountSum)}
          </TableCell>
          <TableCell className="pl-12 text-center text-muted-foreground">
            —
          </TableCell>
          <TableCell className="text-center text-muted-foreground">—</TableCell>
        </TableRow>
      )}
    </>
  );
}

function ProfitDistributionCard({
  investment,
  onAdjustReturn,
  adjustDisabled = false,
}: {
  investment: InvestmentResponse;
  onAdjustReturn: () => void;
  /** 编辑模式下投资方为本地态，调整回报率会与未保存编辑冲突，故禁用 */
  adjustDisabled?: boolean;
}) {
  const investors = investment.investors ?? [];
  const totalInvestment = toNum(investment.total_investment);
  const totalReturn = toNum(investment.total_return);

  const hasNoInvestors = investors.length === 0;
  const hasNoReturn =
    investment.total_return === null ||
    investment.total_return === undefined ||
    totalReturn === 0;

  // 默认回报率 = total_return / total_investment × 100%
  const defaultRatio =
    totalInvestment > 0 ? (totalReturn / totalInvestment) * 100 : 0;

  // 调整回报率按钮启用条件：未结算 && 有投资方 && 有收益 && 非编辑禁用
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
                ? "请先保存或取消编辑后再调整回报率"
                : canAdjust
                  ? "调整各投资方回报率"
                  : investment.settlement_status === "settled"
                    ? "已结算，不可调整"
                    : hasNoInvestors
                      ? "暂无投资方"
                      : "暂无收益数据"
            }
          >
            <Settings className="h-4 w-4" />
            调整回报率
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
                <strong className="text-foreground">默认按比例分配</strong>
              </span>
              <span>
                校验状态：<strong className="text-emerald-600">✅ 通过</strong>
              </span>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="min-w-[200px] text-muted-foreground font-medium">
                      投资方
                    </TableHead>
                    <TableHead className="min-w-[140px] text-right text-muted-foreground font-medium">
                      投资金额
                    </TableHead>
                    <TableHead className="min-w-[100px] text-right text-muted-foreground font-medium">
                      回报率
                    </TableHead>
                    <TableHead className="min-w-[140px] text-right text-muted-foreground font-medium">
                      收益金额
                    </TableHead>
                    <TableHead className="min-w-[100px] text-right text-muted-foreground font-medium">
                      占收益比例
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {investors.map((inv, idx) => {
                    const amount = toNum(inv.invest_amount);
                    const profit = (amount * defaultRatio) / 100;
                    const profitRatio =
                      totalReturn > 0 ? (profit / totalReturn) * 100 : 0;
                    return (
                      <TableRow key={inv.id || `inv-${idx}`}>
                        <TableCell className="font-medium">
                          {inv.name}
                        </TableCell>
                        <TableCell className="font-mono tabular-nums text-right">
                          {formatCNY(inv.invest_amount)}
                        </TableCell>
                        <TableCell className="font-mono tabular-nums text-right">
                          {formatPercent(defaultRatio)}
                        </TableCell>
                        <TableCell className="font-mono tabular-nums text-right">
                          {formatCNY(profit)}
                        </TableCell>
                        <TableCell className="font-mono tabular-nums text-right">
                          {formatPercent(profitRatio)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="border-t-2 border-foreground hover:bg-transparent">
                    <TableCell className="font-bold">合计</TableCell>
                    <TableCell className="font-mono tabular-nums font-bold text-right">
                      {formatCNY(totalInvestment)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      —
                    </TableCell>
                    <TableCell className="font-mono tabular-nums font-bold text-right">
                      {formatCNY(totalReturn)}
                    </TableCell>
                    <TableCell className="font-mono tabular-nums font-bold text-right">
                      100.00%
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

function LogsCard({ investment }: { investment: InvestmentResponse }) {
  const logs = investment.logs ?? [];

  return (
    <Card>
      <CardContent className="space-y-5">
        <div>
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <span>📝</span>
            操作日志
          </h2>
        </div>
        {logs.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            暂无操作日志
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="min-w-[150px] text-muted-foreground font-medium">
                    时间
                  </TableHead>
                  <TableHead className="min-w-[130px] text-muted-foreground font-medium">
                    操作人
                  </TableHead>
                  <TableHead className="min-w-[280px] text-muted-foreground font-medium">
                    操作内容
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log: InvestmentLogResponse) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-xs whitespace-nowrap">
                      {safeFormatDate(log.created_at, "yyyy-MM-dd HH:mm")}
                    </TableCell>
                    <TableCell className="text-sm">
                      {log.operator_name || log.operator_id.slice(0, 8)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatLogContent(log.action_type, log.detail)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** 数值容差（浮点合计比较） */
const RATIO_EPS = 0.01;

/** 比例内联输入（保留中间输入态，避免小数点被吞） */
function RatioInput({
  value,
  onChange,
  className,
}: {
  value: number;
  onChange: (n: number) => void;
  className?: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    setText(String(value));
  }, [value]);
  return (
    <Input
      type="number"
      step="0.01"
      min="0"
      max="100"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(parseFloat(e.target.value) || 0);
      }}
      className={className}
    />
  );
}

/** 判断本地投资方是否相对原始数据有变更（决定是否需要 PUT） */
function investorChanged(local: LocalInvestor, original: InvestorResponse): boolean {
  if (local.name !== original.name) return true;
  if (local.type !== original.type) return true;
  if (Math.abs(local.share_ratio - toNum(original.share_ratio)) > 0.001) return true;
  if ((local.remark || "") !== (original.remark || "")) return true;
  const origSubs = original.sub_investors ?? [];
  if (local.sub_investors.length !== origSubs.length) return true;
  for (let i = 0; i < local.sub_investors.length; i++) {
    const ls = local.sub_investors[i];
    const os = origSubs[i];
    if (ls.name !== os.name) return true;
    if (Math.abs(ls.share_ratio - toNum(os.share_ratio)) > 0.001) return true;
    if ((ls.remark || "") !== (os.remark || "")) return true;
  }
  return false;
}

/** 用本地编辑态构造合成 InvestmentResponse，供只读 ProfitDistributionCard 复用展示 */
function buildSyntheticInvestment(
  base: InvestmentResponse,
  totalInvestment: number,
  totalReturn: number,
  investors: LocalInvestor[],
): InvestmentResponse {
  return {
    ...base,
    total_investment: String(totalInvestment),
    total_return: String(totalReturn),
    investors: investors.map((inv) => {
      const amount = (totalInvestment * inv.share_ratio) / 100;
      return {
        id: inv.id ?? "",
        investment_id: base.id,
        name: inv.name,
        type: inv.type,
        share_ratio: String(inv.share_ratio),
        invest_amount: String(amount),
        parent_id: null,
        sort_order: null,
        remark: inv.remark || null,
        sub_investors: inv.sub_investors.map((s) => ({
          id: "",
          investment_id: base.id,
          name: s.name,
          type: inv.type,
          share_ratio: String(s.share_ratio),
          invest_amount: String((amount * s.share_ratio) / 100),
          parent_id: inv.id ?? null,
          sort_order: null,
          remark: s.remark || null,
        })),
      };
    }),
  };
}

/** 投资方编辑子投资人 → 本地结构 */
function toLocalSub(s: InvestorResponse): LocalSubInvestor {
  return {
    name: s.name,
    share_ratio: toNum(s.share_ratio),
    remark: s.remark ?? "",
  };
}

/** 投资方编辑态删除目标 */
interface DeleteTarget {
  kind: "investor" | "sub";
  investorIdx: number;
  subIdx?: number;
  name: string;
}

function InvestmentEditView({ investment }: DetailViewProps) {
  const router = useRouter();

  // 基础信息编辑态
  const [totalInvestment, setTotalInvestment] = useState(
    toNum(investment.total_investment),
  );
  const [totalInput, setTotalInput] = useState(
    String(toNum(investment.total_investment)),
  );
  const [totalReturn, setTotalReturn] = useState(
    toNum(investment.total_return),
  );
  const [totalReturnInput, setTotalReturnInput] = useState(
    String(toNum(investment.total_return)),
  );
  const [remark] = useState(investment.remark ?? "");

  // 投资方编辑态
  const [investors, setInvestors] = useState<LocalInvestor[]>(
    (investment.investors ?? []).map((inv) => ({
      id: inv.id,
      name: inv.name,
      type: inv.type,
      share_ratio: toNum(inv.share_ratio),
      remark: inv.remark ?? "",
      sub_investors: (inv.sub_investors ?? []).map(toLocalSub),
    })),
  );
  const [deletedInvestorIds, setDeletedInvestorIds] = useState<string[]>([]);

  // 弹窗与确认框
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showTotalConfirm, setShowTotalConfirm] = useState(false);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [investorDialogOpen, setInvestorDialogOpen] = useState(false);
  const [editingInvestor, setEditingInvestor] = useState<LocalInvestor | null>(
    null,
  );
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // 派生值
  const totalRatio = investors.reduce((s, inv) => s + inv.share_ratio, 0);
  const totalInvestorCount = investors.reduce(
    (s, inv) => s + (inv.sub_investors.length > 0 ? inv.sub_investors.length : 1),
    0,
  );
  const returnRatio =
    totalInvestment > 0 ? (totalReturn / totalInvestment) * 100 : null;
  const ratioOver = totalRatio > 100 + RATIO_EPS;

  // 投资总额失焦：值变化则弹联动确认
  const handleTotalBlur = (): void => {
    const n = parseFloat(totalInput);
    if (isNaN(n) || n <= 0) {
      setTotalInput(String(totalInvestment));
      return;
    }
    if (Math.abs(n - totalInvestment) > 0.001) {
      setPendingTotal(n);
      setShowTotalConfirm(true);
    }
  };
  const handleTotalConfirm = (): void => {
    setTotalInvestment(pendingTotal);
    setShowTotalConfirm(false);
  };
  const handleTotalCancel = (): void => {
    setTotalInput(String(totalInvestment));
    setShowTotalConfirm(false);
  };

  // 收益总额失焦：直接提交
  const handleReturnBlur = (): void => {
    const n = parseFloat(totalReturnInput);
    setTotalReturn(isNaN(n) || n < 0 ? 0 : n);
  };

  // 投资比例内联编辑
  const handleRatioChange = (idx: number, n: number): void => {
    setInvestors((prev) =>
      prev.map((inv, i) => (i === idx ? { ...inv, share_ratio: n } : inv)),
    );
  };

  // 投资方弹窗
  const openAddInvestor = (): void => {
    setEditingInvestor(null);
    setEditingIndex(null);
    setInvestorDialogOpen(true);
  };
  const openEditInvestor = (idx: number): void => {
    setEditingInvestor(investors[idx]);
    setEditingIndex(idx);
    setInvestorDialogOpen(true);
  };
  const handleSaveInvestor = (inv: LocalInvestor): void => {
    setInvestors((prev) =>
      editingIndex !== null
        ? prev.map((x, i) => (i === editingIndex ? inv : x))
        : [...prev, inv],
    );
    setInvestorDialogOpen(false);
    setEditingInvestor(null);
    setEditingIndex(null);
  };

  // 删除投资方 / 子投资人
  const handleDeleteConfirm = (): void => {
    if (!deleteTarget) return;
    if (deleteTarget.kind === "investor") {
      const target = investors[deleteTarget.investorIdx];
      setInvestors((prev) => prev.filter((_, i) => i !== deleteTarget.investorIdx));
      const tid = target?.id;
      if (tid) {
        setDeletedInvestorIds((prev) => [...prev, tid]);
      }
    } else if (deleteTarget.subIdx !== undefined) {
      setInvestors((prev) =>
        prev.map((inv, i) =>
          i === deleteTarget.investorIdx
            ? {
                ...inv,
                sub_investors: inv.sub_investors.filter(
                  (_, j) => j !== deleteTarget.subIdx,
                ),
              }
            : inv,
        ),
      );
    }
    setDeleteTarget(null);
  };

  // 退出编辑模式
  const handleExit = (): void => {
    router.replace(`/admin/investments/${investment.id}`);
  };

  // 保存前校验所有规则
  const validateAll = (): string | null => {
    if (ratioOver) {
      return `投资比例合计不可超过 100%（当前 ${totalRatio.toFixed(2)}%）`;
    }
    const names = investors.map((inv) => inv.name.trim());
    if (names.some((n) => !n)) return "投资方名称不可为空";
    const nameSet = new Set<string>();
    for (const n of names) {
      if (nameSet.has(n)) return `投资方名称重复：「${n}」`;
      nameSet.add(n);
    }
    for (const inv of investors) {
      if (inv.sub_investors.length > 0) {
        const subSum = inv.sub_investors.reduce(
          (s, sub) => s + sub.share_ratio,
          0,
        );
        if (Math.abs(subSum - 100) > RATIO_EPS) {
          return `投资方「${inv.name}」子投资人内部占比合计需 = 100（当前 ${subSum.toFixed(2)}%）`;
        }
        const subNames = inv.sub_investors.map((s) => s.name.trim());
        if (subNames.some((n) => !n)) {
          return `投资方「${inv.name}」子投资人姓名不可为空`;
        }
        const subSet = new Set<string>();
        for (const n of subNames) {
          if (subSet.has(n)) {
            return `投资方「${inv.name}」子投资人姓名重复：「${n}」`;
          }
          subSet.add(n);
        }
      }
    }
    return null;
  };

  const handleSave = async (): Promise<void> => {
    const err = validateAll();
    if (err) {
      toast.error(err);
      return;
    }
    setIsSaving(true);
    try {
      const investmentId = investment.id;
      const origTotal = toNum(investment.total_investment);
      const origReturn = toNum(investment.total_return);
      const origRemark = investment.remark ?? "";
      const totalChanged = Math.abs(totalInvestment - origTotal) > 0.001;
      const returnChanged = Math.abs(totalReturn - origReturn) > 0.001;
      const remarkChanged = remark !== origRemark;

      // 1. 基础信息（投资总额/收益总额/备注）
      if (totalChanged || returnChanged || remarkChanged) {
        const body: InvestmentUpdate = {};
        if (totalChanged) body.total_investment = totalInvestment;
        if (returnChanged) body.total_return = totalReturn;
        if (remarkChanged) body.remark = remark;
        const res = await updateInvestment(investmentId, body);
        if (!res.success) {
          toast.error(`更新基础信息失败：${res.message}`);
          return;
        }
      }

      // 2. 删除投资方
      for (const invId of deletedInvestorIds) {
        const res = await deleteInvestor(investmentId, invId);
        if (!res.success) {
          toast.error(`删除投资方失败：${res.message}`);
          return;
        }
      }

      // 3. 更新已存在投资方（按"降幅优先"排序，避免中间态合计 > 100%）
      const originalById = new Map(
        (investment.investors ?? []).map((inv) => [inv.id, inv]),
      );
      const toUpdate = investors
        .filter(
          (inv) =>
            inv.id && originalById.has(inv.id) && investorChanged(inv, originalById.get(inv.id)!),
        )
        .sort((a, b) => {
          const da = a.share_ratio - toNum(originalById.get(a.id!)!.share_ratio);
          const db = b.share_ratio - toNum(originalById.get(b.id!)!.share_ratio);
          return da - db;
        });
      for (const inv of toUpdate) {
        const body: InvestorUpdate = {
          name: inv.name,
          type: inv.type,
          share_ratio: inv.share_ratio,
          remark: inv.remark || null,
          sub_investors:
            inv.sub_investors.length > 0
              ? inv.sub_investors.map((s) => ({
                  name: s.name,
                  share_ratio: s.share_ratio,
                  remark: s.remark || null,
                }))
              : null,
        };
        const res = await updateInvestor(investmentId, inv.id!, body);
        if (!res.success) {
          toast.error(`更新投资方「${inv.name}」失败：${res.message}`);
          return;
        }
      }

      // 4. 新增投资方
      const toAdd = investors.filter((inv) => !inv.id);
      for (const inv of toAdd) {
        const body: InvestorCreate = {
          name: inv.name,
          type: inv.type,
          share_ratio: inv.share_ratio,
          remark: inv.remark || null,
          sub_investors:
            inv.sub_investors.length > 0
              ? inv.sub_investors.map((s) => ({
                  name: s.name,
                  share_ratio: s.share_ratio,
                  remark: s.remark || null,
                }))
              : null,
        };
        const res = await addInvestor(investmentId, body);
        if (!res.success) {
          toast.error(`添加投资方「${inv.name}」失败：${res.message}`);
          return;
        }
      }

      toast.success("保存成功");
      router.refresh();
      router.replace(`/admin/investments/${investmentId}`);
    } catch {
      toast.error("保存失败，请稍后重试");
    } finally {
      setIsSaving(false);
    }
  };

  // 弹窗参数
  const dialogExistingNames = investors
    .filter((_, i) => i !== editingIndex)
    .map((inv) => inv.name.trim());
  const dialogOtherRatioSum = investors
    .filter((_, i) => i !== editingIndex)
    .reduce((s, inv) => s + inv.share_ratio, 0);

  const syntheticInvestment = buildSyntheticInvestment(
    investment,
    totalInvestment,
    totalReturn,
    investors,
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <Link
              href="/admin/investments"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
            >
              <ArrowLeft className="h-4 w-4" />
              返回跟投列表
            </Link>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              💰 跟投详情 — {investment.project_code || "-"}{" "}
              {investment.project_name || ""}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <SettlementBadge status={investment.settlement_status} />
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setShowCancelConfirm(true)}
              disabled={isSaving}
            >
              <X className="h-4 w-4" />
              取消
            </Button>
            <Button
              size="sm"
              className="gap-1.5 bg-primary hover:bg-primary/90"
              onClick={handleSave}
              disabled={isSaving}
            >
              <Save className="h-4 w-4" />
              {isSaving ? "保存中..." : "保存"}
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-secondary/10 border border-secondary/30 px-4 py-2.5 text-sm text-secondary">
          <span className="h-2 w-2 rounded-full bg-secondary" />
          <span className="font-medium">编辑模式</span>
          <span className="text-muted-foreground">· 修改完成后请点击「保存」提交</span>
        </div>
      </div>

      {/* 基础信息编辑 */}
      <Card>
        <CardContent className="space-y-6">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <span>📋</span>
            基础信息
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-5">
            <InfoCell label="项目编号">
              <span className="font-mono text-xs">
                {investment.project_code || "-"}
              </span>
            </InfoCell>
            <InfoCell label="小区">{investment.project_name || "-"}</InfoCell>
            <InfoCell label="物业地址">-</InfoCell>
            <InfoCell label="项目状态">-</InfoCell>
            <InfoCell label="跟投状态">
              <SettlementBadge status={investment.settlement_status} />
            </InfoCell>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide">
                投资总额
              </label>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">¥</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={totalInput}
                  onChange={(e) => setTotalInput(e.target.value)}
                  onBlur={handleTotalBlur}
                  className="font-mono tabular-nums"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide">
                收益总额
              </label>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-emerald-600">¥</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={totalReturnInput}
                  onChange={(e) => setTotalReturnInput(e.target.value)}
                  onBlur={handleReturnBlur}
                  className="font-mono tabular-nums"
                />
              </div>
            </div>
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
            <InfoCell label="投资方数量">{investors.length} 个</InfoCell>
            <InfoCell label="投资人总数">{totalInvestorCount} 人</InfoCell>
          </div>
          <div className="flex items-start gap-2 rounded-lg bg-muted/40 border border-border px-4 py-2.5 text-xs text-muted-foreground">
            <span>💡</span>
            <span>
              修改「投资总额」将弹出确认框，确认后自动重算所有投资方与子投资人金额。项目编号/小区/状态/时间等字段只读。
            </span>
          </div>
        </CardContent>
      </Card>

      {/* 投资方管理编辑 */}
      <Card>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <span>👥</span>
              投资方管理
            </h2>
            <Button
              variant="default"
              size="sm"
              className="gap-1.5 bg-primary hover:bg-primary/90"
              onClick={openAddInvestor}
              disabled={isSaving}
            >
              <Plus className="h-4 w-4" />
              添加投资方
            </Button>
          </div>
          {investors.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <span className="text-3xl">📭</span>
              <p className="text-sm text-muted-foreground">暂无投资方</p>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={openAddInvestor}
                disabled={isSaving}
              >
                <Plus className="h-4 w-4" />
                添加投资方
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="min-w-[220px] text-muted-foreground font-medium">
                      投资方
                    </TableHead>
                    <TableHead className="min-w-[120px] text-muted-foreground font-medium">
                      投资占比
                    </TableHead>
                    <TableHead className="min-w-[160px] text-right text-muted-foreground font-medium">
                      投资金额
                    </TableHead>
                    <TableHead className="min-w-[60px] text-center text-muted-foreground font-medium">
                      子投资人
                    </TableHead>
                    <TableHead className="min-w-[200px] text-right text-muted-foreground font-medium">
                      操作
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {investors.map((inv, idx) => {
                    const amount = (totalInvestment * inv.share_ratio) / 100;
                    const subs = inv.sub_investors;
                    const subAmountSum = subs.reduce(
                      (s, sub) => s + (amount * sub.share_ratio) / 100,
                      0,
                    );
                    return (
                      <InvestorEditRowGroup
                        key={inv.id ?? `new-${idx}`}
                        inv={inv}
                        idx={idx}
                        amount={amount}
                        subs={subs}
                        subAmountSum={subAmountSum}
                        onRatioChange={handleRatioChange}
                        onEdit={openEditInvestor}
                        onAddSub={openEditInvestor}
                        onDeleteInvestor={(i, name) =>
                          setDeleteTarget({ kind: "investor", investorIdx: i, name })
                        }
                        onDeleteSub={(i, j, name) =>
                          setDeleteTarget({
                            kind: "sub",
                            investorIdx: i,
                            subIdx: j,
                            name,
                          })
                        }
                        disabled={isSaving}
                      />
                    );
                  })}
                  <TableRow className="border-t-2 border-foreground hover:bg-transparent">
                    <TableCell className="font-bold">合计</TableCell>
                    <TableCell
                      className={cn(
                        "font-mono tabular-nums font-bold",
                        ratioOver && "text-red-500",
                      )}
                    >
                      {formatPercent(totalRatio)}
                    </TableCell>
                    <TableCell className="font-mono tabular-nums font-bold text-right">
                      {formatCNY(totalInvestment)}
                    </TableCell>
                    <TableCell className="text-center font-bold">
                      {totalInvestorCount}人
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
          {ratioOver && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-4 py-2.5 text-sm text-red-600 dark:text-red-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                投资比例合计 {formatPercent(totalRatio)} 超过 100%，请调整后保存
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 收益分配（只读，基于本地编辑态） */}
      <ProfitDistributionCard
        investment={syntheticInvestment}
        onAdjustReturn={() => {}}
        adjustDisabled
      />

      {/* 操作日志（只读） */}
      <LogsCard investment={investment} />

      <div className="rounded-lg bg-secondary/10 border border-secondary/30 px-6 py-3 text-center text-xs text-secondary font-medium">
        ⚠️ 当前为编辑模式。修改完成后请点击右上角「保存」按钮提交。
      </div>

      {/* 取消编辑确认 */}
      <AlertDialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认取消编辑？</AlertDialogTitle>
            <AlertDialogDescription>
              未保存的修改将丢失。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>继续编辑</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleExit}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              确认取消
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 投资总额联动确认 */}
      <Dialog open={showTotalConfirm} onOpenChange={setShowTotalConfirm}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>投资总额变更确认</DialogTitle>
            <DialogDescription>
              修改投资总额将按各投资方比例重算金额，请确认变更。
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-muted-foreground font-medium">
                    投资方
                  </TableHead>
                  <TableHead className="text-right text-muted-foreground font-medium">
                    原金额
                  </TableHead>
                  <TableHead className="text-right text-muted-foreground font-medium">
                    新金额
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {investors.map((inv, i) => {
                  const oldAmt = (totalInvestment * inv.share_ratio) / 100;
                  const newAmt = (pendingTotal * inv.share_ratio) / 100;
                  return (
                    <TableRow key={inv.id ?? `conf-${i}`}>
                      <TableCell className="font-medium">{inv.name}</TableCell>
                      <TableCell className="font-mono tabular-nums text-right text-muted-foreground">
                        {formatCNY(oldAmt)}
                      </TableCell>
                      <TableCell className="font-mono tabular-nums text-right">
                        {formatCNY(newAmt)}
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="border-t-2 border-foreground hover:bg-transparent">
                  <TableCell className="font-bold">合计</TableCell>
                  <TableCell className="font-mono tabular-nums font-bold text-right text-muted-foreground">
                    {formatCNY(totalInvestment)}
                  </TableCell>
                  <TableCell className="font-mono tabular-nums font-bold text-right">
                    {formatCNY(pendingTotal)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleTotalCancel}>
              取消
            </Button>
            <Button
              onClick={handleTotalConfirm}
              className="bg-primary hover:bg-primary/90"
            >
              确认变更
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除？</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.kind === "investor"
                ? `将删除投资方「${deleteTarget.name}」及其全部子投资人。`
                : `将删除子投资人「${deleteTarget?.name}」，删除后请确保内部占比合计仍 = 100。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 添加/编辑投资方弹窗 */}
      <InvestorDialog
        open={investorDialogOpen}
        onOpenChange={setInvestorDialogOpen}
        onSave={handleSaveInvestor}
        investor={editingInvestor}
        totalInvestment={totalInvestment}
        existingNames={dialogExistingNames}
        otherRatioSum={dialogOtherRatioSum}
      />
    </div>
  );
}

/** 编辑态投资方行组（母投资方 + 子投资人 + 小计） */
function InvestorEditRowGroup({
  inv,
  idx,
  amount,
  subs,
  subAmountSum,
  onRatioChange,
  onEdit,
  onAddSub,
  onDeleteInvestor,
  onDeleteSub,
  disabled,
}: {
  inv: LocalInvestor;
  idx: number;
  amount: number;
  subs: LocalSubInvestor[];
  subAmountSum: number;
  onRatioChange: (idx: number, n: number) => void;
  onEdit: (idx: number) => void;
  onAddSub: (idx: number) => void;
  onDeleteInvestor: (idx: number, name: string) => void;
  onDeleteSub: (investorIdx: number, subIdx: number, name: string) => void;
  disabled: boolean;
}) {
  const subRatioSum = subs.reduce((s, sub) => s + sub.share_ratio, 0);
  return (
    <>
      <TableRow className="bg-muted/30 hover:bg-muted/40">
        <TableCell>
          <div className="flex items-center gap-2.5">
            <InvestorTypeIcon type={inv.type} />
            <span className="font-medium">{inv.name}</span>
          </div>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1">
            <RatioInput
              value={inv.share_ratio}
              onChange={(n) => onRatioChange(idx, n)}
              className="h-8 w-24 font-mono tabular-nums"
            />
            <span className="text-sm font-medium text-muted-foreground">%</span>
          </div>
        </TableCell>
        <TableCell className="font-mono tabular-nums text-right">
          {formatCNY(amount)}
        </TableCell>
        <TableCell className="text-center">
          {subs.length > 0 ? `${subs.length}人` : "—"}
        </TableCell>
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-1.5 flex-wrap">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs text-secondary"
              onClick={() => onAddSub(idx)}
              disabled={disabled}
              title="添加子投资人"
            >
              <Plus className="h-3.5 w-3.5" />
              子投资人
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => onEdit(idx)}
              disabled={disabled}
              title="编辑"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
              onClick={() => onDeleteInvestor(idx, inv.name)}
              disabled={disabled}
              title="删除"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
      {subs.map((sub, j) => {
        const subAmount = (amount * sub.share_ratio) / 100;
        return (
          <TableRow
            key={`${idx}-${j}`}
            className="border-l-2 border-accent hover:bg-transparent"
          >
            <TableCell className="pl-12 font-normal text-muted-foreground">
              {sub.name}
            </TableCell>
            <TableCell className="pl-12 font-mono tabular-nums font-normal text-muted-foreground">
              {formatPercent(sub.share_ratio)}
            </TableCell>
            <TableCell className="pl-12 font-mono tabular-nums text-right font-normal text-muted-foreground">
              {formatCNY(subAmount)}
            </TableCell>
            <TableCell className="pl-12 text-center text-muted-foreground">—</TableCell>
            <TableCell className="pl-12 text-right">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => onDeleteSub(idx, j, sub.name)}
                disabled={disabled}
                title="删除"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </TableCell>
          </TableRow>
        );
      })}
      {subs.length > 0 && (
        <TableRow className="border-t border-dashed border-border hover:bg-transparent">
          <TableCell className="pl-12 italic text-muted-foreground text-sm">
            小计
          </TableCell>
          <TableCell
            className={cn(
              "pl-12 font-mono tabular-nums italic text-muted-foreground text-sm",
              Math.abs(subRatioSum - 100) > RATIO_EPS && "text-red-500",
            )}
          >
            {formatPercent(subRatioSum)}
          </TableCell>
          <TableCell className="pl-12 font-mono tabular-nums text-right italic text-muted-foreground text-sm">
            {formatCNY(subAmountSum)}
          </TableCell>
          <TableCell className="pl-12 text-center text-muted-foreground">—</TableCell>
          <TableCell />
        </TableRow>
      )}
    </>
  );
}

export function InvestmentDetailView({ investment }: DetailViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isEditing =
    searchParams.get("edit") === "1" &&
    investment.settlement_status !== "settled";

  // Phase 5 弹窗状态
  const [showReturnDialog, setShowReturnDialog] = useState(false);
  const [showSettleDialog, setShowSettleDialog] = useState(false);
  const [showUnsettleDialog, setShowUnsettleDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async (): Promise<void> => {
    setIsDeleting(true);
    try {
      const res = await deleteInvestment(investment.id);
      if (res.success) {
        toast.success("跟投记录已删除");
        setShowDeleteConfirm(false);
        router.push("/admin/investments");
        router.refresh();
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error("删除失败，请稍后重试");
    } finally {
      setIsDeleting(false);
    }
  };

  if (isEditing) {
    return <InvestmentEditView investment={investment} />;
  }
  return (
    <div className="flex flex-col gap-6">
      <DetailHeader
        investment={investment}
        onSettle={() => setShowSettleDialog(true)}
        onUnsettle={() => setShowUnsettleDialog(true)}
        onDelete={() => setShowDeleteConfirm(true)}
        onCopy={() => setShowCopyDialog(true)}
      />
      <BasicInfoCard investment={investment} />
      <InvestorsCard investment={investment} />
      <ProfitDistributionCard
        investment={investment}
        onAdjustReturn={() => setShowReturnDialog(true)}
      />
      <LogsCard investment={investment} />
      <div className="rounded-lg bg-muted/60 px-6 py-3 text-center text-xs text-muted-foreground">
        ⚠️ 当前为只读模式。点击右上角「编辑」按钮可修改内容。
      </div>

      {/* Phase 5 弹窗 */}
      <ReturnRatioDialog
        open={showReturnDialog}
        onOpenChange={setShowReturnDialog}
        investment={investment}
      />
      <SettleDialog
        open={showSettleDialog}
        onOpenChange={setShowSettleDialog}
        investment={investment}
      />
      <UnsettleDialog
        open={showUnsettleDialog}
        onOpenChange={setShowUnsettleDialog}
        investment={investment}
      />
      <CopyInvestmentDialog
        open={showCopyDialog}
        onOpenChange={setShowCopyDialog}
        investment={investment}
      />

      {/* 删除跟投记录确认（SubTask 5.4.1） */}
      <AlertDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除跟投记录？</AlertDialogTitle>
            <AlertDialogDescription>
              此操作将软删除该跟投记录，相关投资方与日志将保留但不再展示。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "删除中..." : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
