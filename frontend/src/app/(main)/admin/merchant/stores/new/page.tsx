"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { PageContainer } from "@/app/(main)/admin/_components/page-container";
import { PageHeader } from "@/app/(main)/admin/_components/page-header";
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

type CompanyList = components["schemas"]["MerchantCompanyListResponse"];
type CompanyItem = components["schemas"]["MerchantCompanyResponse"];
type StoreResult = components["schemas"]["MerchantStoreCreateResult"];
type StoreResponse = components["schemas"]["MerchantStoreResponse"];
type StoreUpdateResult = components["schemas"]["MerchantStoreResponse"] | components["schemas"]["MerchantStoreRelocateResponse"];

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
          });
        })
        .catch((err: unknown) => setError(err instanceof Error ? err.message : "加载门店失败"))
        .finally(() => setLoadingStore(false));
    }
  }, []);

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
            remark: form.remark || null,
            change_type: changeType,
            change_reason: changeReason.trim(),
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
          cooperation_status: "not_cooperated",
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

        {error ? <Card className="p-4 text-sm text-error">{error}</Card> : null}
        {loadingStore ? <Card className="p-6 text-sm text-muted-foreground">加载门店中...</Card> : null}

        <Card className="p-6">
          <div className="mb-4 text-sm font-medium">所属公司</div>
          {company ? (
            <div className="flex items-center justify-between rounded-lg bg-mist p-3">
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
                <div className="mt-3 divide-y rounded-lg border">
                  {companies.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-mist"
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

        <Card className="grid gap-4 p-6 md:grid-cols-2">
          <Input placeholder="门店名称 *" value={form.store_name} onChange={update("store_name")} />
          <Input placeholder="商圈 *" value={form.business_circle} onChange={update("business_circle")} />
          <Input placeholder="省 *" value={form.province} onChange={update("province")} />
          <Input placeholder="市 *" value={form.city} onChange={update("city")} />
          <Input placeholder="区县 *" value={form.district} onChange={update("district")} />
          <Input placeholder="详细地址 *" value={form.address} onChange={update("address")} />
          <Input placeholder="经度 GCJ-02 *" value={form.lng} onChange={update("lng")} />
          <Input placeholder="纬度 GCJ-02 *" value={form.lat} onChange={update("lat")} />
          <Input placeholder="联系人 *" value={form.contact_name} onChange={update("contact_name")} />
          <Input placeholder="联系电话 *" value={form.contact_phone} onChange={update("contact_phone")} />
          {!editStoreId ? (
            <Input
              placeholder="查重命中时的强制新建理由"
              value={form.force_create_reason}
              onChange={update("force_create_reason")}
            />
          ) : null}
          <Input placeholder="备注" value={form.remark} onChange={update("remark")} />
          {editStoreId ? (
            <>
              <Select value={changeType} onValueChange={(value) => setChangeType(value as "edit" | "correct" | "relocate")}>
                <SelectTrigger>
                  <SelectValue placeholder="变更类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="edit">一般信息编辑</SelectItem>
                  <SelectItem value="correct">地址纠错</SelectItem>
                  <SelectItem value="relocate">门店搬迁（生成新门店）</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="变更原因 *"
                value={changeReason}
                onChange={(event) => setChangeReason(event.target.value)}
              />
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
