"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PencilLine, X } from "lucide-react";

import { Field } from "@/app/(main)/admin/_components/field";
import { StatusBadge } from "@/app/(main)/admin/_components/status-badge";
import { SteepButton, SteepInput, SteepSelectTrigger } from "@/components/custom/steep-controls";
import { Select, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import type { components } from "@/lib/api-types";
import { merchantApi } from "../../_components/merchant-api";
import {
  cooperationTone,
  formatDateTime,
  reviewTone,
  REVIEW_LABELS,
  SOURCE_LABELS,
  storeTone,
  STORE_STATUS_LABELS,
} from "./store-status";

type StoreDetail = components["schemas"]["MerchantStoreResponse"];
type StoreListItem = components["schemas"]["MerchantStoreListItem"];
type DistrictList = components["schemas"]["MerchantDistrictListResponse"];
type CircleList = components["schemas"]["MerchantBusinessCircleResponse"];
type UserSimple = components["schemas"]["UserSimpleResponse"];

type EditForm = {
  store_name: string;
  address: string;
  district: string;
  business_circle: string;
  contact_name: string;
  contact_phone: string;
  owner_employee_id: string;
};

const toForm = (store: StoreDetail): EditForm => ({
  store_name: store.store_name,
  address: store.address,
  district: store.district,
  business_circle: store.business_circle,
  contact_name: store.contact_name,
  // 管理端详情接口返回明文手机号，可安全回填编辑
  contact_phone: store.contact_phone,
  owner_employee_id: store.owner_employee_id ?? "__none__",
});

/**
 * 门店详情抽屉（REQ-IT7-01）.
 *
 * 查看态展示档案；编辑态允许修改基础信息、区域商圈与负责人，保存走 PUT /admin/merchant/stores/{id}，
 * 带 expected_updated_at 乐观锁，避免两人同时编辑相互覆盖。
 */
export function StoreDrawer({
  storeId,
  summary,
  open,
  onOpenChange,
  onSaved,
}: {
  storeId: string | null;
  summary: StoreListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [store, setStore] = useState<StoreDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<EditForm | null>(null);
  const [districts, setDistricts] = useState<string[]>([]);
  const [circles, setCircles] = useState<string[]>([]);
  const [employees, setEmployees] = useState<UserSimple[]>([]);
  const loadIdRef = useRef(0);

  const loadStore = useCallback(async (id: string) => {
    const loadId = ++loadIdRef.current;
    setLoading(true);
    setError("");
    try {
      const detail = await merchantApi<StoreDetail>(`/admin/merchant/stores/${id}`);
      if (loadId !== loadIdRef.current) return;
      setStore(detail);
      setForm(toForm(detail));
    } catch (err) {
      if (loadId !== loadIdRef.current) return;
      setError(err instanceof Error ? err.message : "加载门店详情失败");
    } finally {
      if (loadId === loadIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || !storeId) {
      loadIdRef.current += 1;
      return;
    }
    setEditing(false);
    setStore(null);
    setForm(null);
    void loadStore(storeId);
  }, [open, storeId, loadStore]);

  useEffect(() => {
    if (!open) return;
    merchantApi<DistrictList>("/admin/merchant/districts")
      .then((result) => setDistricts(result.items))
      .catch(() => setDistricts([]));
    merchantApi<components["schemas"]["UserSimpleListResponse"]>(
      "/users/simple?page=1&page_size=200",
    )
      .then((result) => setEmployees(result.items))
      .catch(() => setEmployees([]));
  }, [open]);

  const district = form?.district ?? "";
  useEffect(() => {
    if (!open || !editing || !district) {
      setCircles([]);
      return;
    }
    let cancelled = false;
    merchantApi<CircleList>(
      `/admin/merchant/business-circles?district=${encodeURIComponent(district)}`,
    )
      .then((result) => {
        if (!cancelled) setCircles(result.items);
      })
      .catch(() => {
        if (!cancelled) setCircles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, editing, district]);

  const ownerName = useMemo(() => {
    if (!store?.owner_employee_id) return "—";
    if (store.owner_employee_name) return store.owner_employee_name;
    const employee = employees.find((item) => item.id === store.owner_employee_id);
    return employee ? employee.nickname || employee.username : store.owner_employee_id;
  }, [store?.owner_employee_id, store?.owner_employee_name, employees]);

  const save = async () => {
    if (!store || !form) return;
    if (
      !form.store_name.trim() ||
      !form.address.trim() ||
      !form.district.trim() ||
      !form.business_circle.trim()
    ) {
      setError("门店名称、详细地址、区域、商圈为必填项");
      return;
    }
    if (!form.contact_name.trim() || !form.contact_phone.trim()) {
      setError("联系人和联系电话为必填项");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const locationChanged =
        form.address.trim() !== store.address || form.business_circle !== store.business_circle;
      await merchantApi(`/admin/merchant/stores/${store.id}`, {
        method: "PUT",
        body: JSON.stringify({
          store_name: form.store_name.trim(),
          address: form.address.trim(),
          district: form.district,
          business_circle: form.business_circle,
          contact_name: form.contact_name.trim(),
          contact_phone: form.contact_phone.trim(),
          owner_employee_id: form.owner_employee_id === "__none__" ? null : form.owner_employee_id,
          change_type: locationChanged ? "correct" : "edit",
          change_reason: locationChanged ? "后台修正门店地址/商圈" : null,
          expected_updated_at: store.updated_at,
        }),
      });
      setEditing(false);
      await loadStore(store.id);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存门店失败");
    } finally {
      setSaving(false);
    }
  };

  const status = store?.status ?? summary?.status ?? "";
  const reviewStatus = store?.review_status ?? summary?.review_status ?? "";
  const cooperationStatus = store?.cooperation_status ?? summary?.cooperation_status ?? "";
  const cooperationLabel =
    store?.cooperation_status_label ?? summary?.cooperation_status_label ?? "—";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full gap-0 overflow-y-auto rounded-l-[24px] border-0 bg-pure-white p-0 shadow-steep sm:max-w-[560px]"
      >
        <div className="border-b border-dove/40 px-6 pt-8 pb-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate text-[26px] leading-[1.18] font-[500] tracking-[-0.009em] text-ink">
                {store?.store_name ?? summary?.store_name ?? "门店详情"}
              </SheetTitle>
              <SheetDescription className="mt-1 text-[15px] leading-[1.4] text-graphite">
                {store
                  ? `${store.company_name} · ${Array.from(
                      new Set([store.province, store.city].filter(Boolean)),
                    ).join(" ")}`
                  : "正在加载门店详情"}
              </SheetDescription>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <StatusBadge tone={storeTone(status)}>
                  {STORE_STATUS_LABELS[status] ?? status ?? "—"}
                </StatusBadge>
                <StatusBadge tone={reviewTone(reviewStatus)}>
                  {REVIEW_LABELS[reviewStatus] ?? reviewStatus ?? "—"}
                </StatusBadge>
                <StatusBadge tone={cooperationTone(cooperationStatus)}>
                  {cooperationLabel}
                </StatusBadge>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {!editing && store ? (
                <SteepButton variant="text" onClick={() => setEditing(true)}>
                  <PencilLine />
                  编辑
                </SteepButton>
              ) : null}
              <SheetClose asChild>
                <SteepButton variant="icon" aria-label="关闭门店详情">
                  <X />
                </SteepButton>
              </SheetClose>
            </div>
          </div>
        </div>

        {error ? (
          <p className="mx-6 mt-4 rounded-[16px] bg-apricot-wash px-4 py-3 text-[14px] leading-[1.5] text-rust">
            {error}
          </p>
        ) : null}
        {loading ? (
          <p className="px-6 py-8 text-[15px] leading-[1.5] text-graphite" aria-live="polite">
            正在加载门店详情
          </p>
        ) : null}

        {store && form && !loading ? (
          <div className="flex flex-col gap-8 px-6 py-6">
            <section className="flex flex-col gap-4">
              <h2 className="text-[14px] font-[500] tracking-[-0.009em] text-graphite">基础信息</h2>
              {editing ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="门店名称" required className="sm:col-span-2">
                    <SteepInput
                      value={form.store_name}
                      onChange={(event) => setForm({ ...form, store_name: event.target.value })}
                    />
                  </Field>
                  <Field label="详细地址" required className="sm:col-span-2">
                    <SteepInput
                      value={form.address}
                      onChange={(event) => setForm({ ...form, address: event.target.value })}
                    />
                  </Field>
                  <Field label="区域" required hint="跨区域变更请走门店搬迁">
                    <Select
                      value={form.district}
                      disabled
                      onValueChange={(value) =>
                        setForm({ ...form, district: value, business_circle: "" })
                      }
                    >
                      <SteepSelectTrigger aria-label="区域">
                        <SelectValue placeholder="请选择区域" />
                      </SteepSelectTrigger>
                      <SelectContent className="rounded-[16px] border-dove/40 shadow-steep">
                        {districts.map((item) => (
                          <SelectItem key={item} value={item}>
                            {item}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field
                    label="商圈"
                    required
                    hint={circles.length ? undefined : "该区域暂无候选，可沿用原商圈"}
                  >
                    <Select
                      value={form.business_circle}
                      onValueChange={(value) => setForm({ ...form, business_circle: value })}
                    >
                      <SteepSelectTrigger aria-label="商圈">
                        <SelectValue placeholder="请选择商圈" />
                      </SteepSelectTrigger>
                      <SelectContent className="rounded-[16px] border-dove/40 shadow-steep">
                        {Array.from(
                          new Set([form.business_circle, ...circles].filter(Boolean)),
                        ).map((item) => (
                          <SelectItem key={item} value={item}>
                            {item}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="联系人" required>
                    <SteepInput
                      value={form.contact_name}
                      onChange={(event) => setForm({ ...form, contact_name: event.target.value })}
                    />
                  </Field>
                  <Field label="联系电话" required>
                    <SteepInput
                      value={form.contact_phone}
                      inputMode="tel"
                      onChange={(event) => setForm({ ...form, contact_phone: event.target.value })}
                    />
                  </Field>
                  <Field label="负责人" className="sm:col-span-2">
                    <Select
                      value={form.owner_employee_id}
                      onValueChange={(value) => setForm({ ...form, owner_employee_id: value })}
                    >
                      <SteepSelectTrigger aria-label="负责人">
                        <SelectValue placeholder="未指定" />
                      </SteepSelectTrigger>
                      <SelectContent className="rounded-[16px] border-dove/40 shadow-steep">
                        <SelectItem value="__none__">未指定</SelectItem>
                        {employees.map((employee) => (
                          <SelectItem key={employee.id} value={employee.id}>
                            {employee.nickname || employee.username}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              ) : (
                <dl className="grid grid-cols-2 gap-x-6 gap-y-5">
                  <DetailItem label="详细地址" className="col-span-2">
                    {store.address}
                  </DetailItem>
                  <DetailItem label="区域 / 商圈">
                    {store.district} · {store.business_circle}
                  </DetailItem>
                  <DetailItem label="负责人">{ownerName}</DetailItem>
                  <DetailItem label="联系人">{store.contact_name}</DetailItem>
                  <DetailItem label="联系电话">{store.contact_phone}</DetailItem>
                </dl>
              )}
            </section>

            <section className="flex flex-col gap-4 border-t border-dove/40 pt-6">
              <h2 className="text-[14px] font-[500] tracking-[-0.009em] text-graphite">经营信息</h2>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-5">
                <DetailItem label="来源">{SOURCE_LABELS[store.source] ?? store.source}</DetailItem>
                <DetailItem label="经纪人数量">{summary?.broker_count ?? "—"}</DetailItem>
                <DetailItem label="最近拜访">{formatDateTime(store.last_visit_at)}</DetailItem>
                <DetailItem label="创建时间">{formatDateTime(store.created_at)}</DetailItem>
                <DetailItem label="备注" className="col-span-2">
                  {store.remark || "—"}
                </DetailItem>
              </dl>
            </section>

            {editing ? (
              <div className="sticky bottom-0 -mx-6 flex items-center justify-end gap-4 border-t border-dove/40 bg-pure-white px-6 py-4">
                <SteepButton
                  variant="text"
                  onClick={() => {
                    setEditing(false);
                    setForm(toForm(store));
                    setError("");
                  }}
                  disabled={saving}
                >
                  取消
                </SteepButton>
                <SteepButton variant="primary" onClick={() => void save()} disabled={saving}>
                  {saving ? "保存中…" : "保存修改"}
                </SteepButton>
              </div>
            ) : null}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function DetailItem({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <dt className="text-[14px] leading-[1.4] text-graphite">{label}</dt>
      <dd className="mt-1 text-[15px] leading-[1.5] text-ink">{children}</dd>
    </div>
  );
}
