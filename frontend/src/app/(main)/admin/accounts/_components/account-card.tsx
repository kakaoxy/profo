"use client";

/**
 * 资金账户展示组件（卡片 + 表格 + 类型图标）.
 *
 * 视觉对齐设计稿屏 1：卡片看「钱在哪」（余额 + 进出条 + 核对标签），表格看
 * 「一排数字对着核」（起始/进/出/核对/现在有），切换不跳页。
 * 金额颜色沿用项目 token：`text-money-positive` 红=流入，`text-money-negative` 绿=流出。
 */

import * as React from "react";
import {
  Building2,
  ChevronRight,
  CreditCard,
  Landmark,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  QrCode,
  Scale,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCNY } from "@/lib/formatters";
import type { components } from "@/lib/api-types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type FundAccount = components["schemas"]["FundAccountResponse"];
export type FundAccountType = components["schemas"]["FundAccountType"];
export type FundAccountStatus = components["schemas"]["FundAccountStatus"];

export const ACCOUNT_TYPES: Record<
  FundAccountType,
  { label: string; icon: React.ElementType; glyph: string }
> = {
  bank: { label: "银行卡", icon: Landmark, glyph: "bg-sky-wash text-[#24497f]" },
  corp: { label: "对公账户", icon: Building2, glyph: "bg-sky-wash text-[#24497f]" },
  wechat: { label: "微信", icon: MessageCircle, glyph: "bg-[#dcefdf] text-[#1f6b3a]" },
  alipay: { label: "支付宝", icon: QrCode, glyph: "bg-[#dde8fb] text-[#21549e]" },
  cash: { label: "现金", icon: CreditCard, glyph: "bg-apricot-wash text-rust" },
};

export const ACCOUNT_TYPE_OPTIONS = Object.entries(ACCOUNT_TYPES).map(([value, meta]) => ({
  value: value as FundAccountType,
  label: meta.label,
}));

/** 账户类型图标（尺寸可调，供卡片/表格/下拉共用） */
export function AccountGlyph({
  type,
  size = 38,
  className,
}: {
  type: FundAccountType;
  size?: number;
  className?: string;
}) {
  const meta = ACCOUNT_TYPES[type] ?? ACCOUNT_TYPES.bank;
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        meta.glyph,
        className,
      )}
      style={{ width: size, height: size, borderRadius: Math.round(size / 3.2) }}
      aria-hidden="true"
    >
      <Icon style={{ width: Math.round(size * 0.48), height: Math.round(size * 0.48) }} />
    </span>
  );
}

/** 状态胶囊 */
export function StatusPill({ status }: { status: FundAccountStatus }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-fog px-2.5 py-1 text-[12px] text-graphite">
        <i className="h-1.5 w-1.5 rounded-full bg-ink" aria-hidden="true" />
        启用
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[12px] text-graphite ring-1 ring-dove/30">
      已停用
    </span>
  );
}

interface AccountActions {
  onOpen: (accountId: string) => void;
  onEdit: (accountId: string) => void;
  onReconcile: (accountId: string) => void;
  onToggleStatus: (account: FundAccount) => void;
}

/** 卡片视图中的单个账户 */
export function AccountCard({
  account,
  actions,
}: {
  account: FundAccount;
  actions: AccountActions;
}) {
  const inflow = Number(account.inflow_total ?? 0);
  const outflow = Number(account.outflow_total ?? 0);
  const adjust = Number(account.adjust_total ?? 0);
  const total = Math.max(inflow + outflow, 1);
  const inRatio = (inflow / total) * 100;
  const isOff = account.status === "off";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => actions.onOpen(account.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          actions.onOpen(account.id);
        }
      }}
      className={cn(
        "flex cursor-pointer flex-col gap-3.5 rounded-cards px-5.5 py-5 text-left transition-[transform,box-shadow]",
        isOff
          ? "bg-white/55 ring-1 ring-dove/25"
          : "bg-white shadow-steep-sm hover:-translate-y-0.5 hover:shadow-steep",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <AccountGlyph type={account.type} />
          <div className="min-w-0">
            <div
              className={cn(
                "truncate text-[15px] leading-tight font-medium",
                isOff ? "text-graphite" : "text-ink",
              )}
            >
              {account.name}
            </div>
            <div className="mt-1 truncate font-mono text-[11.5px] text-graphite">
              {account.account_no || "—"}
            </div>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 rounded-full text-graphite hover:bg-ink/5 hover:text-ink"
              aria-label="更多操作"
              onClick={(event) => event.stopPropagation()}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={() => actions.onEdit(account.id)}>
              <Pencil className="h-3.5 w-3.5" />
              改信息
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => actions.onReconcile(account.id)}>
              <Scale className="h-3.5 w-3.5" />
              核对余额
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => actions.onOpen(account.id)}>
              <Wallet className="h-3.5 w-3.5" />
              看流水
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => actions.onToggleStatus(account)}>
              {isOff ? "重新启用" : "停用"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div>
        <div className="mb-1 text-[11.5px] text-graphite">现在有</div>
        <div
          className={cn(
            "text-[26px] leading-tight font-[480] tracking-[-0.02em] tabular-nums",
            isOff ? "text-graphite" : "text-ink",
          )}
        >
          {formatCNY(account.balance)}
        </div>
      </div>

      <div>
        <div className="flex h-[3px] overflow-hidden rounded-full bg-fog">
          <i
            className="block h-full bg-money-positive/75"
            style={{ width: `${inRatio}%` }}
            aria-hidden="true"
          />
          <i
            className="block h-full bg-money-negative/55"
            style={{ width: `${100 - inRatio}%` }}
            aria-hidden="true"
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3.5 text-[12px] text-graphite">
          <span>
            进{" "}
            <b className="font-[480] text-money-positive tabular-nums">{formatCNY(inflow)}</b>
          </span>
          <span>
            出{" "}
            <b className="font-[480] text-money-negative tabular-nums">{formatCNY(outflow)}</b>
          </span>
          {adjust !== 0 ? (
            <span className="rounded-lg bg-apricot-wash/72 px-1.5 py-0.5 text-[11.5px] text-rust">
              已核对 {adjust > 0 ? "+" : "−"}
              {formatCNY(Math.abs(adjust))}
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2.5 text-[12px] text-graphite">
        <span>
          {ACCOUNT_TYPES[account.type]?.label} · 最后记账 {account.last_flow_date ?? "—"}
        </span>
        <span className="flex items-center gap-1.5">
          <StatusPill status={account.status} />
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </div>
    </div>
  );
}

/** 「新建账户」占位卡（网格最后一个） */
export function NewAccountCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[190px] flex-col items-center justify-center gap-2.5 rounded-cards bg-transparent px-5 py-5 ring-[1.5px] ring-dove/25 transition-colors hover:bg-white/60"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-white shadow-steep-sm">
        <Plus className="h-4.5 w-4.5 text-ink" aria-hidden="true" />
      </span>
      <span className="text-[13.5px] font-medium text-ink">新建账户</span>
      <span className="text-[12px] text-graphite">银行卡 / 微信 / 支付宝 / 现金</span>
    </button>
  );
}

/** 表格视图 */
export function AccountTable({
  accounts,
  actions,
}: {
  accounts: FundAccount[];
  actions: Pick<AccountActions, "onOpen" | "onEdit" | "onReconcile">;
}) {
  return (
    <div className="overflow-hidden rounded-cards bg-white shadow-steep-sm">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-6 text-[12.5px] text-graphite">账户</TableHead>
            <TableHead className="text-[12.5px] text-graphite">类型</TableHead>
            <TableHead className="text-right text-[12.5px] text-graphite">起始</TableHead>
            <TableHead className="text-right text-[12.5px] text-graphite">进账</TableHead>
            <TableHead className="text-right text-[12.5px] text-graphite">出账</TableHead>
            <TableHead className="text-right text-[12.5px] text-graphite">核对</TableHead>
            <TableHead className="text-right text-[12.5px] text-graphite">现在有</TableHead>
            <TableHead className="text-center text-[12.5px] text-graphite">状态</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.map((account) => {
            const adjust = Number(account.adjust_total ?? 0);
            return (
              <TableRow
                key={account.id}
                className="cursor-pointer text-[13.5px] hover:bg-fog/85"
                onClick={() => actions.onOpen(account.id)}
              >
                <TableCell className="pl-6">
                  <div className="flex items-center gap-2.5">
                    <AccountGlyph type={account.type} size={32} />
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-[480] text-ink">{account.name}</div>
                      <div className="truncate font-mono text-[12px] text-graphite">
                        {account.account_no || "—"} · {account.holder || "—"}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-ash">{ACCOUNT_TYPES[account.type]?.label}</TableCell>
                <TableCell className="text-right tabular-nums text-ash">
                  {formatCNY(account.opening_balance)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-money-positive">
                  {formatCNY(account.inflow_total ?? 0)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-money-negative">
                  {formatCNY(account.outflow_total ?? 0)}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right tabular-nums",
                    adjust !== 0 ? "text-rust" : "text-dove",
                  )}
                >
                  {adjust !== 0
                    ? `${adjust > 0 ? "+" : "−"}${formatCNY(Math.abs(adjust))}`
                    : "—"}
                </TableCell>
                <TableCell className="text-right font-[480] tabular-nums text-ink">
                  {formatCNY(account.balance)}
                </TableCell>
                <TableCell className="text-center">
                  <StatusPill status={account.status} />
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full text-graphite hover:bg-ink/5 hover:text-ink"
                      aria-label="编辑账户"
                      onClick={(event) => {
                        event.stopPropagation();
                        actions.onEdit(account.id);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full text-graphite hover:bg-apricot-wash/60 hover:text-rust"
                      aria-label="核对余额"
                      onClick={(event) => {
                        event.stopPropagation();
                        actions.onReconcile(account.id);
                      }}
                    >
                      <Scale className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <div className="flex items-center justify-between gap-3 border-t border-dove/20 px-5 py-3.5 text-[13px] text-graphite">
        <span>
          共 {accounts.length} 个 · 合计{" "}
          <b className="font-[500] text-ink">
            {formatCNY(accounts.reduce((sum, item) => sum + Number(item.balance), 0))}
          </b>
        </span>
        <span className="text-dove">起始 + 进账 − 出账 ± 核对</span>
      </div>
    </div>
  );
}
