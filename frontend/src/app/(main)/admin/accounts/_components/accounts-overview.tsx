"use client";

/**
 * 资金账户总览页（设计稿屏 1）.
 *
 * 结构：KPI 四卡（余额合计 / 本月净进账 / 核对调过 / 没记账户）→ 工具栏
 * （搜索 + 类型/状态/排序 + 卡片/表格切换）→ 账户列表。
 *
 * 数据来源：客户端 actions（需要携带解锁令牌，服务端校验）；页面在
 * `AccountLockGuard` 内渲染，未解锁时不发任何业务请求。
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Info,
  Landmark,
  Lock,
  Loader2,
  Plus,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatCNY } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { components } from "@/lib/api-types";
import { PageContainer } from "@/app/(main)/admin/_components/page-container";
import { PageHeader } from "@/app/(main)/admin/_components/page-header";
import { StatCardGrid } from "@/app/(main)/admin/_components/stat-card-grid";
import { fetchAccounts, fetchAccountsSummary, updateAccount } from "../actions";
import {
  ACCOUNT_TYPE_OPTIONS,
  AccountCard,
  AccountTable,
  NewAccountCard,
  type FundAccount,
} from "./account-card";
import { AccountDrawer } from "./account-drawer";
import { PasswordDialog } from "./password-dialog";
import { ReconDialog } from "./recon-dialog";
import { formatSeconds, useModuleLock } from "./module-lock-context";

type FundAccountSummary = components["schemas"]["FundAccountSummaryResponse"];

export function AccountsOverview() {
  const router = useRouter();
  const { token, secondsLeft, lock } = useModuleLock();

  const [accounts, setAccounts] = React.useState<FundAccount[]>([]);
  const [summary, setSummary] = React.useState<FundAccountSummary | null>(null);
  const [loading, setLoading] = React.useState(true);

  const [search, setSearch] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [sort, setSort] = React.useState("balance");
  const [view, setView] = React.useState<"grid" | "table">("grid");
  const [noteOpen, setNoteOpen] = React.useState(true);

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<FundAccount | null>(null);
  const [reconOpen, setReconOpen] = React.useState(false);
  const [reconTarget, setReconTarget] = React.useState<string | null>(null);
  const [pwdOpen, setPwdOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const [listRes, summaryRes] = await Promise.all([
      fetchAccounts(
        {
          search: search.trim() || undefined,
          type: typeFilter === "all" ? undefined : (typeFilter as FundAccount["type"]),
          status: statusFilter === "all" ? undefined : (statusFilter as FundAccount["status"]),
          sort,
        },
        { token },
      ),
      fetchAccountsSummary({ token }),
    ]);
    setLoading(false);
    if (!listRes.success) {
      toast.error(listRes.error);
      return;
    }
    setAccounts(listRes.data.items);
    if (summaryRes.success) setSummary(summaryRes.data);
  }, [token, search, typeFilter, statusFilter, sort]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const handleToggleStatus = async (account: FundAccount) => {
    const next = account.status === "active" ? "off" : "active";
    const res = await updateAccount(account.id, { status: next }, token);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    toast.success(`${next === "off" ? "已停用" : "已启用"}：${account.name}`);
    void load();
  };

  const openEdit = (accountId: string) => {
    const target = accounts.find((item) => item.id === accountId) ?? null;
    setEditTarget(target);
    setDrawerOpen(true);
  };

  const openRecon = (accountId: string) => {
    setReconTarget(accountId);
    setReconOpen(true);
  };

  const netMonth =
    summary ? Number(summary.month_inflow) - Number(summary.month_outflow) : 0;

  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader
        title="资金账户"
        description="钱分别在哪个账户。余额由流水推导，不能直接改，只能核对。"
        actions={
          <>
            <button
              type="button"
              onClick={() => setPwdOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12px] text-graphite ring-1 ring-dove/30 transition-colors hover:text-ink"
              title="改密码"
            >
              <Clock className="h-3 w-3" aria-hidden="true" />
              还能看 <span className="tabular-nums">{formatSeconds(secondsLeft)}</span>
            </button>
            <Button
              variant="outline"
              className="rounded-full text-rust"
              onClick={() => void lock()}
            >
              <Lock className="h-3.5 w-3.5" />
              锁定
            </Button>
            <Button
              className="rounded-full bg-ink text-white hover:bg-ink/90"
              onClick={() => {
                setEditTarget(null);
                setDrawerOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              新建账户
            </Button>
          </>
        }
      />

      {/* 说明条：一笔账，两边都记 */}
      {noteOpen ? (
        <div className="flex items-start gap-2.5 rounded-cards bg-apricot-wash px-5 py-4 text-[13px] leading-relaxed text-rust">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div className="flex-1">
            <b>一笔账，两边都记。</b>项目看盈亏，账户看钱在哪。
            {(summary?.untracked_count ?? 0) > 0 ? (
              <span className="ml-2.5 inline-flex flex-wrap items-center gap-1.5">
                <span className="rounded-full bg-white px-2.5 py-0.5 text-[12px]">
                  {summary?.untracked_count} 笔没记账户 · {formatCNY(summary?.untracked_amount ?? 0)}
                </span>
                <Link
                  href="/admin/accounts/flows?untracked=1"
                  className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
                >
                  去补上
                  <ChevronRight className="h-3 w-3" />
                </Link>
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setNoteOpen(false)}
            className="rounded-full p-1 text-rust/70 transition-colors hover:bg-white/50 hover:text-rust"
            aria-label="关闭提示"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      <StatCardGrid
        columns={4}
        items={[
          {
            label: "余额合计",
            value: formatCNY(summary?.total_balance ?? 0),
            dotColor: "bg-rust",
            warm: true,
            trend: {
              text: (
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                  {summary?.active_count ?? 0} 个在用
                </span>
              ),
            },
          },
          {
            label: "本月净进账",
            value: `${netMonth >= 0 ? "+" : "−"}${formatCNY(Math.abs(netMonth))}`,
            dotColor: "bg-ink",
            valueClassName: netMonth >= 0 ? "text-money-positive" : "text-money-negative",
            trend: {
              text: `进 ${formatCNY(summary?.month_inflow ?? 0)} · 出 ${formatCNY(summary?.month_outflow ?? 0)}`,
            },
          },
          {
            label: "核对调过",
            value: formatCNY(Math.abs(Number(summary?.adjust_total ?? 0))),
            dotColor: "bg-dove",
            trend: {
              text: (
                <span className="inline-flex items-center gap-1">
                  上次 {summary?.last_adjust_date ?? "—"}
                  {accounts.length > 0 ? (
                    <button
                      type="button"
                      className="underline-offset-2 hover:underline"
                      onClick={() => openRecon(accounts[0].id)}
                    >
                      去核对
                    </button>
                  ) : (
                    <span className="text-dove">去核对</span>
                  )}
                </span>
              ),
            },
          },
          {
            label: "没记账户",
            value: `${summary?.untracked_count ?? 0} 笔`,
            dotColor: "bg-rust",
            trend: {
              text: `合计 ${formatCNY(summary?.untracked_amount ?? 0)} · 建议补上`,
            },
          },
        ]}
      />

      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-9.5 w-full items-center gap-2 rounded-full bg-white px-3.5 ring-1 ring-dove/30 focus-within:ring-[1.5px] focus-within:ring-ink sm:w-65">
          <Search className="h-3.5 w-3.5 shrink-0 text-graphite" aria-hidden="true" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索账户名 / 卡号 / 开户人"
            className="h-8 border-0 bg-transparent px-0 text-[13.5px] shadow-none focus-visible:ring-0"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="text-graphite hover:text-ink"
              aria-label="清除搜索"
            >
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </div>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-9.5 w-auto min-w-30 gap-1.5 rounded-full bg-white text-[13.5px] ring-1 ring-dove/30">
            <SelectValue placeholder="全部类型" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部类型</SelectItem>
            {ACCOUNT_TYPE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9.5 w-auto min-w-30 gap-1.5 rounded-full bg-white text-[13.5px] ring-1 ring-dove/30">
            <SelectValue placeholder="全部状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="active">启用中</SelectItem>
            <SelectItem value="off">已停用</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="h-9.5 w-auto min-w-28 gap-1.5 rounded-full bg-white text-[13.5px] ring-1 ring-dove/30">
            <SelectValue placeholder="排序" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="balance">钱多的先</SelectItem>
            <SelectItem value="last">最近用过</SelectItem>
            <SelectItem value="name">按名字</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          <div className="inline-flex gap-0.5 rounded-full bg-ink/5 p-0.75">
            {(
              [
                { value: "grid", label: "卡片" },
                { value: "table", label: "表格" },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setView(option.value)}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-[13px] transition-colors",
                  view === option.value
                    ? "bg-white text-ink shadow-steep-sm"
                    : "text-graphite hover:text-ink",
                )}
                aria-pressed={view === option.value}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 列表 */}
      {loading ? (
        <div className="flex min-h-40 items-center justify-center rounded-cards bg-white shadow-steep-sm">
          <Loader2 className="h-5 w-5 animate-spin text-graphite" aria-label="加载中" />
        </div>
      ) : accounts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-cards bg-white px-6 py-16 text-center shadow-steep-sm">
          <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-fog text-graphite">
            <Landmark className="h-5 w-5" aria-hidden="true" />
          </span>
          <h4 className="text-[15px] font-medium text-ink">没找到账户</h4>
          <p className="text-[13px] text-graphite">换个词试试，或者新建一个。</p>
          <Button
            variant="outline"
            className="mt-1 rounded-full"
            onClick={() => {
              setSearch("");
              setTypeFilter("all");
              setStatusFilter("all");
            }}
          >
            看全部
          </Button>
        </div>
      ) : view === "grid" ? (
        <div className="grid gap-4.5 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              actions={{
                onOpen: (id) => router.push(`/admin/accounts/${id}`),
                onEdit: openEdit,
                onReconcile: openRecon,
                onToggleStatus: (item) => void handleToggleStatus(item),
              }}
            />
          ))}
          <NewAccountCard
            onClick={() => {
              setEditTarget(null);
              setDrawerOpen(true);
            }}
          />
        </div>
      ) : (
        <AccountTable
          accounts={accounts}
          actions={{
            onOpen: (id) => router.push(`/admin/accounts/${id}`),
            onEdit: openEdit,
            onReconcile: openRecon,
          }}
        />
      )}

      {summary && summary.untracked_count > 0 ? (
        <div className="flex items-start gap-2 rounded-2xl bg-apricot-wash px-4 py-3 text-[12.5px] leading-relaxed text-rust">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            有 <b>{summary.untracked_count} 笔</b>没记账户，不算进任何余额。
            <Link
              href="/admin/accounts/flows?untracked=1"
              className="ml-1.5 underline-offset-2 hover:underline"
            >
              看看是哪几笔 →
            </Link>
          </span>
        </div>
      ) : null}

      <AccountDrawer
        open={drawerOpen}
        account={editTarget}
        token={token}
        onOpenChange={(next) => {
          setDrawerOpen(next);
          if (!next) setEditTarget(null);
        }}
        onSaved={() => void load()}
      />

      <ReconDialog
        open={reconOpen}
        accounts={accounts}
        defaultAccountId={reconTarget}
        token={token}
        onOpenChange={setReconOpen}
        onSaved={() => void load()}
      />

      <PasswordDialog
        open={pwdOpen}
        mode="change"
        onOpenChange={setPwdOpen}
        onSuccess={() => void load()}
      />
    </PageContainer>
  );
}
