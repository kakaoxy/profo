"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { PageContainer } from "@/app/(main)/admin/_components/page-container";
import { PageHeader } from "@/app/(main)/admin/_components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { components } from "@/lib/api-types";
import { merchantApi } from "../../_components/merchant-api";

type Detail = components["schemas"]["MerchantStoreDetailResponse"];

const STATUS_OPTIONS = [
  { code: "not_cooperated", label: "未合作" },
  { code: "negotiating", label: "洽谈中" },
  { code: "cooperated", label: "已合作" },
  { code: "paused", label: "暂停" },
  { code: "terminated", label: "终止" },
];

export default function MerchantStoreDetailPage() {
  const params = useParams<{ id: string }>();
  const storeId = params?.id ?? "";
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusTarget, setStatusTarget] = useState("negotiating");
  const [statusReason, setStatusReason] = useState("");
  const [mergeTarget, setMergeTarget] = useState("");
  const [mergeReason, setMergeReason] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const brokers = detail?.brokers ?? [];
  const agreements = detail?.agreements ?? [];
  const statusLogs = detail?.status_logs ?? [];

  const load = async () => {
    if (!storeId) return;
    setLoading(true);
    setError("");
    try {
      const result = await merchantApi<Detail>(`/admin/merchant/stores/${storeId}/detail`);
      setDetail(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const run = async (action: () => Promise<void>) => {
    setError("");
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    }
  };

  const changeStatus = () =>
    run(async () => {
      await merchantApi(`/admin/merchant/stores/${storeId}/status`, {
        method: "POST",
        body: JSON.stringify({ target_status: statusTarget, reason: statusReason }),
      });
    });

  const approve = () =>
    run(async () => {
      await merchantApi(`/admin/merchant/stores/${storeId}/review`, {
        method: "POST",
        body: JSON.stringify({ action: "approve" }),
      });
    });

  const merge = () =>
    run(async () => {
      await merchantApi("/admin/merchant/stores/merge", {
        method: "POST",
        body: JSON.stringify({ keep_store_id: mergeTarget, merged_store_id: storeId, reason: mergeReason }),
      });
    });

  const remove = () =>
    run(async () => {
      await merchantApi(`/admin/merchant/stores/${storeId}/delete`, {
        method: "POST",
        body: JSON.stringify({ reason: deleteReason }),
      });
    });

  return (
    <div className="min-h-screen bg-fog">
      <PageContainer className="flex flex-col gap-6">
        <PageHeader
          title="门店详情"
          description="档案 · 经纪人 · 拜访时间线 · 协议 · 线索统计"
          actions={
            <Button variant="outline" asChild>
              <Link href="/admin/merchant/stores">返回列表</Link>
            </Button>
          }
        />

        {error ? <Card className="p-4 text-sm text-error">{error}</Card> : null}
        {loading ? <Card className="p-6 text-sm text-muted-foreground">加载中...</Card> : null}

        {detail ? (
          <>
            <Card className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xl font-semibold">{detail.store.store_name}</div>
                  <div className="mt-1 text-sm text-graphite">
                    {detail.store.company_name} · {detail.store.district} · {detail.store.business_circle}
                  </div>
                  <div className="mt-1 text-sm">{detail.store.address}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge>{detail.store.cooperation_status_label}</Badge>
                    <Badge variant={detail.store.review_status === "pending" ? "destructive" : "secondary"}>
                      {detail.store.review_status === "pending" ? "待审核" : "已转正"}
                    </Badge>
                    <Badge variant="secondary">{detail.store.status}</Badge>
                  </div>
                </div>
                <div className="text-right text-sm text-graphite">
                  <div>联系人：{detail.store.contact_name}</div>
                  <div>电话：{detail.store.contact_phone}</div>
                  <div>最近拜访：{detail.store.last_visit_at ? new Date(detail.store.last_visit_at).toLocaleString("zh-CN") : "—"}</div>
                  <div>线索：{detail.lead_stats.total}（本月 +{detail.lead_stats.month_new}）</div>
                </div>
              </div>
            </Card>

            {detail.store.review_status === "pending" ? (
              <Card className="flex flex-wrap items-center gap-3 p-4">
                <span className="text-sm font-medium">经纪人自建门店待审核</span>
                <Button size="sm" onClick={() => void approve()}>
                  转正
                </Button>
                <span className="text-xs text-graphite">合并请在下方操作</span>
              </Card>
            ) : null}

            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="p-6">
                <div className="mb-3 text-sm font-medium">合作状态变更</div>
                <div className="flex flex-wrap gap-2">
                  <Select value={statusTarget} onValueChange={setStatusTarget}>
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((item) => (
                        <SelectItem key={item.code} value={item.code}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="flex-1"
                    placeholder="变更原因（必填）"
                    value={statusReason}
                    onChange={(event) => setStatusReason(event.target.value)}
                  />
                  <Button onClick={() => void changeStatus()} disabled={!statusReason.trim()}>
                    提交变更
                  </Button>
                </div>
                <div className="mt-4 space-y-2 text-xs text-graphite">
                  {statusLogs.map((log) => (
                    <div key={log.id}>
                      {log.from_status} → {log.to_status} · {new Date(log.created_at).toLocaleString("zh-CN")} · {log.reason}
                    </div>
                  ))}
                  {statusLogs.length === 0 ? <div>暂无状态变更</div> : null}
                </div>
              </Card>

              <Card className="p-6">
                <div className="mb-3 text-sm font-medium">合并 / 删除</div>
                <div className="flex flex-wrap gap-2">
                  <Input
                    className="flex-1"
                    placeholder="保留门店 ID"
                    value={mergeTarget}
                    onChange={(event) => setMergeTarget(event.target.value)}
                  />
                  <Input
                    className="flex-1"
                    placeholder="合并原因"
                    value={mergeReason}
                    onChange={(event) => setMergeReason(event.target.value)}
                  />
                  <Button
                    variant="outline"
                    onClick={() => void merge()}
                    disabled={!mergeTarget.trim() || !mergeReason.trim()}
                  >
                    合并到保留门店
                  </Button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Input
                    className="flex-1"
                    placeholder="删除原因（无关联数据才可删除）"
                    value={deleteReason}
                    onChange={(event) => setDeleteReason(event.target.value)}
                  />
                  <Button
                    variant="destructive"
                    onClick={() => void remove()}
                    disabled={!deleteReason.trim()}
                  >
                    软删除
                  </Button>
                </div>
              </Card>
            </div>

            <Card className="p-6">
              <div className="mb-3 text-sm font-medium">门店经纪人（{brokers.length}）</div>
              <div className="flex flex-wrap gap-2 text-sm">
                {brokers.map((broker) => (
                  <span key={String(broker.id)} className="rounded-full bg-mist px-3 py-1">
                    {String(broker.name)} · {String(broker.phone_masked)}
                  </span>
                ))}
                {brokers.length === 0 ? <span className="text-graphite">暂无有效绑定经纪人</span> : null}
              </div>
            </Card>

            <Card className="p-6">
              <div className="mb-3 text-sm font-medium">拜访时间线</div>
              <div className="space-y-3">
                {detail.visits.items.map((visit) => (
                  <div key={visit.id} className="rounded-lg bg-mist p-3 text-sm">
                    <div className="flex justify-between text-xs text-graphite">
                      <span>{new Date(visit.visited_at).toLocaleString("zh-CN")}</span>
                      <span>{visit.employee_name || "员工"}</span>
                    </div>
                    <div className="mt-1">
                      联系人：{visit.contact_name} · 结果：{visit.result || "未填写"}
                    </div>
                    {visit.remark ? <div className="text-xs text-graphite">{visit.remark}</div> : null}
                    {visit.is_backfill ? <Badge variant="secondary">补录</Badge> : null}
                  </div>
                ))}
                {detail.visits.items.length === 0 ? <div className="text-sm text-graphite">暂无拜访记录</div> : null}
              </div>
            </Card>

            <Card className="p-6">
              <div className="mb-3 text-sm font-medium">协议（{agreements.length}）</div>
              <div className="space-y-2 text-sm">
                {agreements.map((agreement) => (
                  <div key={String(agreement.id)} className="flex justify-between rounded-lg bg-mist px-3 py-2">
                    <span>{String(agreement.agreement_no || agreement.id)} · {String(agreement.template_name || "协议")}</span>
                    <span className="text-xs text-graphite">{String(agreement.status)}</span>
                  </div>
                ))}
                {agreements.length === 0 ? <div className="text-graphite">暂无协议</div> : null}
              </div>
            </Card>
          </>
        ) : null}
      </PageContainer>
    </div>
  );
}
