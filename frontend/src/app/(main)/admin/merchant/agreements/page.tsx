"use client";

import Link from "next/link";
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
import { merchantApi, queryString } from "../_components/merchant-api";

type AgreementList = components["schemas"]["AgreementListResponse"];
type Agreement = components["schemas"]["AgreementResponse"];
type AgreementTemplate = components["schemas"]["AgreementTemplateResponse"];
type StoreList = components["schemas"]["MerchantStoreListResponse"];
type CompanyList = components["schemas"]["MerchantCompanyListResponse"];

const STATUS_LABELS: Record<string, string> = {
  not_initiated: "未发起",
  pending_sign: "待签署",
  signed: "已签署",
  expired: "已过期",
  voided: "已作废",
};
const REVIEW_LABELS: Record<string, string> = { pending: "待审核", approved: "审核通过", rejected: "审核驳回" };

export default function MerchantAgreementsPage() {
  const [data, setData] = useState<AgreementList | null>(null);
  const [status, setStatus] = useState("all");
  const [reason, setReason] = useState("");
  const [filterStoreId, setFilterStoreId] = useState("all");
  const [agreementNo, setAgreementNo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [templates, setTemplates] = useState<AgreementTemplate[]>([]);
  const [stores, setStores] = useState<StoreList["items"]>([]);
  const [companies, setCompanies] = useState<CompanyList["items"]>([]);
  const [subjectType, setSubjectType] = useState<"store" | "company">("store");
  const [formStoreId, setFormStoreId] = useState("");
  const [formCompanyId, setFormCompanyId] = useState("");
  const [formTemplateId, setFormTemplateId] = useState("");
  const [formSignerName, setFormSignerName] = useState("");
  const [formSignerPhone, setFormSignerPhone] = useState("");
  const [formAgreementNo, setFormAgreementNo] = useState("");
  const [formExpireDate, setFormExpireDate] = useState("");
  const [formRemark, setFormRemark] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [result, templateList, storeList, companyList] = await Promise.all([
        merchantApi<AgreementList>(
          `/admin/merchant/agreements${queryString({
            page: 1,
            page_size: 50,
            status: status === "all" ? undefined : status,
            store_id: filterStoreId === "all" ? undefined : filterStoreId,
            agreement_no: agreementNo.trim() || undefined,
          })}`,
        ),
        merchantApi<AgreementTemplate[]>("/admin/merchant/agreement-templates"),
        merchantApi<StoreList>("/admin/merchant/stores?page=1&page_size=200"),
        merchantApi<CompanyList>("/admin/merchant/companies?limit=100"),
      ]);
      setData(result);
      setTemplates(templateList.filter((item) => item.status === "enabled"));
      setStores(storeList.items);
      setCompanies(companyList.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setSubjectType("store");
    setFormStoreId(stores[0]?.id || "");
    setFormCompanyId(companies[0]?.id || "");
    setFormTemplateId(templates[0]?.id || "");
    setFormSignerName("");
    setFormSignerPhone("");
    setFormAgreementNo("");
    setFormExpireDate("");
    setFormRemark("");
    setCreateOpen(true);
  };

  const onPickStore = (storeId: string) => {
    setFormStoreId(storeId);
    const store = stores.find((item) => item.id === storeId);
    if (store) setFormSignerName(store.contact_name);
  };

  const createAgreement = async () => {
    if (!formTemplateId || !formSignerName.trim() || !formSignerPhone.trim()) {
      setError("请填写模板与签署人姓名、手机号");
      return;
    }
    if (subjectType === "store" && !formStoreId) {
      setError("请选择签约门店");
      return;
    }
    if (subjectType === "company" && !formCompanyId) {
      setError("请选择签约公司");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await merchantApi("/admin/merchant/agreements", {
        method: "POST",
        body: JSON.stringify({
          subject_type: subjectType,
          store_id: subjectType === "store" ? formStoreId : undefined,
          company_id: subjectType === "company" ? formCompanyId : undefined,
          template_id: formTemplateId,
          agreement_no: formAgreementNo.trim() || undefined,
          signer_name: formSignerName.trim(),
          signer_phone: formSignerPhone.trim(),
          expire_at: formExpireDate ? new Date(`${formExpireDate}T23:59:59+08:00`).toISOString() : undefined,
          remark: formRemark.trim() || undefined,
        }),
      });
      setCreateOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "发起失败");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const review = async (item: Agreement, approve: boolean) => {
    if (!approve && !reason.trim()) {
      setError("驳回时必须填写审核意见");
      return;
    }
    try {
      await merchantApi(`/admin/merchant/agreements/${item.id}/review`, {
        method: "POST",
        body: JSON.stringify({ approve, remark: reason.trim() || null }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "审核失败");
    }
  };

  const voidAgreement = async (item: Agreement) => {
    if (!reason.trim()) {
      setError("作废时必须填写原因");
      return;
    }
    try {
      await merchantApi(`/admin/merchant/agreements/${item.id}/void`, {
        method: "POST",
        body: JSON.stringify({ reason: reason.trim() }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "作废失败");
    }
  };

  return (
    <div className="min-h-screen bg-fog">
      <PageContainer className="flex flex-col gap-6">
        <PageHeader
          title="协议管理"
          description="发起、审核、签署归档、到期与作废"
          actions={<Button onClick={openCreate}>发起协议</Button>}
        />

        {createOpen ? (
          <Card className="flex flex-col gap-3 p-4">
            <div className="text-sm font-medium">发起合作协议</div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Select value={subjectType} onValueChange={(value) => setSubjectType(value as "store" | "company")}>
                <SelectTrigger>
                  <SelectValue placeholder="签约主体" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="store">门店主体</SelectItem>
                  <SelectItem value="company">公司主体</SelectItem>
                </SelectContent>
              </Select>
              {subjectType === "store" ? (
                <Select value={formStoreId} onValueChange={onPickStore}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择门店" />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map((store) => (
                      <SelectItem key={store.id} value={store.id}>
                        {store.store_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select value={formCompanyId} onValueChange={setFormCompanyId}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择公司" />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.map((company) => (
                      <SelectItem key={company.id} value={company.id}>
                        {company.company_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Select value={formTemplateId} onValueChange={setFormTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="协议模板" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.template_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="协议编号（可空）"
                value={formAgreementNo}
                onChange={(event) => setFormAgreementNo(event.target.value)}
              />
              <Input
                placeholder="签署人姓名"
                value={formSignerName}
                onChange={(event) => setFormSignerName(event.target.value)}
              />
              <Input
                placeholder="签署人手机号"
                value={formSignerPhone}
                onChange={(event) => setFormSignerPhone(event.target.value)}
              />
              <Input
                type="date"
                value={formExpireDate}
                onChange={(event) => setFormExpireDate(event.target.value)}
              />
              <Input
                placeholder="备注"
                value={formRemark}
                onChange={(event) => setFormRemark(event.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => void createAgreement()} disabled={saving}>
                {saving ? "提交中…" : "提交审核"}
              </Button>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                取消
              </Button>
            </div>
          </Card>
        ) : null}

        <Card className="flex flex-wrap gap-3 p-4">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="协议状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              {Object.entries(STATUS_LABELS).map(([code, label]) => (
                <SelectItem key={code} value={code}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStoreId} onValueChange={setFilterStoreId}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="门店筛选" />
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
          <Input
            className="w-56"
            placeholder="协议编号"
            value={agreementNo}
            onChange={(event) => setAgreementNo(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && void load()}
          />
          <Input
            className="w-80"
            placeholder="审核意见 / 作废原因"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <Button variant="outline" onClick={() => void load()}>
            刷新
          </Button>
        </Card>

        {error ? <Card className="p-4 text-sm text-error">{error}</Card> : null}
        {loading ? <Card className="p-6 text-sm text-muted-foreground">加载中...</Card> : null}

        {data ? (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-mist text-left text-xs text-graphite">
                <tr>
                  <th className="px-4 py-3">协议</th>
                  <th className="px-4 py-3">签约主体</th>
                  <th className="px-4 py-3">签署人</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">审核</th>
                  <th className="px-4 py-3">到期时间</th>
                  <th className="px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id} className="border-t border-mist">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/merchant/agreements/${item.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {item.agreement_no || item.id.slice(0, 8)}
                      </Link>
                      <div className="text-xs text-graphite">{item.template_name || "—"}</div>
                    </td>
                    <td className="px-4 py-3">
                      {item.subject_name || "—"}
                      <div className="text-xs text-graphite">{item.subject_type === "store" ? "门店" : "公司"}</div>
                    </td>
                    <td className="px-4 py-3">
                      {item.signer_name}
                      <div className="text-xs text-graphite">{item.signer_phone_masked}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={item.status === "signed" ? "default" : "secondary"}>
                        {STATUS_LABELS[item.status] || item.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs">{REVIEW_LABELS[item.review_status] || item.review_status}</td>
                    <td className="px-4 py-3 text-xs text-graphite">
                      {item.expire_at ? new Date(item.expire_at).toLocaleDateString("zh-CN") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {item.review_status === "pending" ? (
                          <>
                            <Button size="sm" onClick={() => void review(item, true)}>
                              通过
                             </Button>
                            <Button size="sm" variant="outline" onClick={() => void review(item, false)}>
                              驳回
                            </Button>
                          </>
                        ) : null}
                        {item.status !== "voided" ? (
                          <Button size="sm" variant="destructive" onClick={() => void voidAgreement(item)}>
                            作废
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {data.items.length === 0 ? (
                  <tr>
                    <td className="px-4 py-10 text-center text-sm text-graphite" colSpan={7}>
                      暂无协议
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </Card>
        ) : null}
      </PageContainer>
    </div>
  );
}
