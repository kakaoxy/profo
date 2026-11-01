"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { PageContainer } from "@/app/(main)/admin/_components/page-container";
import { PageHeader } from "@/app/(main)/admin/_components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/app/(main)/admin/merchant/_components/field";
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

type CompanyList = components["schemas"]["MerchantCompanyListResponse"];
type CompanyItem = components["schemas"]["MerchantCompanyResponse"];
type StoreResult = components["schemas"]["MerchantStoreCreateResult"];
type StoreResponse = components["schemas"]["MerchantStoreResponse"];
type StoreUpdateResult = components["schemas"]["MerchantStoreResponse"] | components["schemas"]["MerchantStoreRelocateResponse"];
type DuplicateCandidate = components["schemas"]["MerchantDuplicateCandidate"];

interface FormState {
  store_name: string;
  province: string;
  city: string;
  district: string;
  business_circle: string;
  address: string;
  lng: string;
  lat: string;
  contact_name: string;
  contact_phone: string;
  remark: string;
  force_create_reason: string;
  cooperation_status: string;
  owner_employee_id: string;
}

const EMPTY_FORM: FormState = {
  store_name: "",
  province: "上海市",
  city: "上海市",
  district: "浦东新区",
  business_circle: "",
  address: "",
  lng: "",
  lat: "",
  contact_name: "",
  contact_phone: "",
  remark: "",
  force_create_reason: "",
  cooperation_status: "not_cooperated",
  owner_employee_id: "",
};

export default function MerchantStoreCreatePage() {
  const router = useRouter();
  const [companyKeyword, setCompanyKeyword] = useState("");
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [company, setCompany] = useState<CompanyItem | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [editStoreId, setEditStoreId] = useState("");
  const [changeType, setChangeType] = useState<"edit" | "correct" | "relocate">("correct");
  const [changeReason, setChangeReason] = useState("");
  const [loadingStore, setLoadingStore] = useState(false);
  const [employees, setEmployees] = useState<components["schemas"]["UserSimpleResponse"][]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([]);
  const [circleOptions, setCircleOptions] = useState<string[]>([]);
  const [loadedUpdatedAt, setLoadedUpdatedAt] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const storeId = params.get("store_id");
    if (params.get("mode") === "edit" && storeId) {
      setEditStoreId(storeId);
      setLoadingStore(true);
      merchantApi<StoreResponse>(`/admin/merchant/stores/${storeId}`)
        .then((store) => {
          setCompany({
            id: store.company_id,
            company_name: store.company_name,
            status: "normal",
            contact_name: null,
            contact_phone_masked: null,
            remark: null,
            created_at: store.created_at,
            updated_at: store.updated_at,
          });
          setLoadedUpdatedAt(store.updated_at);
          setForm({
            store_name: store.store_name,
            province: store.province,
            city: store.city,
            district: store.district,
            business_circle: store.business_circle,
            address: store.address,
            lng: store.lng === null ? "" : String(store.lng),
            lat: store.lat === null ? "" : String(store.lat),
            contact_name: store.contact_name,
            contact_phone: store.contact_phone,
            remark: store.remark || "",
            force_create_reason: "",
            cooperation_status: store.cooperation_status,
            owner_employee_id: store.owner_employee_id || "",
          });
        })
        .catch((err: unknown) => setError(err instanceof Error ? err.message : "加载门店失败"))
        .finally(() => setLoadingStore(false));
    }
  }, []);

  useEffect(() => {
    merchantApi<components["schemas"]["UserSimpleListResponse"]>("/users/simple?page=1&page_size=200")
      .then((result) => setEmployees(result.items))
      .catch(() => setEmployees([]));
  }, []);

  useEffect(() => {
    const district = form.district.trim();
    if (!district) {
      setCircleOptions([]);
      return;
    }
    merchantApi<components["schemas"]["MerchantBusinessCircleResponse"]>(
      `/admin/merchant/business-circles?district=${encodeURIComponent(district)}`,
    )
      .then((result) => setCircleOptions(result.items))
      .catch(() => setCircleOptions([]));
  }, [form.district]);

  const searchCompany = async () => {
    setError("");
    try {
      const result = await merchantApi<CompanyList>(
        `/admin/merchant/companies?keyword=${encodeURIComponent(companyKeyword)}&limit=20`,
      );
      setCompanies(result.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "公司搜索失败");
    }
  };

  const update = (field: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm((previous) => ({ ...previous, [field]: event.target.value }));
  };

  const submit = async () => {
    if (!company) {
      setError("请先选择公司");
      return;
    }
    if (!editStoreId && (!form.lng || !form.lat)) {
      setError("新建门店必须填写经纬度");
      return;
    }
    if (editStoreId && changeType === "relocate" && !changeReason.trim()) {
      setError("门店搬迁必须填写原因");
      return;
    }
    if (editStoreId && changeType !== "relocate" && !changeReason.trim()) {
      setError("编辑门店必须填写变更原因");
      return;
    }
    if (!editStoreId && duplicates.length === 0 && !form.force_create_reason.trim()) {
      // REQ-M01B-002：命中疑似重复门店时先展示候选并允许选择已有门店，继续新建需填强制理由
      try {
        const checked = await merchantApi<components["schemas"]["MerchantDuplicateCheckResponse"]>(
          "/admin/merchant/stores/check-duplicates",
          {
            method: "POST",
            body: JSON.stringify({
              store_name: form.store_name,
              address: form.address,
              lng: form.lng ? Number(form.lng) : null,
              lat: form.lat ? Number(form.lat) : null,
              contact_phone: form.contact_phone || null,
            }),
          },
        );
        if (checked.candidates.length > 0) {
          setDuplicates(checked.candidates);
          setError("存在疑似重复门店，请先确认；如确需新建，请填写强制新建理由后再次保存");
          return;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "门店查重失败");
        return;
      }
    }
    setSubmitting(true);
    setError("");
    try {
      if (editStoreId) {
        const result = await merchantApi<StoreUpdateResult>(`/admin/merchant/stores/${editStoreId}`, {
          method: "PUT",
          body: JSON.stringify({
            company_id: company.id,
            store_name: form.store_name,
            province: form.province,
            city: form.city,
            district: form.district,
            business_circle: form.business_circle,
            address: form.address,
            lng: form.lng ? Number(form.lng) : undefined,
            lat: form.lat ? Number(form.lat) : undefined,
            contact_name: form.contact_name,
            contact_phone: form.contact_phone,
            owner_employee_id: form.owner_employee_id || null,
            remark: form.remark || null,
            change_type: changeType,
            change_reason: changeReason.trim(),
            expected_updated_at: loadedUpdatedAt || undefined,
          }),
        });
        const targetId = "new_store" in result ? result.new_store.id : result.id;
        router.push(`/admin/merchant/stores/${targetId}`);
        return;
      }
      const result = await merchantApi<StoreResult>("/admin/merchant/stores", {
        method: "POST",
        body: JSON.stringify({
          company_id: company.id,
          store_name: form.store_name,
          province: form.province,
          city: form.city,
          district: form.district,
          business_circle: form.business_circle,
          address: form.address,
          lng: Number(form.lng),
          lat: Number(form.lat),
          contact_name: form.contact_name,
          contact_phone: form.contact_phone,
          cooperation_status: form.cooperation_status,
          owner_employee_id: form.owner_employee_id || null,
          remark: form.remark || null,
          force_create_reason: form.force_create_reason || null,
        }),
      });
      router.push(`/admin/merchant/stores/${result.store.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : editStoreId ? "保存失败" : "新建失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-fog">
      <PageContainer className="flex flex-col gap-6">
        <PageHeader
          title={editStoreId ? "编辑门店" : "新建门店"}
          description={
            editStoreId
              ? "修改门店档案；地址/坐标变化请选择地址纠错或门店搬迁并填写原因"
              : "运营补录门店：填写完整档案后保存，用于后台补录 / 导入"
          }
        />

        {error ? <Card className="rounded-cards border-0 shadow-steep-sm p-5 text-sm text-error">{error}</Card> : null}
        {loadingStore ? <Card className="rounded-cards border-0 shadow-steep-sm p-6 text-sm text-muted-foreground">加载门店中...</Card> : null}

        <Card className="rounded-cards border-0 shadow-steep-sm p-6">
          <div className="mb-4 text-sm font-medium">所属公司</div>
          {company ? (
            <div className="flex items-center justify-between rounded-images bg-fog p-3">
              <div>
                <div className="font-medium">{company.company_name}</div>
                <div className="text-xs text-graphite">{company.status === "disabled" ? "已停用" : "正常"}</div>
              </div>
              <Button variant="ghost" onClick={() => setCompany(null)}>
                更换
              </Button>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <Input
                  placeholder="输入公司名称搜索"
                  value={companyKeyword}
                  onChange={(event) => setCompanyKeyword(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && void searchCompany()}
                />
                <Button variant="outline" onClick={() => void searchCompany()}>
                  搜索
                </Button>
              </div>
              {companies.length ? (
                <div className="mt-3 divide-y rounded-images border">
                  {companies.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-fog"
                      onClick={() => {
                        setCompany(item);
                        setCompanies([]);
                      }}
                    >
                      <span>{item.company_name}</span>
                      <span className="text-xs text-graphite">{item.status === "disabled" ? "已停用" : "正常"}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </Card>

        <Card className="rounded-cards border-0 shadow-steep-sm grid gap-4 p-6 md:grid-cols-2">
          <Field label="门店名称" required>
            <Input value={form.store_name} onChange={update("store_name")} />
          </Field>
          <Field
            label="商圈"
            required
            hint={circleOptions.length ? "可参考该区县已有商圈，也可直接输入新商圈" : undefined}
          >
            <Input
              list="merchant-business-circle-options"
              value={form.business_circle}
              onChange={update("business_circle")}
            />
            <datalist id="merchant-business-circle-options">
              {circleOptions.map((circle) => (
                <option key={circle} value={circle} />
              ))}
            </datalist>
          </Field>
          <Field label="省份" required>
            <Input value={form.province} onChange={update("province")} />
          </Field>
          <Field label="城市" required>
            <Input value={form.city} onChange={update("city")} />
          </Field>
          <Field label="区县" required>
            <Input value={form.district} onChange={update("district")} />
          </Field>
          <Field label="详细地址" required>
            <Input value={form.address} onChange={update("address")} />
          </Field>
          <Field label="经度（GCJ-02）" required hint="取高德坐标拾取器的 GCJ-02 经度，非 WGS-84">
            <Input value={form.lng} onChange={update("lng")} inputMode="decimal" />
          </Field>
          <Field label="纬度（GCJ-02）" required hint="取高德坐标拾取器的 GCJ-02 纬度，非 WGS-84">
            <Input value={form.lat} onChange={update("lat")} inputMode="decimal" />
          </Field>
          <Field label="联系人" required>
            <Input value={form.contact_name} onChange={update("contact_name")} />
          </Field>
          <Field label="联系电话" required>
            <Input value={form.contact_phone} onChange={update("contact_phone")} inputMode="tel" />
          </Field>
          <Field label="负责人" hint="选填；门店归属员工，用于数据范围与二维码生成">
            <Select
              value={form.owner_employee_id || "none"}
              onValueChange={(value) =>
                setForm((previous) => ({ ...previous, owner_employee_id: value === "none" ? "" : value }))
              }
            >
              <SelectTrigger aria-label="选择门店负责人">
                <SelectValue placeholder="暂不指定" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">暂不指定</SelectItem>
                {employees.map((employee) => (
                  <SelectItem key={employee.id} value={employee.id}>
                    {employee.nickname || employee.username}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {!editStoreId ? (
            <Field label="合作状态" hint="新建门店仅可设为未合作或洽谈中">
              <Select
                value={form.cooperation_status}
                onValueChange={(value) => setForm((previous) => ({ ...previous, cooperation_status: value }))}
              >
                <SelectTrigger aria-label="选择初始合作状态">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_cooperated">未合作</SelectItem>
                  <SelectItem value="negotiating">洽谈中</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          ) : null}
          {!editStoreId ? (
            <Field
              label="强制新建理由"
              hint="查重命中疑似重复门店时必填，用于放行新建"
              className="md:col-span-2"
            >
              <Input value={form.force_create_reason} onChange={update("force_create_reason")} />
            </Field>
          ) : null}
          {!editStoreId && duplicates.length > 0 ? (
            <div className="rounded-images bg-fog p-3 text-sm md:col-span-2">
              <div className="mb-2 font-medium">疑似重复门店（{duplicates.length} 家）</div>
              <div className="flex flex-col gap-2">
                {duplicates.map((candidate) => (
                  <div
                    key={candidate.id}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-dove pb-2 last:border-0 last:pb-0"
                  >
                    <div>
                      <Link href={`/admin/merchant/stores/${candidate.id}`} className="text-rust hover:underline">
                        {candidate.store_name}
                      </Link>
                      <div className="text-xs text-graphite">
                        {candidate.address}
                        {candidate.distance_m !== null ? ` · 距离 ${candidate.distance_m} 米` : ""}
                      </div>
                    </div>
                    <div className="text-xs text-graphite">
                      {candidate.cooperation_status_label} · 命中 {candidate.matched_by.length} 项
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <Field label="备注" className="md:col-span-2">
            <Input value={form.remark} onChange={update("remark")} />
          </Field>
          {editStoreId ? (
            <>
              <Field label="变更类型" required>
                <Select value={changeType} onValueChange={(value) => setChangeType(value as "edit" | "correct" | "relocate")}>
                  <SelectTrigger>
                    <SelectValue placeholder="请选择变更类型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="edit">一般信息编辑</SelectItem>
                    <SelectItem value="correct">地址纠错</SelectItem>
                    <SelectItem value="relocate">门店搬迁（生成新门店）</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="变更原因" required>
                <Input value={changeReason} onChange={(event) => setChangeReason(event.target.value)} />
              </Field>
            </>
          ) : null}
        </Card>

        <div className="flex justify-end gap-2">
          <Button variant="outline" asChild>
            <Link href="/admin/merchant/stores">取消</Link>
          </Button>
          <Button onClick={() => void submit()} disabled={submitting || loadingStore}>
            {submitting ? "保存中..." : editStoreId ? "保存修改" : "保存门店"}
          </Button>
        </div>
      </PageContainer>
    </div>
  );
}
