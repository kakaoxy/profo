"use client";

/**
 * 跟投详情视图共享工具与小型展示组件
 *
 * 包含：数值/比例工具函数（toNum / ratioColorClass / countTotalInvestors）、
 * 数值容差常量 RATIO_EPS、投资人类型图标 InvestorTypeIcon、
 * 信息单元格 InfoCell、结算状态徽章 SettlementBadge、
 * 以及多个详情子组件共用的 API 类型别名。
 */

import { Building2, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { components } from "@/lib/api-types";

export type InvestmentResponse = components["schemas"]["InvestmentResponse"];
export type InvestorResponse = components["schemas"]["InvestorResponse"];
export type InvestmentLogResponse = components["schemas"]["InvestmentLogResponse"];
export type InvestmentActionType = components["schemas"]["InvestmentActionType"];

/** 数值容差（浮点合计比较） */
export const RATIO_EPS = 0.01;

/** 字符串/数字安全转 number，空或非法返回 0 */
export function toNum(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return isNaN(n) ? 0 : n;
}

/** 回报率配色：正绿 / 负红 / 零灰 */
export function ratioColorClass(ratio: number): string {
  if (ratio > 0) return "text-emerald-600 dark:text-emerald-400";
  if (ratio < 0) return "text-red-600 dark:text-red-400";
  return "text-muted-foreground";
}

/** 投资人总数 = 各母投资方子投资人数之和，无子投资人则母投资方算 1 人 */
export function countTotalInvestors(investors: InvestorResponse[]): number {
  return investors.reduce((sum, inv) => {
    const subCount = inv.sub_investors?.length ?? 0;
    return sum + (subCount > 0 ? subCount : 1);
  }, 0);
}

/** 投资方类型图标（企业/个人） */
export function InvestorTypeIcon({ type }: { type: InvestorResponse["type"] }) {
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

/** 信息单元格：标签 + 值 */
export function InfoCell({
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

/** 结算状态徽章 */
export function SettlementBadge({ status }: { status: string }) {
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
