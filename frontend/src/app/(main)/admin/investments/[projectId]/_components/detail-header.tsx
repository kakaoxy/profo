"use client";

import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle,
  Copy,
  Download,
  Lock,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type InvestmentResponse, SettlementBadge } from "./shared";

/** 只读模式顶部操作栏：返回链接、标题、结算状态、编辑/结算/导出/更多操作 */
export function DetailHeader({
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
