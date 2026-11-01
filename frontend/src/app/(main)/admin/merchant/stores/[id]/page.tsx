"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { PageContainer } from "@/app/(main)/admin/_components/page-container";
import { PageHeader } from "@/app/(main)/admin/_components/page-header";
import { Field } from "@/app/(main)/admin/merchant/_components/field";
import { StatusBadge } from "@/app/(main)/admin/merchant/_components/status-badge";
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
type CurrentUser = components["schemas"]["UserResponse"];
type DictItem = components["schemas"]["PublicDictItemResponse"];
type StoreListItem = components["schemas"]["MerchantStoreListItem"];

/** 合作状态选项取自字典 merchant_cooperation_status（停用项不再出现，避免提交 400）。 */
const AGREEMENT_STATUS_LABELS: Record<string, string> = {
  not_initiated: "未发起",
  pending_sign: "待签署",
  signed: "已签署",
  expired: "已过期",
  voided: "已作废",
};

const AGREEMENT_STATUS_TONES: Record<string, "neutral" | "attention" | "positive"> = {
  not_initiated: "neutral",
  pending_sign: "attention",
  signed: "positive",
  expired: "neutral",
  voided: "neutral",
};

const COOPERATION_DICT = "merchant_cooperation_status";
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const PHOTO_TYPE_LABELS: Record<string, string> = { head: "门头照", interior: "内景照", other: "其他" };

export default function MerchantStoreDetailPage() {
  const params = useParams<{ id: string }>();
  const storeId = params?.id ?? "";
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [canViewAgreements, setCanViewAgreements] = useState(false);
  const [error, setError] = useState("");
  const [statusTarget, setStatusTarget] = useState("");
  const [cooperationOptions, setCooperationOptions] = useState<DictItem[]>([]);
  const [cooperationOptionsError, setCooperationOptionsError] = useState("");
  const [statusReason, setStatusReason] = useState("");
  const [mergeTarget, setMergeTarget] = useState("");
  const [mergeReason, setMergeReason] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [activationTarget, setActivationTarget] = useState("");
  const [activationReason, setActivationReason] = useState("");
  const [confirmMerge, setConfirmMerge] = useState(false);
  const [mergePreview, setMergePreview] = useState<components["schemas"]["MerchantStoreMergePreview"] | null>(null);
  const [mergeCandidates, setMergeCandidates] = useState<StoreListItem[]>([]);
  const [canWrite, setCanWrite] = useState(false);
  const [photoType, setPhotoType] = useState("head");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [confirmPhotoUrl, setConfirmPhotoUrl] = useState("");
  const [visitPage, setVisitPage] = useState(1);
  const loadMoreVisits = async () => {
    const nextPage = visitPage + 1;
    try {
      const result = await merchantApi<components["schemas"]["MerchantVisitListResponse"]>(
        `/admin/merchant/stores/${storeId}/visits?page=${nextPage}&page_size=20`,
      );
      setDetail((previous) =>
        previous
          ? {
              ...previous,
              visits: {
                ...previous.visits,
                items: [...previous.visits.items, ...result.items],
                page: result.page,
                page_size: result.page_size,
                total: result.total,
              },
            }
          : previous,
      );
      setVisitPage(nextPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载更多拜访失败");
    }
  };

  const uploadStorePhoto = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("门店照片仅支持图片格式");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError("门店照片大小不能超过 10MB");
      return;
    }
    setUploadingPhoto(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/v1/files/upload", {
        method: "POST",
        headers: { "X-Requested-With": "XMLHttpRequest" },
        credentials: "include",
        body: form,
      });
      const body = (await res.json().catch(() => ({}))) as { url?: string; message?: string };
      if (!res.ok || !body.url) {
        setError(body.message ?? "门店照片上传失败");
        return;
      }
      const photos = [...(detail?.store.photos ?? []), { file_url: body.url, photo_type: photoType }];
      await merchantApi(`/admin/merchant/stores/${storeId}/photos`, {
        method: "PUT",
        body: JSON.stringify({ photos }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "门店照片上传失败");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const removeStorePhoto = async (fileUrl: string) => {
    if (confirmPhotoUrl !== fileUrl) {
      setConfirmPhotoUrl(fileUrl);
      return;
    }
    setConfirmPhotoUrl("");
    try {
      const photos = (detail?.store.photos ?? []).filter((photo) => photo.file_url !== fileUrl);
      await merchantApi(`/admin/merchant/stores/${storeId}/photos`, {
        method: "PUT",
        body: JSON.stringify({ photos }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除门店照片失败");
    }
  };

  const brokers = detail?.brokers ?? [];
  const agreements = detail?.agreements ?? [];
  const statusLogs = detail?.status_logs ?? [];
  const cooperationLabel = (code: string) =>
    cooperationOptions.find((option) => option.code === code)?.label ?? code;

  useEffect(() => {
    merchantApi<components["schemas"]["PublicDictListResponse"]>(`/public/dicts/${COOPERATION_DICT}`)
      .then((result) => setCooperationOptions(result.items))
      .catch(() => setCooperationOptionsError("合作状态字典加载失败，暂不能变更合作状态"));
  }, []);

  useEffect(() => {
    merchantApi<CurrentUser>("/auth/me")
      .then((me) => {
        setCanViewAgreements((me.permissions ?? []).includes("merchant:agreement"));
        setCanWrite((me.permissions ?? []).includes("merchant:write"));
      })
      .catch(() => {
        setCanViewAgreements(false);
        setCanWrite(false);
      });
  }, []);

  useEffect(() => {
    // REQ-M11-005 主流程 3：合并前展示待迁移数据量
    if (!mergeTarget) {
      setMergePreview(null);
      return;
    }
    merchantApi<components["schemas"]["MerchantStoreMergePreview"]>(
      `/admin/merchant/stores/${storeId}/merge-preview?keep_store_id=${mergeTarget}`,
    )
      .then((result) => setMergePreview(result))
      .catch(() => setMergePreview(null));
  }, [mergeTarget, storeId]);

  useEffect(() => {
    // 合并目标只能选未合并的其他门店（保留门店自身的状态校验在后端）
    merchantApi<components["schemas"]["MerchantStoreListResponse"]>(
      "/admin/merchant/stores?page=1&page_size=100",
    )
      .then((result) =>
        setMergeCandidates(result.items.filter((item) => item.id !== storeId && item.status !== "merged")),
      )
      .catch(() => setMergeCandidates([]));
  }, [storeId]);

  const load = async () => {
    if (!storeId) return;
    setLoading(true);
    setError("");
    try {
      const result = await merchantApi<Detail>(`/admin/merchant/stores/${storeId}/detail`);
      setDetail(result);
      setVisitPage(1);
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

  const merge = () => {
    // 合并二次确认（AC-V07-008 / BR-M11-015）：未确认不执行
    if (!confirmMerge) {
      setConfirmMerge(true);
      return;
    }
    setConfirmMerge(false);
    void run(async () => {
      await merchantApi("/admin/merchant/stores/merge", {
        method: "POST",
        body: JSON.stringify({ keep_store_id: mergeTarget, merged_store_id: storeId, reason: mergeReason }),
      });
    });
  };

  const changeActivation = () =>
    run(async () => {
      await merchantApi(`/admin/merchant/stores/${storeId}/activation`, {
        method: "POST",
        body: JSON.stringify({
          target_status: activationTarget,
          reason: activationReason.trim() || null,
        }),
      });
      setActivationTarget("");
      setActivationReason("");
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
            <div className="flex flex-wrap gap-2">
              {detail && detail.store.status !== "merged" && canWrite ? (
                <Button variant="outline" asChild>
                  <Link href={`/admin/merchant/stores/new?mode=edit&store_id=${storeId}`}>
                    编辑门店
                  </Link>
                </Button>
              ) : null}
              <Button variant="outline" asChild>
                <Link href="/admin/merchant/stores">返回列表</Link>
              </Button>
            </div>
          }
        />

        {error ? <Card className="rounded-cards border-0 shadow-steep-sm p-5 text-sm text-error">{error}</Card> : null}
        {loading ? <Card className="rounded-cards border-0 shadow-steep-sm p-6 text-sm text-muted-foreground">加载中...</Card> : null}

        {detail ? (
          <>
            <Card className="rounded-cards border-0 shadow-steep-sm p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[22px] leading-tight font-[480]">{detail.store.store_name}</div>
                  <div className="mt-1 text-sm text-graphite">
                    {detail.store.company_name} · {detail.store.district} · {detail.store.business_circle}
                  </div>
                  <div className="mt-1 text-sm">{detail.store.address}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <StatusBadge
                      tone={
                        detail.store.cooperation_status === "cooperated"
                          ? "positive"
                          : detail.store.cooperation_status === "negotiating"
                            ? "attention"
                            : "neutral"
                      }
                    >
                      {detail.store.cooperation_status_label}
                    </StatusBadge>
                    <StatusBadge
                      tone={
                        detail.store.review_status === "pending"
                          ? "attention"
                          : detail.store.review_status === "approved"
                            ? "positive"
                            : "neutral"
                      }
                    >
                      {detail.store.review_status === "pending"
                        ? "待审核"
                        : detail.store.review_status === "merged"
                          ? "已合并"
                          : "已转正"}
                    </StatusBadge>
                    <StatusBadge tone={detail.store.status === "normal" ? "positive" : "neutral"}>
                      {detail.store.status === "merged"
                        ? "已合并"
                        : detail.store.status === "disabled"
                          ? "停用"
                          : detail.store.status === "relocated"
                            ? "已搬迁"
                            : "正常"}
                    </StatusBadge>
                  </div>
                  {detail.created_by_broker_name || detail.inviter_employee_name ? (
                    <div className="mt-3 rounded-images bg-fog p-3 text-sm text-graphite">
                      创建经纪人：{detail.created_by_broker_name || "—"} · 邀请员工：
                      {detail.inviter_employee_name || "—"}
                    </div>
                  ) : null}
                  {detail.store.status === "merged" ? (
                    <div className="mt-3 rounded-images bg-fog p-3 text-sm">
                      <div className="font-medium">该门店已合并，只读不可编辑</div>
                      {detail.store.former_store_no ? (
                        <div className="mt-1 text-xs text-graphite">
                          原门店编号：{detail.store.former_store_no}
                        </div>
                      ) : null}
                      {detail.store.merged_to_store_id ? (
                        <div className="mt-1 text-xs text-graphite">
                          合并去向：
                          <Link
                            className="text-rust hover:underline"
                            href={`/admin/merchant/stores/${detail.store.merged_to_store_id}`}
                          >
                            {detail.merged_to_store_name || detail.store.merged_to_store_id}
                          </Link>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="w-full text-left text-sm text-graphite sm:mt-0 sm:w-auto sm:text-right">
                  <div>联系人：{detail.store.contact_name}</div>
                  <div>电话：{detail.store.contact_phone}</div>
                  <div>负责人：{detail.owner_employee_name || "—"}</div>
                  <div>最近拜访：{detail.store.last_visit_at ? new Date(detail.store.last_visit_at).toLocaleString("zh-CN") : "—"}</div>
                  <div>线索：{detail.lead_stats.total}（本月 +{detail.lead_stats.month_new}）</div>
                  {detail.store.lng == null || detail.store.lat == null ? (
                    <div className="text-rust">
                      坐标缺失，地图无法标注，
                      <Link
                        className="underline"
                        href={`/admin/merchant/stores/new?mode=edit&store_id=${storeId}`}
                      >
                        去补全
                      </Link>
                    </div>
                  ) : null}
                </div>
              </div>
            </Card>

            {detail.store.review_status === "pending" && detail.store.status !== "merged" ? (
              <Card
                id="review"
                className="rounded-cards border-0 shadow-steep-sm flex flex-wrap items-center gap-3 p-5 scroll-mt-6"
              >
                <span className="text-sm font-medium">经纪人自建门店待审核</span>
                <Button size="sm" variant="outline" onClick={() => void approve()}>
                  转正
                </Button>
                <span className="text-xs text-graphite">合并请在下方操作</span>
              </Card>
            ) : null}

            {detail.store.status === "merged" ? null : (
              <Card className="rounded-cards border-0 shadow-steep-sm p-6">
                <div className="mb-1 text-sm font-medium">门店状态</div>
                <p className="mb-3 text-xs text-graphite">
                  停用后不可新建拜访与经纪人绑定，已存在数据保留；可随时启用恢复。变更原因选填，写入操作日志。
                </p>
                <div className="grid items-end gap-3 md:grid-cols-[12rem_minmax(0,1fr)_auto]">
                  <Field label="目标状态">
                    <Select value={activationTarget} onValueChange={setActivationTarget}>
                      <SelectTrigger aria-label="目标门店状态">
                        <SelectValue placeholder="选择状态" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="normal">正常</SelectItem>
                        <SelectItem value="disabled">停用</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="变更原因">
                    <Input
                      value={activationReason}
                      onChange={(event) => setActivationReason(event.target.value)}
                      aria-label="门店状态变更原因"
                    />
                  </Field>
                  <Button
                    variant="outline"
                    onClick={() => void changeActivation()}
                    disabled={!canWrite || !activationTarget || activationTarget === detail.store.status}
                  >
                    提交
                  </Button>
                </div>
              </Card>
            )}

            {detail.store.status === "merged" ? null : (
            <div className="grid items-start gap-6 lg:grid-cols-2">
              <Card className="rounded-cards border-0 shadow-steep-sm p-6">
                <div className="mb-3 text-sm font-medium">合作状态变更</div>
                <div className="grid items-end gap-3 md:grid-cols-[12rem_minmax(0,1fr)_auto]">
                  <Field label="目标合作状态">
                    <Select value={statusTarget} onValueChange={setStatusTarget}>
                      <SelectTrigger aria-label="目标合作状态" disabled={cooperationOptions.length === 0}>
                        <SelectValue placeholder="选择状态" />
                      </SelectTrigger>
                      <SelectContent>
                        {cooperationOptions.map((item) => (
                          <SelectItem key={item.code} value={item.code}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="变更原因" required>
                    <Input
                      aria-label="合作状态变更原因"
                      value={statusReason}
                      onChange={(event) => setStatusReason(event.target.value)}
                    />
                  </Field>
                  <Button variant="outline" onClick={() => void changeStatus()} disabled={!canWrite || !statusTarget || !statusReason.trim()}>
                    提交变更
                  </Button>
                </div>
                {cooperationOptionsError ? (
                  <p className="mt-2 text-xs text-rust">{cooperationOptionsError}</p>
                ) : (
                  <p className="mt-2 text-xs text-graphite">改为「已合作」前必须先签署电子合作协议。</p>
                )}
                <div className="mt-4 space-y-2 text-xs text-graphite">
                  {statusLogs.map((log) => (
                    <div key={log.id}>
                      {cooperationLabel(log.from_status)} → {cooperationLabel(log.to_status)} ·{" "}
                      {new Date(log.created_at).toLocaleString("zh-CN")} · {log.reason}
                      {log.operator_name ? <span className="text-graphite"> · 操作人：{log.operator_name}</span> : null}
                    </div>
                  ))}
                  {statusLogs.length === 0 ? <div>暂无状态变更</div> : null}
                </div>
              </Card>

              <Card className="rounded-cards border-0 shadow-steep-sm p-6">
                <div className="mb-3 text-sm font-medium">合并 / 删除</div>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="保留门店" required hint="被合并门店的经纪人、拜访、协议将迁移到保留门店">
                    <Select
                      value={mergeTarget}
                      onValueChange={(value) => {
                        setMergeTarget(value);
                        setConfirmMerge(false);
                      }}
                    >
                      <SelectTrigger aria-label="选择保留门店">
                        <SelectValue placeholder="请选择保留门店" />
                      </SelectTrigger>
                      <SelectContent>
                        {mergeCandidates.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.store_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="合并原因" required>
                    <Input
                      value={mergeReason}
                      onChange={(event) => setMergeReason(event.target.value)}
                    />
                  </Field>
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  {confirmMerge ? (
                    <>
                      <Button variant="outline" onClick={() => setConfirmMerge(false)}>
                        取消
                      </Button>
                      <Button variant="outline" onClick={() => void merge()} disabled={!mergeTarget || !mergeReason.trim()}>
                        确认合并
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={() => setConfirmMerge(true)}
                      disabled={!canWrite || !mergeTarget || !mergeReason.trim()}
                    >
                      合并到保留门店
                    </Button>
                  )}
                </div>
                {confirmMerge ? (
                  <p className="mt-2 text-xs text-rust">
                    {mergePreview
                      ? `将迁移：拜访 ${mergePreview.visits} 条、绑定 ${mergePreview.bindings} 条、经纪人 ${mergePreview.brokers} 位、线索 ${mergePreview.leads} 条、协议 ${mergePreview.agreements} 份。`
                      : "正在统计待迁移数据量…"}
                    合并后原门店标记已合并且不可撤销，请再次确认。
                  </p>
                ) : null}
                <div className="mt-6 border-t border-dove pt-4">
                  <Field label="删除原因" required hint="仅无关联数据的门店可删除；删除为软删除，可追溯">
                    <Input
                      value={deleteReason}
                      onChange={(event) => setDeleteReason(event.target.value)}
                    />
                  </Field>
                  <div className="mt-3 flex justify-end gap-2">
                    {confirmDelete ? (
                      <>
                        <Button variant="outline" onClick={() => setConfirmDelete(false)}>
                          取消
                        </Button>
                        <Button variant="outline" onClick={() => void remove()} disabled={!deleteReason.trim()}>
                          确认删除
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="outline"
                        onClick={() => setConfirmDelete(true)}
                        disabled={!canWrite || !deleteReason.trim()}
                      >
                        软删除
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            </div>
            )}

            <Card className="rounded-cards border-0 shadow-steep-sm p-6">
              <div className="mb-3 text-sm font-medium">门店经纪人（{brokers.length}）</div>
              <div className="flex flex-wrap gap-2 text-sm">
                {brokers.map((broker) => (
                  <span key={String(broker.id)} className="rounded-full bg-fog px-3 py-1">
                    {String(broker.name)} · {String(broker.phone_masked)}
                    {broker.bind_status ? ` · ${String(broker.bind_status)}` : ""}
                    {broker.recruit_lead_id ? ` · 推荐线索 ${String(broker.recruit_lead_id).slice(0, 8)}…` : ""}
                  </span>
                ))}
                {brokers.length === 0 ? <span className="text-graphite">暂无有效绑定经纪人</span> : null}
              </div>
            </Card>

            <Card className="rounded-cards border-0 shadow-steep-sm p-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium">门店照片</div>
                {canWrite ? (
                  <div className="flex items-center gap-2">
                    <Select value={photoType} onValueChange={setPhotoType}>
                      <SelectTrigger className="w-32" aria-label="选择照片类型">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="head">门头照</SelectItem>
                        <SelectItem value="interior">内景照</SelectItem>
                        <SelectItem value="other">其他</SelectItem>
                      </SelectContent>
                    </Select>
                    <label className="cursor-pointer rounded-full border border-dove px-3 py-1.5 text-[13px] text-graphite hover:border-ink/40">
                      {uploadingPhoto ? "上传中…" : "上传照片"}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={uploadingPhoto}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void uploadStorePhoto(file);
                          event.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                ) : null}
              </div>
              {(detail?.store.photos ?? []).length === 0 ? (
                <div className="text-sm text-graphite">暂无门店照片</div>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {(detail?.store.photos ?? []).map((photo) => (
                    <div key={photo.file_url} className="w-28">
                      <a
                        href={photo.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="block h-28 w-28 overflow-hidden rounded-images border border-dove"
                      >
                        {/* 对象存储直链无固定尺寸，next/image 需远端白名单，故用原生 img */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photo.file_url} alt={PHOTO_TYPE_LABELS[photo.photo_type] ?? "门店照片"} className="h-full w-full object-cover" />
                      </a>
                      <div className="mt-1 flex items-center justify-between text-xs text-graphite">
                        <span>{PHOTO_TYPE_LABELS[photo.photo_type] ?? photo.photo_type}</span>
                        {canWrite ? (
                          <button
                            type="button"
                            className="text-rust hover:underline"
                            onClick={() => void removeStorePhoto(photo.file_url)}
                          >
                            {confirmPhotoUrl === photo.file_url ? "确认删除" : "删除"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="rounded-cards border-0 shadow-steep-sm p-6">
              <div className="mb-3 text-sm font-medium">拜访时间线</div>
              <div className="space-y-3">
                {detail.visits.items.map((visit) => (
                  <div key={visit.id} className="rounded-images bg-fog p-3 text-sm">
                    <div className="flex justify-between text-xs text-graphite">
                      <span>{new Date(visit.visited_at).toLocaleString("zh-CN")}</span>
                      <span>{visit.employee_name || "员工"}</span>
                    </div>
                    <div className="mt-1">
                      联系人：{visit.contact_name} · 结果：{visit.result || "未填写"}
                    </div>
                    {visit.remark ? <div className="text-xs text-graphite">{visit.remark}</div> : null}
                    {visit.photos.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {visit.photos.map((photo) => (
                          <a
                            key={photo.file_url}
                            href={photo.file_url}
                            target="_blank"
                            rel="noreferrer"
                            className="block h-16 w-16 overflow-hidden rounded-images border border-dove"
                          >
                            {/* 拜访照片为对象存储直链，next/image 需额外配置域名，故用原生 img */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={photo.file_url}
                              alt="拜访照片"
                              className="h-full w-full object-cover"
                            />
                          </a>
                        ))}
                      </div>
                    ) : null}
                    {visit.is_backfill ? <StatusBadge>补录</StatusBadge> : null}
                  </div>
                ))}
                {detail.visits.items.length === 0 ? <div className="text-sm text-graphite">暂无拜访记录</div> : null}
                {detail.visits.total > detail.visits.items.length ? (
                  <div className="pt-1 text-center">
                    <Button variant="outline" size="sm" onClick={() => void loadMoreVisits()}>
                      加载更多（已显示 {detail.visits.items.length}/{detail.visits.total}）
                    </Button>
                  </div>
                ) : null}
              </div>
            </Card>

            {canViewAgreements ? (
            <Card className="rounded-cards border-0 shadow-steep-sm p-6">
              <div className="mb-3 text-sm font-medium">协议（{agreements.length}）</div>
              <div className="space-y-2 text-sm">
                {agreements.map((agreement) => (
                  <div key={String(agreement.id)} className="flex justify-between rounded-images bg-fog px-3 py-2">
                    <span>{String(agreement.agreement_no || agreement.id)} · {String(agreement.template_name || "协议")}</span>
                    <StatusBadge tone={AGREEMENT_STATUS_TONES[String(agreement.status)] || "neutral"}>
                      {AGREEMENT_STATUS_LABELS[String(agreement.status)] || String(agreement.status)}
                    </StatusBadge>
                  </div>
                ))}
                {agreements.length === 0 ? <div className="text-graphite">暂无协议</div> : null}
              </div>
            </Card>
            ) : null}
          </>
        ) : null}
      </PageContainer>
    </div>
  );
}
