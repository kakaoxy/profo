"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PencilLine } from "lucide-react";

import { Field } from "@/app/(main)/admin/_components/field";
import { StatusBadge } from "@/app/(main)/admin/_components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { components } from "@/lib/api-types";
import { merchantApi } from "../../_components/merchant-api";

type StoreDetail = components["schemas"]["MerchantStoreResponse"];
type StoreListItem = components["schemas"]["MerchantStoreListItem"];
type DistrictList = components["schemas"]["MerchantDistrictListResponse"];
type CircleList = components["schemas"]["MerchantBusinessCircleResponse"];
type UserSimple = components["schemas"]["UserSimpleResponse"];

const STATUS_LABELS: Record<string, string> = {
  normal: "正常",
  disabled: "停用",
  merged: "已合并",
  relocated: "已搬迁",
};
const REVIEW_LABELS: Record<string, string> = { pending: "待审核", approved: "已转正", merged: "已合并" };
const SOURCE_LABELS: Record<string, string> = {
  employee: "员工建档",
  backoffice: "后台新增",
  import: "批量导入",
  broker: "经纪人创建",
};

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
    merchantApi<components["schemas"]["UserSimpleListResponse"]>("/users/simple?page=1&page_size=200")
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
    merchantApi<CircleList>(`/admin/merchant/business-circles?district=${encodeURIComponent(district)}`)
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
    if (!form.store_name.trim() || !form.address.trim() || !form.district.trim() || !form.business_circle.trim()) {
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-[560px]">
        <div className="border-b border-dove/60 px-6 pt-6 pb-5">
          <div className="flex items-start justify-between gap-4 pr-8">
            <div className="min-w-0">
              <SheetTitle className="truncate text-[22px] leading-tight font-medium text-ink">
                {store?.store_name ?? summary?.store_name ?? "门店详情"}
              </SheetTitle>
              <SheetDescription className="mt-1 text-[13px] text-graphite">
                {store ? `${store.company_name} · ${store.province}${store.city}` : "加载中…"}
              </SheetDescription>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusBadge tone={store?.status === "normal" ? "positive" : "neutral"}>
                  {STATUS_LABELS[store?.status ?? summary?.status ?? ""] ?? store?.status ?? "—"}
                </StatusBadge>
                <StatusBadge tone={store?.review_status === "pending" ? "attention" : "neutral"}>
                  {REVIEW_LABELS[store?.review_status ?? summary?.review_status ?? ""] ??
                    store?.review_status ??
                    "—"}
                </StatusBadge>
                <StatusBadge tone="neutral">{store?.cooperation_status_label ?? "—"}</StatusBadge>
              </div>
            </div>
            {!editing && store ? (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <PencilLine className="mr-1 h-4 w-4" /> 编辑
              </Button>
            ) : null}
          </div>
        </div>

        {error ? <p className="mx-6 mt-4 text-sm text-rust">{error}</p> : null}
        {loading ? <p className="px-6 py-8 text-sm text-graphite">加载中…</p> : null}

        {store && form && !loading ? (
          <div className="flex flex-col gap-7 px-6 py-6">
            <section className="flex flex-col gap-4">
              <div className="text-[13px] font-medium tracking-wide text-graphite">基础信息</div>
              {editing ? (
                <div className="grid grid-cols-2 gap-4">
                  <Field label="门店名称" required className="col-span-2">
                    <Input
                      value={form.store_name}
                      onChange={(event) => setForm({ ...form, store_name: event.target.value })}
                    />
                  </Field>
                  <Field label="详细地址" required className="col-span-2">
                    <Input
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
                      <SelectTrigger aria-label="区域">
                        <SelectValue placeholder="请选择区域" />
                      </SelectTrigger>
                      <SelectContent>
                        {districts.map((item) => (
                          <SelectItem key={item} value={item}>
                            {item}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="商圈" required hint={circles.length ? undefined : "该区域暂无候选，可沿用原商圈"}>
                    <Select
                      value={form.business_circle}
                      onValueChange={(value) => setForm({ ...form, business_circle: value })}
                    >
                      <SelectTrigger aria-label="商圈">
                        <SelectValue placeholder="请选择商圈" />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from(new Set([form.business_circle, ...circles].filter(Boolean))).map(
                          (item) => (
                            <SelectItem key={item} value={item}>
                              {item}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="联系人" required>
                    <Input
                      value={form.contact_name}
                      onChange={(event) => setForm({ ...form, contact_name: event.target.value })}
                    />
                  </Field>
                  <Field label="联系电话" required>
                    <Input
                      value={form.contact_phone}
                      inputMode="tel"
                      onChange={(event) => setForm({ ...form, contact_phone: event.target.value })}
                    />
                  </Field>
                  <Field label="负责人" className="col-span-2">
                    <Select
                      value={form.owner_employee_id}
                      onValueChange={(value) => setForm({ ...form, owner_employee_id: value })}
                    >
                      <SelectTrigger aria-label="负责人">
                        <SelectValue placeholder="未指定" />
                      </SelectTrigger>
                      <SelectContent>
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
                <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
                  <div className="col-span-2">
                    <dt className="text-xs text-graphite">详细地址</dt>
                    <dd className="mt-1 text-ink">{store.address}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-graphite">区域 / 商圈</dt>
                    <dd className="mt-1 text-ink">
                      {store.district} · {store.business_circle}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-graphite">负责人</dt>
                    <dd className="mt-1 text-ink">{ownerName}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-graphite">联系人</dt>
                    <dd className="mt-1 text-ink">{store.contact_name}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-graphite">联系电话</dt>
                    <dd className="mt-1 text-ink">{store.contact_phone}</dd>
                  </div>
                </dl>
              )}
            </section>

            <section className="flex flex-col gap-3 border-t border-dove/50 pt-5">
              <div className="text-[13px] font-medium tracking-wide text-graphite">经营信息</div>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
                <div>
                  <dt className="text-xs text-graphite">来源</dt>
                  <dd className="mt-1 text-ink">{SOURCE_LABELS[store.source] ?? store.source}</dd>
                </div>
                <div>
                  <dt className="text-xs text-graphite">经纪人数量</dt>
                  <dd className="mt-1 text-ink">{summary?.broker_count ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-graphite">最近拜访</dt>
                  <dd className="mt-1 text-ink">
                    {store.last_visit_at ? new Date(store.last_visit_at).toLocaleString("zh-CN") : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-graphite">创建时间</dt>
                  <dd className="mt-1 text-ink">{new Date(store.created_at).toLocaleString("zh-CN")}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs text-graphite">备注</dt>
                  <dd className="mt-1 text-ink">{store.remark || "—"}</dd>
                </div>
              </dl>
            </section>

            {editing ? (
              <div className="sticky bottom-0 -mx-6 flex items-center justify-end gap-2 border-t border-dove/60 bg-background px-6 py-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditing(false);
                    setForm(toForm(store));
                    setError("");
                  }}
                  disabled={saving}
                >
                  取消
                </Button>
                <Button onClick={() => void save()} disabled={saving}>
                  {saving ? "保存中…" : "保存修改"}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
