"use client";

/**
 * 记账时的资金账户选择块（设计稿屏 6 核心新增字段）.
 *
 * 交互设计：
 * - 账户块默认**折叠成一行**（当前选择 + 余额），点开才展开列表——避免把既有记账
 *   动线撑长（SPEC R4）；
 * - 方向切换时清空选择（流出=付款账户，流入=收款账户，同一个 id 语义不同，混用会挂错）；
 * - 选中后直接预览「记账后余额 X → Y」，防止提交后才发现选错卡；
 * - 勾「没走账户」时要求备注（跟投/往来/代收代付），未填由表单校验拦截。
 */

import * as React from "react";
import { AlertTriangle, ChevronDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCNY } from "@/lib/formatters";
import type { components } from "@/lib/api-types";
import { ACCOUNT_TYPES, AccountGlyph } from "@/app/(main)/admin/accounts/_components/account-card";

/**
 * 账户选择所需的**最小**信息：只有未解锁时才拿得到（不含余额）。
 * 解锁后传入的对象会额外带 balance/inflow_total 等字段。
 */
export type AccountOptionLike = Pick<
  components["schemas"]["FundAccountOption"],
  "id" | "name" | "type" | "account_no" | "status"
> & {
  /**
   * 余额：**仅解锁时存在**。undefined 表示未解锁 —— UI 必须隐藏金额，
   * 不能显示成「¥0.00」（那会把「看不到」误读成「没钱」）。
   */
  balance?: number | null;
};

interface AccountPickerProps {
  accounts: AccountOptionLike[];
  /** "out" = 花出去（付款账户）；"in" = 收进来（收款账户） */
  direction: "out" | "in";
  value: string;
  skipped: boolean;
  /** 已填金额，用于预览记账后余额 */
  amount: number;
  onChange: (accountId: string) => void;
  onToggleSkipped: (skipped: boolean) => void;
  error?: string;
  noteError?: string;
  /** 账户列表为空（未解锁 / 未建账户）：提示去解账或建账户 */
  lockedHint?: boolean;
  /** 「去解锁/建账户」入口（新标签打开资金账户页） */
  onGoUnlock?: () => void;
  /** 跳去新建账户（当前页无法直接建，由父级决定行为） */
  onCreateAccount?: () => void;
}

export function AccountPicker({
  accounts,
  direction,
  value,
  skipped,
  amount,
  onChange,
  onToggleSkipped,
  error,
  noteError,
  lockedHint = false,
  onGoUnlock,
  onCreateAccount,
}: AccountPickerProps) {
  // 默认展开：让用户一进来就看到全部可选账户，而不是先点一下「选一个账户」
  const [expanded, setExpanded] = React.useState(true);

  // 余额可见性：只要拿到 balance 就说明模块已解锁（未解锁时接口不返回该字段）。
  // 逐项判断而非全局开关，避免部分数据缺失时误显示「¥0.00」这种假数字。
  const hasBalance = accounts.some((item) => item.balance !== null && item.balance !== undefined);

  // 停用账户不能承接新记账（后端会 400），故列表只给在用账户
  const activeAccounts = accounts.filter((item) => item.status === "active");
  const selected = activeAccounts.find((item) => item.id === value) ?? null;
  const label = direction === "out" ? "付款账户" : "收款账户";

  return (
    <div
      className={cn(
        "rounded-[18px] px-3.5 py-3",
        skipped
          ? "bg-apricot-wash/34 inset-ring-1 inset-ring-rust/15"
          : "bg-white inset-ring-1 inset-ring-dove/25",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-[480] text-ink">
          {label} <span className="text-destructive">*</span>
        </span>
        {onCreateAccount ? (
          <button
            type="button"
            onClick={onCreateAccount}
            className="inline-flex items-center gap-0.5 text-[11.5px] text-graphite hover:text-ink"
          >
            <Plus className="h-3 w-3" />
            新账户
          </button>
        ) : null}
      </div>
      <p className="mt-0.5 mb-2 text-[11.5px] text-graphite">
        {direction === "out" ? "钱从哪张卡出？" : "钱进哪张卡？"}
        {skipped ? "" : " · 必填"}
      </p>

      {/* 账户列表不可得（未解锁 / 尚未建账户）：明确提示，不静默变空 */}
      {!skipped && activeAccounts.length === 0 && lockedHint ? (
        <div className="flex items-start gap-2 rounded-inputs bg-apricot-wash/60 px-3 py-2.5 text-[12px] leading-relaxed text-rust">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            还没可用账户，或资金账户未解锁。
            {onGoUnlock ? (
              <button
                type="button"
                onClick={onGoUnlock}
                className="ml-1 underline underline-offset-2"
              >
                去资金账户
              </button>
            ) : null}
            <span className="block text-[11.5px] text-rust/80">
              也可以勾「没走账户」，但需写备注说明原因。
            </span>
          </span>
        </div>
      ) : null}

      {!skipped ? (
        <>
          {/* 默认直接展开全部账户：一进来就能点选，不需要先点「选一个账户」 */}
          {expanded ? (
            <div className="grid max-h-56 gap-1 overflow-y-auto pr-0.5">
              {activeAccounts.length === 0 ? (
                <p className="rounded-inputs bg-apricot-wash/60 px-3 py-2.5 text-[12px] text-rust">
                  还没有在用的账户，请先到「资金账户」新建一个。
                </p>
              ) : (
                activeAccounts.map((account) => {
                  const isSelected = account.id === value;
                  return (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => {
                        onChange(account.id);
                        // 选完收起，给下方「付给谁/哪天」腾出空间
                        setExpanded(false);
                      }}
                      className={cn(
                        "flex items-center gap-2.5 rounded-inputs px-3 py-2 text-left transition-colors",
                        // 内描边：该块在可滚动容器内，外描边会被裁切
                        isSelected ? "bg-fog inset-ring-1 inset-ring-ink" : "hover:bg-fog/70",
                      )}
                      aria-pressed={isSelected}
                    >
                      <span
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
                          isSelected ? "bg-ink" : "ring-1 ring-dove/50",
                        )}
                        aria-hidden="true"
                      >
                        {isSelected ? <i className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
                      </span>
                      <AccountGlyph type={account.type} size={26} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-ink">{account.name}</span>
                        <span className="block truncate font-mono text-[11px] text-graphite">
                          {account.account_no || "—"}
                        </span>
                      </span>
                      {/* 余额仅在解锁后显示；未解锁时接口根本不返回该字段 */}
                      {hasBalance ? (
                        <span className="shrink-0 text-[12px] tabular-nums text-graphite">
                          {account.balance !== null && account.balance !== undefined
                            ? formatCNY(Number(account.balance))
                            : ""}
                        </span>
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
          ) : selected ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="flex w-full items-center gap-2.5 rounded-inputs bg-fog/70 px-3 py-2.5 text-left transition-colors hover:bg-fog"
              aria-expanded={false}
            >
              <AccountGlyph type={selected.type} size={30} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium text-ink">
                  {selected.name}
                </span>
                <span className="block truncate font-mono text-[11.5px] text-graphite">
                  {selected.account_no || "—"} · {ACCOUNT_TYPES[selected.type]?.label}
                </span>
              </span>
              {hasBalance && selected.balance !== null && selected.balance !== undefined ? (
                <span className="shrink-0 text-[12.5px] tabular-nums text-graphite">
                  {formatCNY(Number(selected.balance))}
                </span>
              ) : null}
              <ChevronDown
                className="h-3.5 w-3.5 shrink-0 text-graphite"
                aria-hidden="true"
              />
            </button>
          ) : null}
        </>
      ) : (
        <div className="flex items-center gap-2.5 rounded-inputs bg-white px-3.5 py-3 ring-1 ring-rust/20">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rust" aria-hidden="true" />
          <span className="text-[12.5px] leading-relaxed text-rust">
            这笔只记在项目上，<b>不算进任何账户</b>。
          </span>
        </div>
      )}

      {/* 「没走账户」开关 */}
      <button
        type="button"
        onClick={() => {
          onToggleSkipped(!skipped);
          setExpanded(false);
        }}
        className="mt-2 flex items-center gap-2 rounded-lg px-0.5 py-1.5 text-left"
        aria-pressed={skipped}
      >
        <span
          className={cn(
            "flex h-4 w-4 shrink-0 items-center justify-center rounded-md",
            skipped ? "bg-ink text-white" : "bg-white ring-1 ring-dove/50",
          )}
          aria-hidden="true"
        >
          {skipped ? <i className="h-1.5 w-1.5 rounded-[1px] bg-white" /> : null}
        </span>
        <span>
          <span
            className={cn(
              "block text-[13px]",
              skipped ? "font-medium text-rust" : "text-ink",
            )}
          >
            没走账户
          </span>
          <span className="block text-[11.5px] text-graphite">跟投、往来、代收代付</span>
        </span>
      </button>

      {error ? (
        <p className="mt-1.5 flex items-center gap-1 text-[11.5px] text-destructive">
          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
          {error}
        </p>
      ) : null}
      {skipped && noteError ? (
        <p className="mt-1 flex items-center gap-1 text-[11.5px] text-destructive">
          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
          {noteError}
        </p>
      ) : null}

      {/* 记账后余额预览 */}
      {!skipped && selected && amount > 0 ? (
        <p className="mt-2 flex flex-wrap items-center gap-1 text-[11.5px] text-graphite">
          记账后 {selected.name} 余额 {formatCNY(Number(selected.balance))} →{" "}
          <b
            className={cn(
              "font-[480]",
              direction === "out" ? "text-money-negative" : "text-money-positive",
            )}
          >
            {formatCNY(
              Number(selected.balance) + (direction === "out" ? -amount : amount),
            )}
          </b>
        </p>
      ) : null}
    </div>
  );
}
