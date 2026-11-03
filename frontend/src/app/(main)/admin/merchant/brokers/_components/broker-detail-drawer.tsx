"use client";

import { useEffect, useState } from "react";
import { PencilLine } from "lucide-react";

import { StatusBadge } from "@/app/(main)/admin/_components/status-badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { components } from "@/lib/api-types";
import { merchantApi } from "../../_components/merchant-api";
import { BrokerAvatar } from "./broker-avatar";
import {
  BINDING_RECORD_LABELS,
  BROKER_STATUS_LABELS,
  brokerSourceLabel,
  brokerStatusTone,
} from "./broker-labels";

type Broker = components["schemas"]["BrokerResponse"];
type BindingList = components["schemas"]["BrokerBindingListResponse"];

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * 经纪人详情抽屉（REQ-IT7-03 设计稿）.
 *
 * 查看态展示档案、当前绑定与绑定历史；资料修改走「编辑资料」弹层，
 * 换绑 / 解绑 / 停用走独立动作并写绑定历史与审计。
 */
export function BrokerDetailDrawer({
  brokerId,
  open,
  onOpenChange,
  reloadKey,
  onEdit,
  onRebind,
  onUnbind,
  onToggleStatus,
}: {
  brokerId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reloadKey: number;
  onEdit: (broker: Broker) => void;
  onRebind: (broker: Broker) => void;
  onUnbind: (broker: Broker) => void;
  onToggleStatus: (broker: Broker) => void;
}) {
  const [broker, setBroker] = useState<Broker | null>(null);
  const [bindings, setBindings] = useState<BindingList | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !brokerId) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    setBroker(null);
    setBindings(null);
    Promise.all([
      merchantApi<Broker>(`/admin/merchant/brokers/${brokerId}`),
      merchantApi<BindingList>(`/admin/merchant/brokers/${brokerId}/bindings?page=1&page_size=20`),
    ])
      .then(([detail, history]) => {
        if (cancelled) return;
        setBroker(detail);
        setBindings(history);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "加载经纪人详情失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, brokerId, reloadKey]);

  const disabled = broker?.bind_status === "disabled";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-[480px]">
        <SheetTitle className="sr-only">经纪人详情</SheetTitle>
        <SheetDescription className="sr-only">查看经纪人资料、门店绑定与绑定历史</SheetDescription>

        {loading && !broker ? (
          <p className="px-6 py-10 text-sm text-graphite">加载中…</p>
        ) : error ? (
          <p className="px-6 py-10 text-sm text-error">{error}</p>
        ) : broker ? (
          <div className="flex min-h-full flex-1 flex-col px-6 pt-6">
            <header className="flex items-start justify-between gap-3 border-b border-fog pb-5 pr-8">
              <div className="flex items-center gap-3">
                <BrokerAvatar name={broker.name} id={broker.id} size="lg" />
                <div className="min-w-0">
                  <h2 className="text-xl font-medium tracking-tight text-ink">{broker.name}</h2>
                  <p className="mt-1 text-xs text-graphite">
                    {broker.phone_masked} · {brokerSourceLabel(broker.source, broker.bind_source)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <StatusBadge tone={brokerStatusTone(broker.bind_status)}>
                      {BROKER_STATUS_LABELS[broker.bind_status] || broker.bind_status}
                    </StatusBadge>
                    {broker.recruit_lead_id ? (
                      <StatusBadge tone="neutral">招募线索</StatusBadge>
                    ) : null}
                  </div>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => onEdit(broker)}>
                <PencilLine className="mr-1 h-3.5 w-3.5" />
                编辑资料
              </Button>
            </header>

            <section className="border-b border-fog py-5">
              <h3 className="text-xs font-medium tracking-wide text-graphite">绑定信息</h3>
              <div className="mt-3 flex items-center gap-3 rounded-inputs bg-fog px-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {broker.store_name || (broker.store_id ? "门店已删除" : "未绑定门店")}
                  </p>
                  <p className="mt-0.5 text-xs text-graphite">
                    {broker.store_id
                      ? broker.store_name
                        ? `绑定于 ${formatDateTime(broker.bound_at)}`
                        : "原绑定门店已删除，可换绑到其他门店"
                      : "可在下方「换绑」选择门店，或由经纪人扫码绑定"}
                  </p>
                  <p className="mt-0.5 text-xs text-graphite">
                    邀请人：{broker.inviter_employee_name || "—"}
                  </p>
                </div>
                {broker.store_id && !disabled ? (
                  <button
                    type="button"
                    className="shrink-0 text-xs font-medium text-rust underline-offset-4 hover:underline"
                    onClick={() => onRebind(broker)}
                  >
                    换绑
                  </button>
                ) : null}
              </div>
            </section>

            <section className="border-b border-fog py-5">
              <h3 className="text-xs font-medium tracking-wide text-graphite">基本信息</h3>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="text-xs text-graphite">手机号</dt>
                  <dd className="mt-0.5 tabular-nums text-ink">{broker.phone_masked}</dd>
                </div>
                <div>
                  <dt className="text-xs text-graphite">来源</dt>
                  <dd className="mt-0.5 text-ink">
                    {brokerSourceLabel(broker.source, broker.bind_source)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-graphite">创建时间</dt>
                  <dd className="mt-0.5 text-ink">{formatDateTime(broker.created_at)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-graphite">最近更新</dt>
                  <dd className="mt-0.5 text-ink">{formatDateTime(broker.updated_at)}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs text-graphite">备注</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-ink">{broker.remark || "—"}</dd>
                </div>
              </dl>
            </section>

            <section className="flex-1 py-5">
              <h3 className="text-xs font-medium tracking-wide text-graphite">绑定历史</h3>
              {bindings && bindings.items.length ? (
                <ol className="mt-4 space-y-5">
                  {bindings.items.map((record) => (
                    <li key={record.id} className="relative pl-6">
                      <span className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full bg-rust" />
                      <span className="absolute left-[4px] top-4 h-[calc(100%-4px)] w-px bg-fog" />
                      <p className="text-sm text-ink">
                        {record.status === "active" ? "绑定至 " : ""}
                        {record.store_name}
                        <span className="ml-2 text-xs text-graphite">
                          {BINDING_RECORD_LABELS[record.status] || record.status}
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-graphite">
                        {formatDateTime(record.applied_at)}
                        {record.approved_at ? ` · 审批 ${formatDateTime(record.approved_at)}` : ""}
                        {record.reason ? ` · ${record.reason}` : ""}
                      </p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-3 text-sm text-graphite">暂无绑定记录</p>
              )}
            </section>

            <footer className="sticky bottom-0 -mx-6 mt-auto flex items-center gap-3 border-t border-fog bg-white px-6 py-4">
              <button
                type="button"
                className="text-xs text-rust underline-offset-4 hover:underline disabled:text-dove"
                disabled={!broker.store_id}
                onClick={() => onUnbind(broker)}
              >
                解绑
              </button>
              <span className="flex-1" />
              <button
                type="button"
                className="text-xs text-rust underline-offset-4 hover:underline"
                onClick={() => onToggleStatus(broker)}
              >
                {disabled ? "启用" : "停用"}
              </button>
            </footer>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
