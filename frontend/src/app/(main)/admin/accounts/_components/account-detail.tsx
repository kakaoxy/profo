"use client";

/**
 * 账户详情页（设计稿屏 2）.
 *
 * 三段信息，回答三个问题：
 * 1. 「现在有多少 + 钱怎么算出来的」——期初 + 进 − 出 ± 核对 的逐段展开；
 * 2. 「这个账户的流水」——来自项目账本的记账记录（同一个账户可被多个项目共用）；
 * 3. 「核对过几次、谁调的、为什么」——只增不改不删的调整记录。
 *
 * 「余额不能改，只能核对」是本页的核心约束，故编辑抽屉只改期初，改余额必须走对账。
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Clock,
  Info,
  List,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Receipt,
  Scale,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatCNY, safeFormatDate } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/app/(main)/admin/_components/page-container";
import { StatCardGrid } from "@/app/(main)/admin/_components/stat-card-grid";
import {
  appendAdjustmentReceipts,
  appendRecordReceipts,
  fetchAccount,
  fetchAccountAdjustments,
  fetchAccountFlows,
  fetchAccounts,
} from "../actions";
import type { components } from "@/lib/api-types";
import {
  ACCOUNT_TYPES,
  AccountGlyph,
  StatusPill,
  type FundAccount,
} from "../_components/account-card";
import { AccountDrawer } from "../_components/account-drawer";
import { ReconDialog } from "../_components/recon-dialog";
import { formatSeconds, useModuleLock } from "../_components/module-lock-context";
import { ReceiptCell, SupplementDialog } from "@/components/finance/receipt-cell";

type FundAdjustment = components["schemas"]["FundAdjustmentResponse"];
type FundFlowItem = components["schemas"]["FundFlowItem"];

type TabKey = "flows" | "adjustments" | "info";

export function AccountDetail({ accountId }: { accountId: string }) {
  const router = useRouter();
  const { token, secondsLeft, lock } = useModuleLock();

  const [account, setAccount] = React.useState<FundAccount | null>(null);
  const [allAccounts, setAllAccounts] = React.useState<FundAccount[]>([]);
  const [flows, setFlows] = React.useState<FundFlowItem[]>([]);
  const [adjustments, setAdjustments] = React.useState<FundAdjustment[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [tab, setTab] = React.useState<TabKey>("flows");
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [reconOpen, setReconOpen] = React.useState(false);
  const [supplementTarget, setSupplementTarget] = React.useState<FundFlowItem | null>(null);
  const [supplementing, setSupplementing] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const [accountRes, flowsRes, adjustRes, listRes] = await Promise.all([
      fetchAccount(accountId, { token }),
      fetchAccountFlows({ account_id: accountId, page_size: 200 }, { token }),
      fetchAccountAdjustments(accountId, { token }),
      fetchAccounts({}, { token }),
    ]);
    setLoading(false);

    if (!accountRes.success) {
      toast.error(accountRes.error);
      router.replace("/admin/accounts");
      return;
    }
    setAccount(accountRes.data);
    if (listRes.success) setAllAccounts(listRes.data.items);
    if (flowsRes.success) setFlows(flowsRes.data.items);
    if (adjustRes.success) setAdjustments(adjustRes.data);
  }, [accountId, token, router]);

  React.useEffect(() => {
    void load();
  }, [load]);

  /** 补传凭证：调整行走账户调整接口，记账行走项目账本 PATCH（均为追加语义） */
  const handleSupplement = async (urls: string[]) => {
    const target = supplementTarget;
    if (!target) return;
    setSupplementing(true);
    const res =
      target.source === "adjustment"
        ? await appendAdjustmentReceipts(accountId, target.record_id, urls, token)
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

  const tabs: Array<{ key: TabKey; label: string; count: number | null }> = [
    { key: "flows", label: "流水", count: flows.length },
    { key: "adjustments", label: "核对记录", count: adjustments.length },
    { key: "info", label: "资料", count: null },
  ];

  if (loading || !account) {
    return (
      <PageContainer>
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-graphite" aria-label="加载中" />
        </div>
      </PageContainer>
    );
  }

  const opening = Number(account.opening_balance);
  const inflow = Number(account.inflow_total ?? 0);
  const outflow = Number(account.outflow_total ?? 0);
  const adjust = Number(account.adjust_total ?? 0);
  const balance = Number(account.balance);
  const isOff = account.status === "off";

  return (
    <PageContainer className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/admin/accounts"
          className="inline-flex items-center gap-1.5 text-[13.5px] text-graphite hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          返回
        </Link>
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12px] text-graphite ring-1 ring-dove/30">
            <Clock className="h-3 w-3" aria-hidden="true" />
            还能看 <span className="tabular-nums">{formatSeconds(secondsLeft)}</span>
          </span>
          <Button
            variant="outline"
            className="rounded-full text-rust"
            onClick={() => void lock()}
          >
            <Lock className="h-3.5 w-3.5" />
            锁定
          </Button>
        </div>
      </div>

      {/* 页头 */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3.5">
          <AccountGlyph type={account.type} size={52} />
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-display text-[30px] leading-tight tracking-[-0.015em] text-ink sm:text-[38px]">
                {account.name}
              </h1>
              <StatusPill status={account.status} />
            </div>
            <p className="mt-1.5 text-[13.5px] text-graphite">
              <span className="font-mono">{account.account_no || "—"}</span> ·{" "}
              {account.holder || "—"} · {ACCOUNT_TYPES[account.type]?.label}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button variant="outline" className="rounded-full" onClick={() => setDrawerOpen(true)}>
            <Pencil className="h-3.5 w-3.5" />
            改信息
          </Button>
          <Button
            className="rounded-full bg-ink text-white hover:bg-ink/90"
            onClick={() => setReconOpen(true)}
          >
            <Scale className="h-3.5 w-3.5" />
            核对余额
          </Button>
        </div>
      </div>

      <StatCardGrid
        columns={4}
        items={[
          {
            label: "现在有",
            value: formatCNY(balance),
            dotColor: "bg-rust",
            warm: true,
            trend: { text: "系统算的" },
          },
          {
            label: "起始",
            value: formatCNY(opening),
            dotColor: "bg-dove",
            trend: { text: `从 ${account.opening_date} 算起` },
          },
          {
            label: "累计进 / 出",
            value: (
              <span className="text-[22px]">
                <span className="text-money-positive">{formatCNY(inflow)}</span>
                <span className="mx-1.5 text-dove">/</span>
                <span className="text-money-negative">{formatCNY(outflow)}</span>
              </span>
            ),
            dotColor: "bg-ink",
            trend: {
              text: `${account.flow_count ?? 0} 笔 · 最后 ${account.last_flow_date ?? "—"}`,
            },
          },
          {
            label: "核对差额",
            value: adjust !== 0 ? `${adjust > 0 ? "+" : "−"}${formatCNY(Math.abs(adjust))}` : formatCNY(0),
            dotColor: "bg-rust",
            valueClassName: adjust !== 0 ? "text-rust" : undefined,
            trend: { text: `${adjustments.length} 次` },
          },
        ]}
      />

      {/* 余额推导 */}
      <div className="flex flex-col gap-6 rounded-cards bg-white px-5.5 py-5 shadow-steep-sm lg:flex-row">
        <div className="flex-1">
          <div className="flex items-center gap-2 text-[15px] font-medium text-ink">
            <Scale className="h-4 w-4" aria-hidden="true" />
            钱怎么算出来的
            <span className="text-[12.5px] font-normal text-graphite">对着银行 App 一笔笔核</span>
          </div>
          <div className="mt-3 divide-y divide-dove/15 text-[13.5px]">
            <div className="flex items-center justify-between py-2 text-ash">
              <span>起始余额（{account.opening_date}）</span>
              <b className="font-[480] tabular-nums text-ink">{formatCNY(opening)}</b>
            </div>
            <div className="flex items-center justify-between py-2 text-ash">
              <span>+ 进账（{account.flow_count ?? 0} 笔）</span>
              <b className="font-[480] tabular-nums text-money-positive">{formatCNY(inflow)}</b>
            </div>
            <div className="flex items-center justify-between py-2 text-ash">
              <span>− 出账</span>
              <b className="font-[480] tabular-nums text-money-negative">{formatCNY(outflow)}</b>
            </div>
            <div className="flex items-center justify-between py-2 text-ash">
              <span>± 核对调过（{adjustments.length} 次）</span>
              <b
                className={cn(
                  "font-[480] tabular-nums",
                  adjust !== 0 ? "text-rust" : "text-ash",
                )}
              >
                {adjust !== 0 ? `${adjust > 0 ? "+" : "−"}${formatCNY(Math.abs(adjust))}` : formatCNY(0)}
              </b>
            </div>
            <div className="flex items-center justify-between py-2.5 text-[14px] font-medium text-ink">
              <span>现在有</span>
              <b className="font-[480] tabular-nums">{formatCNY(balance)}</b>
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col justify-center gap-3">
          <div className="flex items-start gap-2 rounded-2xl bg-fog px-4 py-3 text-[12.5px] leading-relaxed text-graphite">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            余额不能改，只能核对。
          </div>
          <div className="flex gap-2.5">
            <Button variant="outline" className="flex-1 rounded-full" onClick={() => setReconOpen(true)}>
              <Scale className="h-3.5 w-3.5" />
              核对余额
            </Button>
            <Button
              variant="outline"
              className="flex-1 rounded-full"
              onClick={() => router.push("/admin/accounts/flows")}
            >
              <List className="h-3.5 w-3.5" />
              所有流水
            </Button>
          </div>
          {isOff ? (
            <p className="text-[12px] text-rust">该账户已停用：历史流水保留，不能再记新账。</p>
          ) : null}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-6 border-b border-dove/25">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={cn(
              "relative pb-3 text-[14.5px] transition-colors",
              tab === item.key ? "text-ink" : "text-graphite hover:text-ink",
            )}
          >
            {item.label}
            {item.count !== null ? (
              <span className="ml-1.5 text-[11.5px] tabular-nums text-dove">{item.count}</span>
            ) : null}
            {tab === item.key ? (
              <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-ink" aria-hidden="true" />
            ) : null}
          </button>
        ))}
      </div>

      {tab === "flows" ? (
        flows.length === 0 ? (
          <EmptyBlock
            icon={<Receipt className="h-5 w-5" />}
            title="还没有流水"
            description="记一笔，选上这个账户就行。"
            action={
              <Link href="/admin/ledger">
                <Button variant="outline" className="rounded-full">
                  去记一笔
                </Button>
              </Link>
            }
          />
        ) : (
          <div className="overflow-hidden rounded-cards bg-white shadow-steep-sm">
            <table className="w-full border-collapse text-[13.5px]">
              <thead>
                <tr className="border-b border-dove/20 text-[12.5px] text-graphite">
                  <th className="py-3.5 pr-4 pl-6 text-left font-normal">日期</th>
                  <th className="px-4 py-3.5 text-left font-normal">项目 / 科目</th>
                  <th className="px-4 py-3.5 text-left font-normal">对方</th>
                  <th className="px-4 py-3.5 text-left font-normal">记账人</th>
                  <th className="px-4 py-3.5 text-right font-normal">出账</th>
                  <th className="px-4 py-3.5 text-right font-normal">进账</th>
                  <th className="py-3.5 pr-6 pl-4 text-center font-normal">凭证</th>
                </tr>
              </thead>
              <tbody>
                {flows.map((flow) => {
                  const out = Number(flow.outflow ?? 0);
                  const inAmount = Number(flow.inflow ?? 0);
                  return (
                    <tr key={flow.record_id} className="border-b border-dove/10 last:border-0 hover:bg-fog/70">
                      <td className="py-3.5 pr-4 pl-6 tabular-nums text-graphite">
                        {safeFormatDate(flow.record_date, "yyyy-MM-dd")}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="font-[480] text-ink">{flow.project_name || "—"}</div>
                        <div className="mt-0.5 text-[12px] text-graphite">
                          {flow.subject_name || "—"}
                          {flow.project_code ? ` · ${flow.project_code}` : ""}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-ash">
                        {out > 0 ? flow.payee || "—" : flow.payer || "—"}
                      </td>
                      <td className="px-4 py-3.5 text-ash">{flow.operator_name || "—"}</td>
                      <td className="px-4 py-3.5 text-right tabular-nums">
                        {out > 0 ? (
                          <span className="text-money-negative">{formatCNY(out)}</span>
                        ) : (
                          <span className="text-dove">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums">
                        {inAmount > 0 ? (
                          <span className="text-money-positive">{formatCNY(inAmount)}</span>
                        ) : (
                          <span className="text-dove">—</span>
                        )}
                      </td>
                      <td className="py-3.5 pr-6 pl-4 text-center">
                        {/* 与账户流水页统一：有凭证可预览，缺凭证可点击补传 */}
                        <ReceiptCell
                          urls={flow.receipt_urls ?? []}
                          onSupplement={() => setSupplementTarget(flow)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex items-center justify-between gap-3 border-t border-dove/20 px-5 py-3.5 text-[13px] text-graphite">
              <span>已停用账户的历史流水也会保留</span>
              <Link
                href="/admin/accounts/flows"
                className="inline-flex items-center gap-1 hover:text-ink"
              >
                看全部
              </Link>
            </div>
          </div>
        )
      ) : tab === "adjustments" ? (
        adjustments.length === 0 ? (
          <EmptyBlock
            icon={<Scale className="h-5 w-5" />}
            title="还没核对过"
            description="和卡里一致，就什么都不用做。"
            action={
              <Button variant="outline" className="rounded-full" onClick={() => setReconOpen(true)}>
                核对一下
              </Button>
            }
          />
        ) : (
          <div className="overflow-hidden rounded-cards bg-white shadow-steep-sm">
            <table className="w-full border-collapse text-[13.5px]">
              <thead>
                <tr className="border-b border-dove/20 text-[12.5px] text-graphite">
                  <th className="py-3.5 pr-4 pl-6 text-left font-normal">日期</th>
                  <th className="px-4 py-3.5 text-right font-normal">调了多少</th>
                  <th className="px-4 py-3.5 text-left font-normal">原因</th>
                  <th className="px-4 py-3.5 text-left font-normal">谁调的</th>
                  <th className="py-3.5 pr-6 pl-4 text-left font-normal">什么时候</th>
                </tr>
              </thead>
              <tbody>
                {adjustments.map((item) => {
                  const amount = Number(item.amount);
                  return (
                    <tr key={item.id} className="border-b border-dove/10 last:border-0 hover:bg-fog/70">
                      <td className="py-3.5 pr-4 pl-6 tabular-nums text-graphite">{item.adjust_date}</td>
                      <td
                        className={cn(
                          "px-4 py-3.5 text-right font-[480] tabular-nums",
                          amount > 0 ? "text-money-positive" : "text-rust",
                        )}
                      >
                        {amount > 0 ? "+" : "−"}
                        {formatCNY(Math.abs(amount))}
                      </td>
                      <td className="px-4 py-3.5 text-ash">{item.reason}</td>
                      <td className="px-4 py-3.5 text-ash">{item.operator_name || item.operator_id}</td>
                      <td className="py-3.5 pr-6 pl-4 tabular-nums text-graphite">
                        {safeFormatDate(item.created_at, "yyyy-MM-dd HH:mm")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex items-center justify-between gap-3 border-t border-dove/20 px-5 py-3.5 text-[13px] text-graphite">
              <span>只能加，不能改也不能删</span>
              <button
                type="button"
                className="inline-flex items-center gap-1 hover:text-ink"
                onClick={() => setReconOpen(true)}
              >
                <Plus className="h-3 w-3" />
                再核对
              </button>
            </div>
          </div>
        )
      ) : (
        <div className="grid gap-4.5 lg:grid-cols-2">
          <div className="rounded-cards bg-white px-5.5 py-5 shadow-steep-sm">
            <h3 className="text-[15px] font-medium text-ink">账户资料</h3>
            <dl className="mt-3 divide-y divide-dove/15 text-[13.5px]">
              {[
                ["名字", account.name],
                ["类型", ACCOUNT_TYPES[account.type]?.label ?? "—"],
                ["卡号", account.account_no || "—"],
                ["谁的", account.holder || "—"],
                ["起始余额", `${formatCNY(opening)}（${account.opening_date}）`],
                ["状态", isOff ? "已停用" : "在用"],
                ["备注", account.note || "—"],
              ].map(([key, value]) => (
                <div key={key} className="flex items-start justify-between gap-4 py-2">
                  <span className="shrink-0 text-graphite">{key}</span>
                  <span className="text-right text-ash">{value}</span>
                </div>
              ))}
            </dl>
          </div>

          <div className="rounded-cards bg-white px-5.5 py-5 shadow-steep-sm">
            <h3 className="text-[15px] font-medium text-ink">最近改动</h3>
            <p className="mt-3 text-[12.5px] leading-relaxed text-graphite">
              账户与对账的每次改动都写入操作日志（
              <span className="font-mono">operation_logs</span>
              ），可在「审计日志」按资源类型{" "}
              <span className="font-mono">fund_account</span> 查询。
            </p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-graphite">
              创建于 {safeFormatDate(account.created_at, "yyyy-MM-dd HH:mm")}，最后修改{" "}
              {safeFormatDate(account.updated_at, "yyyy-MM-dd HH:mm")}。
            </p>
            <div className="mt-3 flex gap-2">
              <Button variant="outline" className="rounded-full" onClick={() => setDrawerOpen(true)}>
                改信息
              </Button>
              <Link href="/admin/audit-logs">
                <Button variant="outline" className="rounded-full">
                  看审计日志
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      <AccountDrawer
        open={drawerOpen}
        account={account}
        token={token}
        onOpenChange={setDrawerOpen}
        onSaved={() => void load()}
      />

      <SupplementDialog
        open={supplementTarget !== null}
        submitting={supplementing}
        context={
          supplementTarget
            ? `${supplementTarget.record_date} · ${
                supplementTarget.source === "adjustment"
                  ? `余额核对 · ${supplementTarget.reason ?? "—"}`
                  : `${supplementTarget.project_name ?? "—"} · ${supplementTarget.subject_name ?? "—"}`
              }`
            : null
        }
        existingUrls={supplementTarget?.receipt_urls ?? []}
        onOpenChange={(next) => {
          if (!next) setSupplementTarget(null);
        }}
        onConfirm={handleSupplement}
      />

      <ReconDialog
        open={reconOpen}
        accounts={allAccounts.length > 0 ? allAccounts : [account]}
        defaultAccountId={account.id}
        token={token}
        onOpenChange={setReconOpen}
        onSaved={() => void load()}
      />
    </PageContainer>
  );
}

function EmptyBlock({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-cards bg-white px-6 py-16 text-center shadow-steep-sm">
      <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-fog text-graphite">
        {icon}
      </span>
      <h4 className="text-[15px] font-medium text-ink">{title}</h4>
      <p className="text-[13px] text-graphite">{description}</p>
      <div className="mt-1">{action}</div>
    </div>
  );
}
