"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, Download, Search } from "lucide-react";

import { PageContainer } from "@/app/(main)/admin/_components/page-container";
import { PageHeader } from "@/app/(main)/admin/_components/page-header";
import { StatusBadge } from "@/app/(main)/admin/_components/status-badge";
import { Pagination } from "@/components/common/pagination";
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
import { merchantApi, queryString } from "../_components/merchant-api";
import { BrokerActionDialog } from "./_components/broker-action-dialog";
import { BrokerAvatar } from "./_components/broker-avatar";
import { BrokerDetailDrawer } from "./_components/broker-detail-drawer";
import { BrokerFormDialog } from "./_components/broker-form-dialog";
import { BrokerPendingPanel } from "./_components/broker-pending-panel";
import { BrokerRebindDialog } from "./_components/broker-rebind-dialog";
import { BrokerSummaryCards } from "./_components/broker-summary-cards";
import {
  brokerSourceLabel,
  BROKER_SOURCE_OPTIONS,
  BROKER_STATUS_LABELS,
  brokerStatusTone,
} from "./_components/broker-labels";

type BrokerList = components["schemas"]["BrokerListResponse"];
type Broker = components["schemas"]["BrokerResponse"];
type BrokerSummary = components["schemas"]["BrokerSummaryResponse"];
type StoreList = components["schemas"]["MerchantStoreListResponse"];
type PendingBinding = components["schemas"]["BrokerBindingResponse"];

type TabKey = "all" | "bound" | "unbound" | "pending";
type ActionKind = "unbind" | "disable" | "enable";

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "bound", label: "已绑定" },
  { key: "unbound", label: "未绑定" },
  { key: "pending", label: "待审核" },
];

const PAGE_SIZE = 10;

function tabCount(summary: BrokerSummary | null, key: TabKey): number {
  if (!summary) return 0;
  if (key === "all") return summary.total;
  return summary[key];
}

function formatDate(value: string): string {
  const date = new Date(value);
  const now = new Date();
  const includeYear = date.getFullYear() !== now.getFullYear();
  return date.toLocaleString("zh-CN", {
    ...(includeYear ? { year: "numeric" as const } : {}),
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * 经纪人管理（REQ-IT7-03 设计稿落地）.
 *
 * 结构：KPI 四卡 → 待审核绑定 → 列表卡（分段 tabs / 搜索 / 门店 / 来源 / 表格 / 分页）→ 详情抽屉。
 * 交互：整行点击开抽屉；新建 / 编辑用弹层；换绑、解绑、启停用独立动作并留审计。
 */
export default function MerchantBrokersPage() {
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [tab, setTab] = useState<TabKey>("all");
  const [storeFilter, setStoreFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<BrokerList | null>(null);
  const [summary, setSummary] = useState<BrokerSummary | null>(null);
  const [pending, setPending] = useState<PendingBinding[]>([]);
  const [stores, setStores] = useState<StoreList["items"]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [drawerBrokerId, setDrawerBrokerId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerReloadKey, setDrawerReloadKey] = useState(0);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [rebindTarget, setRebindTarget] = useState<Broker | null>(null);
  const [actionTarget, setActionTarget] = useState<{ broker: Broker; kind: ActionKind } | null>(null);
  const [actionPending, setActionPending] = useState(false);

  const requestId = useRef(0);

  const load = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const [list, nextSummary, pendingBindings, storeList] = await Promise.all([
        merchantApi<BrokerList>(
          `/admin/merchant/brokers${queryString({
            page,
            page_size: PAGE_SIZE,
            keyword: keyword || undefined,
            store_id: storeFilter === "all" ? undefined : storeFilter,
            source: sourceFilter === "all" ? undefined : sourceFilter,
            bind_status: tab === "all" || tab === "pending" ? undefined : tab,
            pending_only: tab === "pending" ? "true" : undefined,
          })}`,
        ),
        merchantApi<BrokerSummary>("/admin/merchant/brokers/summary"),
        merchantApi<PendingBinding[]>("/admin/merchant/bindings/pending"),
        merchantApi<StoreList>("/admin/merchant/stores?page=1&page_size=200"),
      ]);
      if (current !== requestId.current) return;
      setData(list);
      setSummary(nextSummary);
      setPending(pendingBindings);
      setStores(storeList.items);
    } catch (err) {
      if (current === requestId.current) {
        setError(err instanceof Error ? err.message : "加载经纪人列表失败");
      }
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, [page, keyword, storeFilter, sourceFilter, tab]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = async () => {
    await load();
    setDrawerReloadKey((key) => key + 1);
  };

  const openDetail = (brokerId: string) => {
    setDrawerBrokerId(brokerId);
    setDrawerOpen(true);
  };

  const openCreate = () => {
    setEditingId(null);
    setFormOpen(true);
  };

  const openEdit = (broker: Broker) => {
    setEditingId(broker.id);
    setFormOpen(true);
  };

  const approveBinding = async (id: string, approve: boolean) => {
    try {
      await merchantApi(`/admin/merchant/bindings/${id}/approve`, {
        method: "POST",
        body: JSON.stringify({ approve, remark: approve ? null : "后台驳回" }),
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "审核失败");
    }
  };

  const submitAction = async (reason: string) => {
    if (!actionTarget) return;
    const { broker, kind } = actionTarget;
    setActionPending(true);
    try {
      if (kind === "unbind") {
        await merchantApi(`/admin/merchant/brokers/${broker.id}/unbind?reason=${encodeURIComponent(reason)}`, {
          method: "POST",
        });
      } else {
        await merchantApi(`/admin/merchant/brokers/${broker.id}/status`, {
          method: "POST",
          body: JSON.stringify({ target_status: kind === "disable" ? "disabled" : "unbound", reason }),
        });
      }
      setActionTarget(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setActionPending(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));
  const activeTabLabel = TABS.find((item) => item.key === tab)?.label ?? "全部";

  return (
    <div className="min-h-screen bg-fog">
      <PageContainer className="flex flex-col gap-5">
        <PageHeader
          title="经纪人管理"
          description="经纪人档案、门店绑定与换绑/解绑审批。手机号仅展示脱敏值。"
          actions={
            <div className="flex items-center gap-4">
              <a
                href={`/api/v1/admin/merchant/brokers/export${queryString({
                  keyword: keyword || undefined,
                  store_id: storeFilter === "all" ? undefined : storeFilter,
                  bind_status: tab === "all" || tab === "pending" ? undefined : tab,
                  source: sourceFilter === "all" ? undefined : sourceFilter,
                  pending_only: tab === "pending" ? "true" : undefined,
                })}`}
                className="inline-flex items-center gap-1.5 text-sm text-ink underline-offset-4 hover:underline"
              >
                <Download className="h-4 w-4" strokeWidth={1.7} />
                导出 CSV
              </a>
              <Button onClick={openCreate}>＋ 新建经纪人</Button>
            </div>
          }
        />

        <BrokerSummaryCards summary={summary} />

        {error ? (
          <div className="rounded-cards border border-rust/20 bg-white px-5 py-3 text-sm text-error">{error}</div>
        ) : null}

        <BrokerPendingPanel
          pending={pending}
          onApprove={(id, approve) => void approveBinding(id, approve)}
          onViewAll={() => {
            setTab("pending");
            setPage(1);
          }}
        />

        <section className="rounded-cards bg-white shadow-steep-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
            <div className="flex items-center gap-1">
              {TABS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={tab === item.key}
                  onClick={() => {
                    setTab(item.key);
                    setPage(1);
                  }}
                  className={`rounded-full px-3.5 py-1.5 text-[13px] transition-colors ${
                    tab === item.key ? "bg-ink text-white" : "text-graphite hover:bg-fog hover:text-ink"
                  }`}
                >
                  {item.label}
                  <span className={`ml-1.5 text-[11px] ${tab === item.key ? "text-white/70" : "text-dove"}`}>
                    {tabCount(summary, item.key)}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dove"
                  strokeWidth={1.7}
                />
                <Input
                  className="h-9 w-60 pl-9"
                  placeholder="搜索姓名 / 手机号"
                  aria-label="搜索经纪人"
                  value={keywordInput}
                  onChange={(event) => setKeywordInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      setKeyword(keywordInput.trim());
                      setPage(1);
                    }
                  }}
                />
              </div>
              <Select
                value={storeFilter}
                onValueChange={(value) => {
                  setStoreFilter(value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-9 w-[148px]" aria-label="按所属门店筛选">
                  <SelectValue placeholder="全部门店" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部门店</SelectItem>
                  {stores.map((store) => (
                    <SelectItem key={store.id} value={store.id}>
                      {store.store_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={sourceFilter}
                onValueChange={(value) => {
                  setSourceFilter(value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-9 w-[132px]" aria-label="按来源筛选">
                  <SelectValue placeholder="全部来源" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部来源</SelectItem>
                  {BROKER_SOURCE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[1040px] text-sm">
              <thead className="bg-fog text-left text-[11px] uppercase tracking-wide text-graphite">
                <tr>
                  <th className="px-5 py-2.5 font-medium">经纪人</th>
                  <th className="px-4 py-2.5 font-medium">绑定门店</th>
                  <th className="px-4 py-2.5 font-medium">邀请人</th>
                  <th className="px-4 py-2.5 font-medium">状态</th>
                  <th className="px-4 py-2.5 font-medium">来源</th>
                  <th className="px-4 py-2.5 font-medium">最近变更</th>
                  <th className="w-10 px-2 py-2.5" aria-label="打开详情" />
                </tr>
              </thead>
              <tbody>
                {loading && !data ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-16 text-center text-sm text-graphite">
                      加载中…
                    </td>
                  </tr>
                ) : data && data.items.length ? (
                  data.items.map((item) => (
                    <tr
                      key={item.id}
                      tabIndex={0}
                      role="button"
                      aria-label={`查看经纪人 ${item.name}`}
                      onClick={() => openDetail(item.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openDetail(item.id);
                        }
                      }}
                      className="cursor-pointer border-t border-fog transition-colors hover:bg-fog/60 focus-visible:bg-fog/60 focus-visible:outline-none"
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <BrokerAvatar name={item.name} id={item.id} />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-ink">{item.name}</p>
                            <p className="mt-0.5 text-xs tabular-nums text-graphite">{item.phone_masked}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[13px] text-ink">{item.store_name || "未分配"}</td>
                      <td className="px-4 py-3 text-[13px] text-ink">
                        {item.inviter_employee_name || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={brokerStatusTone(item.bind_status)}>
                          {BROKER_STATUS_LABELS[item.bind_status] || item.bind_status}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3 text-xs text-graphite">
                        {brokerSourceLabel(item.source, item.bind_source)}
                      </td>
                      <td className="px-4 py-3 text-xs tabular-nums text-graphite">{formatDate(item.updated_at)}</td>
                      <td className="px-2 py-3 text-right">
                        <ChevronRight className="ml-auto h-4 w-4 text-dove" strokeWidth={1.7} />
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-5 py-16 text-center text-sm text-graphite">
                      没有符合条件的经纪人
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-fog px-5 py-3">
            <p className="text-xs text-graphite">
              共 {data?.total ?? 0} 位经纪人 · 当前 {activeTabLabel}
            </p>
            <Pagination
              mode="controlled"
              currentPage={page}
              totalPages={totalPages}
              pageSize={PAGE_SIZE}
              totalItems={data?.total ?? 0}
              onPageChange={setPage}
            />
          </div>
        </section>
      </PageContainer>

      <BrokerDetailDrawer
        brokerId={drawerBrokerId}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        reloadKey={drawerReloadKey}
        onEdit={openEdit}
        onRebind={(broker) => setRebindTarget(broker)}
        onUnbind={(broker) => setActionTarget({ broker, kind: "unbind" })}
        onToggleStatus={(broker) =>
          setActionTarget({ broker, kind: broker.bind_status === "disabled" ? "enable" : "disable" })
        }
      />

      <BrokerFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        brokerId={editingId}
        onSaved={() => void refresh()}
      />

      <BrokerRebindDialog
        open={Boolean(rebindTarget)}
        onOpenChange={(open) => {
          if (!open) setRebindTarget(null);
        }}
        brokerId={rebindTarget?.id ?? null}
        brokerName={rebindTarget?.name ?? ""}
        onDone={() => void refresh()}
      />

      <BrokerActionDialog
        open={Boolean(actionTarget)}
        onOpenChange={(open) => {
          if (!open) setActionTarget(null);
        }}
        title={
          actionTarget?.kind === "unbind"
            ? `解绑经纪人：${actionTarget.broker.name}`
            : actionTarget?.kind === "enable"
              ? `启用经纪人：${actionTarget?.broker.name}`
              : `停用经纪人：${actionTarget?.broker.name}`
        }
        description={
          actionTarget?.kind === "unbind"
            ? "解绑后经纪人不再归属当前门店，绑定历史会保留。"
            : actionTarget?.kind === "enable"
              ? "启用后经纪人可重新登录并接受门店绑定。"
              : "停用后经纪人不可登录、不可被新绑定，当前门店绑定会解除。"
        }
        confirmLabel={
          actionTarget?.kind === "unbind" ? "确认解绑" : actionTarget?.kind === "enable" ? "确认启用" : "确认停用"
        }
        pending={actionPending}
        onConfirm={(reason) => void submitAction(reason)}
      />
    </div>
  );
}
