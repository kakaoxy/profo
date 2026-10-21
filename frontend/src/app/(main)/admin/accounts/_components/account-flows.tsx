"use client";

/**
 * 全部账户流水（设计稿屏 4）.
 *
 * 这一页存在的唯一理由：把「没记账户」的账捞出来逐笔补挂。故顶部有告警条 +
 * 「只看没记账户」筛选，行内直接给「补上 / 换账户」入口。
 * 侧重点：这是**进出账流水**，不是余额；页脚写明以免被误读。
 */

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Filter,
  Loader2,
  Lock,
  Plus,
  Scale,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatCNY, safeFormatDate } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageContainer } from "@/app/(main)/admin/_components/page-container";
import { PageHeader } from "@/app/(main)/admin/_components/page-header";
import type { components } from "@/lib/api-types";
import {
  appendAdjustmentReceipts,
  appendRecordReceipts,
  fetchAccountFlows,
  fetchAccounts,
} from "../actions";
import { UNLOCK_DENIED_CODE } from "../_components/account-schema";
import { AccountGlyph, type FundAccount } from "../_components/account-card";
import { FixAccountDialog } from "../_components/fix-account-dialog";
import { ReceiptCell, SupplementDialog } from "@/components/finance/receipt-cell";
import { formatSeconds, SLIDING_TTL_SECONDS, useModuleLock } from "../_components/module-lock-context";

type FundFlowItem = components["schemas"]["FundFlowItem"];

const PAGE_SIZE = 50;

export function AccountFlowsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token, secondsLeft, lock, touch, invalidate } = useModuleLock();

  const [accounts, setAccounts] = React.useState<FundAccount[]>([]);
  const [flows, setFlows] = React.useState<FundFlowItem[]>([]);
  const [total, setTotal] = React.useState(0);
  const [totals, setTotals] = React.useState({
    inflow: 0,
    outflow: 0,
    recordInflow: 0,
    recordOutflow: 0,
    adjustmentInflow: 0,
    adjustmentOutflow: 0,
  });
  const [loading, setLoading] = React.useState(true);

  const [accountId, setAccountId] = React.useState(
    searchParams.get("untracked") === "1" ? "none" : "all",
  );
  const [direction, setDirection] = React.useState<"all" | "in" | "out">("all");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [fixTarget, setFixTarget] = React.useState<FundFlowItem | null>(null);
  // 补传凭证目标：记账行 → 项目账本流水；调整行 → 核对调整记录
  const [supplementTarget, setSupplementTarget] = React.useState<FundFlowItem | null>(null);
  const [supplementing, setSupplementing] = React.useState(false);

  // 核对调整的正负绝对值之和（用于工具栏提示「进出里含调整」）
  const adjustTotal = totals.adjustmentInflow + totals.adjustmentOutflow;

  const untrackedCount = React.useMemo(
    () => flows.filter((flow) => !flow.account_id).length,
    [flows],
  );

  const load = React.useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const [listRes, flowsRes] = await Promise.all([
      fetchAccounts({}, { token }),
      fetchAccountFlows(
        {
          account_id: accountId === "all" || accountId === "none" ? undefined : accountId,
          untracked_only: accountId === "none",
          direction: direction === "all" ? undefined : direction,
          search: search.trim() || undefined,
          page,
          page_size: PAGE_SIZE,
        },
        { token },
      ),
    ]);
    setLoading(false);
    if (listRes.success) setAccounts(listRes.data.items);
    if (!flowsRes.success) {
      // 403 = 服务端判定令牌失效（另一标签页锁定 / 过期 / 改过密码）→ 立即回到锁屏
      if (flowsRes.code === UNLOCK_DENIED_CODE) invalidate();
      toast.error(flowsRes.error);
      return;
    }
    // 请求成功 → 服务端已对本令牌滑动续期 30 分钟，本地倒计时同步重置
    touch(SLIDING_TTL_SECONDS);
    setFlows(flowsRes.data.items);
    setTotal(flowsRes.data.total);
    setTotals({
      inflow: Number(flowsRes.data.total_inflow ?? 0),
      outflow: Number(flowsRes.data.total_outflow ?? 0),
      recordInflow: Number(flowsRes.data.record_inflow ?? 0),
      recordOutflow: Number(flowsRes.data.record_outflow ?? 0),
      adjustmentInflow: Number(flowsRes.data.adjustment_inflow ?? 0),
      adjustmentOutflow: Number(flowsRes.data.adjustment_outflow ?? 0),
    });
  }, [token, accountId, direction, search, page, touch, invalidate]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  /**
   * 补传凭证：两种来源走不同接口
   * - 调整行：`PATCH /admin/accounts/{id}/adjustments/{adjId}/receipts`（仅追加）
   * - 记账行：`PATCH /admin/ledger/{recordId}`（receipt_urls 追加，项目账本已有能力）
   */
  const handleSupplement = async (urls: string[]) => {
    const target = supplementTarget;
    if (!target) return;
    setSupplementing(true);
    const res =
      target.source === "adjustment"
        ? await appendAdjustmentReceipts(
            target.account_id ?? "",
            target.record_id,
            urls,
            token,
          )
        : await appendRecordReceipts(target.record_id, urls);
    setSupplementing(false);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    toast.success("凭证已补传");
    setSupplementTarget(null);
    void load();
  };

  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader
        title="账户流水"
        description="所有账户的进出账（项目记账 + 余额核对调整）。利息、银行卡年费这类与项目无关的收支，用「核对余额」记一条调整即可。"
        actions={
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12px] text-graphite ring-1 ring-dove/30">
              <Clock className="h-3 w-3" aria-hidden="true" />
              还能看 <span className="tabular-nums">{formatSeconds(secondsLeft)}</span>
            </span>
            <Button variant="outline" className="rounded-full text-rust" onClick={() => void lock()}>
              <Lock className="h-3.5 w-3.5" />
              锁定
            </Button>
            <Button
              className="rounded-full bg-ink text-white hover:bg-ink/90"
              onClick={() => router.push("/admin/ledger")}
            >
              <Plus className="h-4 w-4" />
              记一笔
            </Button>
          </>
        }
      />

      {untrackedCount > 0 && accountId !== "none" ? (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-apricot-wash px-4 py-3 text-[12.5px] leading-relaxed text-rust">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            本页有 <b>{untrackedCount} 笔</b>没记账户，不算进任何余额。
          </span>
          <button
            type="button"
            className="underline-offset-2 hover:underline"
            onClick={() => {
              setAccountId("none");
              setPage(1);
            }}
          >
            看看是哪几笔 →
          </button>
        </div>
      ) : null}

      {/* 口径说明：为什么这里会出现「非项目」的行 */}
      <div className="flex items-start gap-2 rounded-2xl bg-sky-wash/50 px-4 py-3 text-[12.5px] leading-relaxed text-[#2b5391]">
        <Scale className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          <b>核对调整也在流水里。</b>利息入账、银行卡年费这类与项目无关的收支，去对应账户点
          「核对余额」填实际余额，差额会作为一条调整记进来（来源标「核对」）。
          余额公式：期初 + 进 − 出 ± 核对，本页合计与它一致。
        </span>
      </div>

      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-9.5 w-full items-center gap-2 rounded-full bg-white px-3.5 ring-1 ring-dove/30 focus-within:ring-[1.5px] focus-within:ring-ink sm:w-62.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-graphite" aria-hidden="true" />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="搜索项目 / 科目 / 对方 / 调整原因"
            className="h-8 border-0 bg-transparent px-0 text-[13.5px] shadow-none focus-visible:ring-0"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="text-graphite hover:text-ink"
              aria-label="清空搜索"
            >
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </div>

        <Select
          value={accountId}
          onValueChange={(value) => {
            setAccountId(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-9.5 w-auto min-w-33 gap-1.5 rounded-full bg-white text-[13.5px] ring-1 ring-dove/30">
            <SelectValue placeholder="全部账户" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部账户</SelectItem>
            <SelectItem value="none">没记账户</SelectItem>
            {accounts.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {account.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="inline-flex gap-0.5 rounded-full bg-ink/5 p-0.75">
          {(
            [
              { value: "all", label: "全部" },
              { value: "out", label: "只看出" },
              { value: "in", label: "只看进" },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setDirection(option.value);
                setPage(1);
              }}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-[13px] transition-colors",
                direction === option.value
                  ? "bg-white text-ink shadow-steep-sm"
                  : "text-graphite hover:text-ink",
              )}
              aria-pressed={direction === option.value}
            >
              {option.label}
            </button>
          ))}
        </div>

        <span className="ml-auto flex flex-wrap items-center gap-4 text-[12.5px] text-graphite">
          <span>
            进 <b className="font-[480] text-money-positive tabular-nums">{formatCNY(totals.inflow)}</b>
          </span>
          <span>
            出{" "}
            <b className="font-[480] text-money-negative tabular-nums">
              {formatCNY(totals.outflow)}
            </b>
          </span>
          <span>
            净{" "}
            <b className="font-[480] text-ink tabular-nums">
              {formatCNY(totals.inflow - totals.outflow)}
            </b>
          </span>
          {adjustTotal > 0 ? (
            <span className="rounded-full bg-sky-wash/60 px-2.5 py-0.5 text-[11.5px] text-[#2b5391]">
              含核对调整 ±{formatCNY(adjustTotal)}
            </span>
          ) : null}
        </span>
      </div>

      {/* 表格 */}
      <div className="overflow-hidden rounded-cards bg-white shadow-steep-sm">
        {loading ? (
          <div className="flex min-h-40 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-graphite" aria-label="加载中" />
          </div>
        ) : flows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-fog text-graphite">
              <Filter className="h-5 w-5" aria-hidden="true" />
            </span>
            <h4 className="text-[15px] font-medium text-ink">没找到流水</h4>
            <p className="text-[13px] text-graphite">换个账户，或清空关键词。</p>
          </div>
        ) : (
          <table className="w-full border-collapse text-[13.5px]">
            <thead>
              <tr className="border-b border-dove/20 text-[12.5px] text-graphite">
                <th className="py-3.5 pr-4 pl-6 text-left font-normal">日期</th>
                <th className="w-24 px-4 py-3.5 text-left font-normal whitespace-nowrap">来源</th>
                <th className="px-4 py-3.5 text-left font-normal">项目 / 科目</th>
                <th className="w-47 px-4 py-3.5 text-left font-normal">账户</th>
                <th className="px-4 py-3.5 text-right font-normal">出账</th>
                <th className="px-4 py-3.5 text-right font-normal">进账</th>
                <th className="px-4 py-3.5 text-left font-normal whitespace-nowrap">记账人</th>
                <th className="w-28 px-4 py-3.5 text-center font-normal whitespace-nowrap">凭证</th>
                <th className="py-3.5 pr-6 pl-4 text-right font-normal" />
              </tr>
            </thead>
            <tbody>
              {flows.map((flow) => {
                const account = accounts.find((item) => item.id === flow.account_id) ?? null;
                const isAdjustment = flow.source === "adjustment";
                const out = Number(flow.outflow ?? 0);
                const inflow = Number(flow.inflow ?? 0);
                return (
                  <tr
                    key={flow.record_id}
                    className={cn(
                      "border-b border-dove/10 last:border-0 hover:bg-fog/70",
                      !flow.account_id && "bg-apricot-wash/18",
                      isAdjustment && "bg-sky-wash/25",
                    )}
                  >
                    <td className="py-3.5 pr-4 pl-6 tabular-nums text-graphite">
                      {safeFormatDate(flow.record_date, "yyyy-MM-dd")}
                    </td>
                    <td className="px-4 py-3.5">
                      {isAdjustment ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-apricot-wash px-2 py-0.5 text-[11.5px] whitespace-nowrap text-rust">
                          <Scale className="h-3 w-3 shrink-0" aria-hidden="true" />
                          核对
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-fog px-2 py-0.5 text-[11.5px] whitespace-nowrap text-graphite">
                          记账
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      {isAdjustment ? (
                        <div>
                          <div className="font-[480] text-rust">非项目收支</div>
                          <div className="mt-0.5 text-[12px] text-graphite">
                            余额核对 · {flow.reason || "—"}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="font-[480] text-ink">
                            {flow.project_id ? (
                              <Link
                                href={`/admin/ledger/${flow.project_id}`}
                                className="hover:text-rust"
                              >
                                {flow.project_name || "—"}
                              </Link>
                            ) : (
                              "—"
                            )}
                          </div>
                          <div className="mt-0.5 text-[12px] text-graphite">
                            {flow.subject_name || "—"}
                            {flow.project_code ? ` · ${flow.project_code}` : ""}
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      {account ? (
                        <Link
                          href={`/admin/accounts/${account.id}`}
                          className="inline-flex items-center gap-1.5 text-[13px] text-ink hover:text-rust"
                        >
                          <AccountGlyph type={account.type} size={22} />
                          <span className="truncate">{account.name}</span>
                        </Link>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-apricot-wash px-2 py-0.5 text-[11.5px] text-rust">
                          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                          没记账户
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums">
                      {out > 0 ? (
                        <span className="text-money-negative">{formatCNY(out)}</span>
                      ) : (
                        <span className="text-dove">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums">
                      {inflow > 0 ? (
                        <span className="text-money-positive">{formatCNY(inflow)}</span>
                      ) : (
                        <span className="text-dove">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-ash">{flow.operator_name || "—"}</td>
                    <td className="px-4 py-3.5 text-center">
                      {/* 两种来源都要正确显示凭证状态：有则缩略图可预览，缺则标签可点击补传 */}
                      <ReceiptCell
                        urls={flow.receipt_urls ?? []}
                        onSupplement={() => setSupplementTarget(flow)}
                      />
                    </td>
                    <td className="py-3.5 pr-6 pl-4 text-right">
                      {/* 核对调整必然属于某账户（且只加不改不删），无补挂/换挂 */}
                      {isAdjustment ? (
                        <span className="text-[11.5px] text-dove">不可改</span>
                      ) : (
                        <button
                          type="button"
                          className="text-[12.5px] text-graphite underline-offset-2 hover:text-ink hover:underline"
                          onClick={() => setFixTarget(flow)}
                        >
                          {flow.account_id ? "换账户" : "补上"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-dove/20 px-5 py-3.5 text-[13px] text-graphite">
          <span>
            共 {total} 笔 · 这是进出账，不是余额
          </span>
          <div className="flex items-center gap-2">
            <span className="text-dove">数据来自项目记账 + 余额核对</span>
            {totalPages > 1 ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-graphite hover:bg-fog disabled:opacity-40"
                  disabled={page <= 1}
                  onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                  aria-label="上一页"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="tabular-nums">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-graphite hover:bg-fog disabled:opacity-40"
                  disabled={page >= totalPages}
                  onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
                  aria-label="下一页"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <SupplementDialog
        open={supplementTarget !== null}
        submitting={supplementing}
        context={
          supplementTarget
            ? supplementTarget.source === "adjustment"
              ? `${supplementTarget.record_date} · 余额核对 · ${supplementTarget.reason ?? "—"} · ${
                  Number(supplementTarget.adjust_amount ?? 0) > 0 ? "+" : "−"
                }${formatCNY(Math.abs(Number(supplementTarget.adjust_amount ?? 0)))}`
              : `${supplementTarget.record_date} · ${supplementTarget.project_name ?? "—"} · ${
                  supplementTarget.subject_name ?? "—"
                }`
            : null
        }
        existingUrls={supplementTarget?.receipt_urls ?? []}
        onOpenChange={(next) => {
          if (!next) setSupplementTarget(null);
        }}
        onConfirm={handleSupplement}
      />

      <FixAccountDialog
        open={fixTarget !== null}
        record={fixTarget}
        accounts={accounts}
        onOpenChange={(next) => {
          if (!next) setFixTarget(null);
        }}
        onSaved={() => void load()}
      />
    </PageContainer>
  );
}
