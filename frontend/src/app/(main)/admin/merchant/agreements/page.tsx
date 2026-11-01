"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { PageContainer } from "@/app/(main)/admin/_components/page-container";
import { PageHeader } from "@/app/(main)/admin/_components/page-header";
import { Field } from "@/app/(main)/admin/_components/field";
import { StatusBadge } from "@/app/(main)/admin/_components/status-badge";
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

export default function MerchantAgreementsPage() {
  const [data, setData] = useState<AgreementList | null>(null);
  const [status, setStatus] = useState("all");
  const [reason, setReason] = useState("");
  const [filterStoreId, setFilterStoreId] = useState("all");
  const [agreementNo, setAgreementNo] = useState("");
  const [expireFrom, setExpireFrom] = useState("");
  const [expireTo, setExpireTo] = useState("");
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

  // 协议模板按签约主体类型过滤（门店主体只看 store 模板，公司主体只看 company 模板）
  const visibleTemplates = templates.filter((template) => template.cooperation_type === subjectType);

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
            expire_from: expireFrom || undefined,
            expire_to: expireTo || undefined,
          })}`,
        ),
        merchantApi<AgreementTemplate[]>("/admin/merchant/agreement-templates"),
        merchantApi<StoreList>("/admin/merchant/stores?page=1&page_size=200"),
        merchantApi<CompanyList>("/admin/merchant/companies?page_size=100"),
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

  // 数据异步加载完成或慢网时，补齐发起表单的默认选择，避免模板/门店为空导致无法提交
  useEffect(() => {
    if (!createOpen) return;
    setFormStoreId((current) => current || stores[0]?.id || "");
    setFormCompanyId((current) => current || companies[0]?.id || "");
    const firstVisible = templates.find((template) => template.cooperation_type === subjectType);
    setFormTemplateId((current) => {
      const stillVisible = templates.some((template) => template.id === current && template.cooperation_type === subjectType);
      return stillVisible ? current : firstVisible?.id || "";
    });
  }, [createOpen, stores, companies, templates, subjectType]);

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
          description="发起即生成商户签署链接，商户微信登录后自助签署（REQ-IT5-03 取消审核）"
          actions={<Button onClick={openCreate}>发起协议</Button>}
        />

        {createOpen ? (
          <Card className="rounded-cards border-0 shadow-steep-sm flex flex-col gap-3 p-5">
            <div className="text-sm font-medium">发起合作协议</div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="签约主体" required hint="门店主体与公司主体二选一，决定模板与变量取值">
                <Select value={subjectType} onValueChange={(value) => setSubjectType(value as "store" | "company")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="store">门店主体</SelectItem>
                    <SelectItem value="company">公司主体</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {subjectType === "store" ? (
                <Field label="门店" required>
                  <Select value={formStoreId} onValueChange={onPickStore}>
                    <SelectTrigger>
                      <SelectValue placeholder="请选择门店" />
                    </SelectTrigger>
                    <SelectContent>
                      {stores.map((store) => (
                        <SelectItem key={store.id} value={store.id}>
                          {store.store_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              ) : (
                <Field label="公司" required>
                  <Select value={formCompanyId} onValueChange={setFormCompanyId}>
                    <SelectTrigger>
                      <SelectValue placeholder="请选择公司" />
                    </SelectTrigger>
                    <SelectContent>
                      {companies.map((company) => (
                        <SelectItem key={company.id} value={company.id}>
                          {company.company_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
              <Field label="协议模板" required>
                <Select value={formTemplateId} onValueChange={setFormTemplateId}>
                  <SelectTrigger>
                    <SelectValue placeholder="请选择模板" />
                  </SelectTrigger>
                  <SelectContent>
                    {visibleTemplates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.template_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="协议编号" hint="可留空，系统按规则生成">
                <Input
                  value={formAgreementNo}
                  onChange={(event) => setFormAgreementNo(event.target.value)}
                />
              </Field>
              <Field label="签署人姓名" required>
                <Input
                  value={formSignerName}
                  onChange={(event) => setFormSignerName(event.target.value)}
                />
              </Field>
              <Field label="签署人手机号" required>
                <Input
                  value={formSignerPhone}
                  onChange={(event) => setFormSignerPhone(event.target.value)}
                  inputMode="tel"
                />
              </Field>
              <Field label="到期日期" hint="留空表示长期有效">
                <Input
                  type="date"
                  value={formExpireDate}
                  onChange={(event) => setFormExpireDate(event.target.value)}
                />
              </Field>
              <Field label="备注">
                <Input
                  value={formRemark}
                  onChange={(event) => setFormRemark(event.target.value)}
                />
              </Field>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => void createAgreement()} disabled={saving}>
                {saving ? "提交中…" : "发起并生成签署链接"}
              </Button>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                取消
              </Button>
            </div>
          </Card>
        ) : null}

        <Card className="rounded-cards border-0 shadow-steep-sm p-5">
          {/* Card 自带 flex-col：筛选控件必须放在内层横向容器，直接挂 flex-wrap 会纵向堆叠 */}
          <div className="flex flex-wrap items-center gap-3">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-40" aria-label="协议状态">
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
              <SelectTrigger className="w-48" aria-label="门店筛选">
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
              aria-label="按协议编号筛选"
              value={agreementNo}
              onChange={(event) => setAgreementNo(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && void load()}
            />
            <Input
              type="date"
              className="w-40"
              aria-label="到期日期起"
              value={expireFrom}
              onChange={(event) => setExpireFrom(event.target.value)}
            />
            <Input
              type="date"
              className="w-40"
              aria-label="到期日期止"
              value={expireTo}
              onChange={(event) => setExpireTo(event.target.value)}
            />
            <Input
              className="w-80"
              placeholder="作废原因"
              aria-label="作废原因"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
            <Button variant="outline" onClick={() => void load()}>
              刷新
            </Button>
          </div>
        </Card>

        {error ? <Card className="rounded-cards border-0 shadow-steep-sm p-5 text-sm text-error">{error}</Card> : null}
        {loading ? <Card className="rounded-cards border-0 shadow-steep-sm p-6 text-sm text-muted-foreground">加载中...</Card> : null}

        {data ? (
          <Card className="rounded-cards border-0 shadow-steep-sm overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="bg-fog text-left text-xs text-graphite">
                <tr>
                  <th className="px-4 py-3">协议</th>
                  <th className="px-4 py-3">签约主体</th>
                  <th className="px-4 py-3">签署人</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">到期时间</th>
                  <th className="px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id} className="border-t border-dove">
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
                      <StatusBadge
                        tone={
                          item.status === "signed"
                            ? "positive"
                            : item.status === "pending_sign"
                              ? "attention"
                              : "neutral"
                        }
                      >
                        {STATUS_LABELS[item.status] || item.status}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-xs text-graphite">
                      {item.expire_at ? new Date(item.expire_at).toLocaleDateString("zh-CN") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {item.status !== "voided" ? (
                          <Button size="sm" variant="outline" onClick={() => void voidAgreement(item)}>
                            作废
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {data.items.length === 0 ? (
                  <tr>
                    <td className="px-4 py-10 text-center text-sm text-graphite" colSpan={6}>
                      暂无协议
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            </div>
          </Card>
        ) : null}
      </PageContainer>
    </div>
  );
}
