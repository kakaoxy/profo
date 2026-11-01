'use client';

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageContainer } from "../../_components/page-container";
import { PageHeader } from "../../_components/page-header";
import { StatusBadge } from "../_components/status-badge";
import { Field } from "../_components/field";
import { merchantApi } from "../_components/merchant-api";
import type { components } from "@/lib/api-types";

type Company = components["schemas"]["MerchantCompanyResponse"];
type CompanyList = components["schemas"]["MerchantCompanyListResponse"];

type CompanyForm = {
  company_name: string;
  contact_name: string;
  contact_phone: string;
  remark: string;
  status: "normal" | "disabled";
};

const EMPTY_FORM: CompanyForm = { company_name: "", contact_name: "", contact_phone: "", remark: "", status: "normal" };

export default function MerchantCompaniesPage() {
  const [keyword, setKeyword] = useState("");
  const [includeDisabled, setIncludeDisabled] = useState("all");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CompanyForm>(EMPTY_FORM);
  const [duplicateName, setDuplicateName] = useState("");

  const load = useCallback(async () => {
    const trimmed = keyword.trim();
    if (!trimmed) {
      setCompanies([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ keyword: trimmed, limit: "100" });
      if (includeDisabled === "all") query.set("include_disabled", "true");
      const result = await merchantApi<CompanyList>(`/admin/merchant/companies?${query.toString()}`);
      setCompanies(result.items);
      setSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "公司列表加载失败");
    } finally {
      setLoading(false);
    }
  }, [keyword, includeDisabled]);

  useEffect(() => {
    if (searched) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeDisabled]);

  const startCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const startEdit = (company: Company) => {
    setEditingId(company.id);
    setForm({
      company_name: company.company_name,
      contact_name: company.contact_name ?? "",
      contact_phone: company.contact_phone_masked ?? "",
      remark: company.remark ?? "",
      status: company.status === "disabled" ? "disabled" : "normal",
    });
  };

  const submit = async () => {
    if (!form.company_name.trim()) {
      setError("公司名称不能为空");
      return;
    }
    const name = form.company_name.trim();
    if (!editingId && duplicateName !== name) {
      // REQ-M01A-001 分支 2：同名公司提示但不阻断，二次确认后允许创建
      try {
        const existing = await merchantApi<CompanyList>(
          `/admin/merchant/companies?keyword=${encodeURIComponent(name)}&include_disabled=true&limit=20`,
        );
        if (existing.items.some((item) => item.company_name.trim() === name)) {
          setDuplicateName(name);
          setError("已存在同名公司，确认仍要创建请再次点击保存");
          return;
        }
      } catch {
        // 查重失败不阻断创建，由后端兜底
      }
    }
    setSaving(true);
    setError("");
    try {
      const body = {
        company_name: form.company_name.trim(),
        contact_name: form.contact_name.trim() || null,
        contact_phone: form.contact_phone.trim() || null,
        remark: form.remark.trim() || null,
      };
      if (editingId) {
        await merchantApi(`/admin/merchant/companies/${editingId}`, {
          method: "PUT",
          body: JSON.stringify({ ...body, status: form.status }),
        });
      } else {
        await merchantApi("/admin/merchant/companies", { method: "POST", body: JSON.stringify(body) });
      }
      setForm(EMPTY_FORM);
      setEditingId(null);
      setDuplicateName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存公司失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader title="公司管理" description="维护商户公司主数据；停用后不可再被新建门店选择" />

      <Card className="rounded-cards border-0 shadow-steep-sm p-5">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            className="w-64"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void load();
            }}
            placeholder="按公司名称搜索"
            aria-label="按公司名称搜索"
          />
          <Select value={includeDisabled} onValueChange={setIncludeDisabled}>
            <SelectTrigger className="w-40" aria-label="公司状态范围">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="normal">仅正常</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            {loading ? "查询中…" : "查询"}
          </Button>
          <Button className="ml-auto" variant="outline" onClick={startCreate}>
            新建公司
          </Button>
        </div>
      </Card>

      {error ? <p className="text-sm text-rust">{error}</p> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <Card className="gap-0 rounded-cards border-0 p-0 shadow-steep-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="bg-fog text-xs text-slate">
                <tr>
                  <th className="px-4 py-3 font-normal">公司名称</th>
                  <th className="px-4 py-3 font-normal">联系人</th>
                  <th className="px-4 py-3 font-normal">联系电话</th>
                  <th className="px-4 py-3 font-normal">状态</th>
                  <th className="px-4 py-3 font-normal">备注</th>
                  <th className="px-4 py-3 font-normal">创建时间</th>
                  <th className="px-4 py-3 font-normal">操作</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((company) => (
                  <tr key={company.id} className="border-t border-dove">
                    <td className="px-4 py-3">{company.company_name}</td>
                    <td className="px-4 py-3 text-graphite">{company.contact_name ?? "—"}</td>
                    <td className="px-4 py-3 text-graphite">{company.contact_phone_masked ?? "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={company.status === "normal" ? "positive" : "neutral"}>
                        {company.status === "normal" ? "正常" : "已停用"}
                      </StatusBadge>
                    </td>
                    <td className="max-w-[16rem] truncate px-4 py-3 text-graphite">{company.remark ?? "—"}</td>
                    <td className="px-4 py-3 text-graphite">
                      {new Date(company.created_at).toLocaleString("zh-CN")}
                    </td>
                    <td className="px-4 py-3">
                      <Button variant="outline" size="sm" onClick={() => startEdit(company)}>
                        编辑
                      </Button>
                    </td>
                  </tr>
                ))}
                {companies.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-graphite">
                      {searched ? "没有符合条件的公司" : "输入公司名称后查询"}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="rounded-cards border-0 shadow-steep-sm p-5">
          <div className="mb-3 text-sm font-medium">{editingId ? "编辑公司" : "新建公司"}</div>
          <div className="flex flex-col gap-3">
            <Field label="公司名称" required>
              <Input
                value={form.company_name}
                onChange={(event) => setForm({ ...form, company_name: event.target.value })}
                placeholder="请输入公司名称"
              />
            </Field>
            <Field label="联系人">
              <Input
                value={form.contact_name}
                onChange={(event) => setForm({ ...form, contact_name: event.target.value })}
              />
            </Field>
            <Field label="联系电话">
              <Input
                value={form.contact_phone}
                onChange={(event) => setForm({ ...form, contact_phone: event.target.value })}
              />
            </Field>
            {editingId ? (
              <Field label="状态">
                <Select
                  value={form.status}
                  onValueChange={(value) => setForm({ ...form, status: value as "normal" | "disabled" })}
                >
                  <SelectTrigger aria-label="公司状态">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">正常</SelectItem>
                    <SelectItem value="disabled">停用</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
            <Field label="备注">
              <Input value={form.remark} onChange={(event) => setForm({ ...form, remark: event.target.value })} />
            </Field>
            <div className="flex items-center gap-2">
              <Button onClick={() => void submit()} disabled={saving}>
                {saving ? "保存中…" : "保存"}
              </Button>
              {editingId ? (
                <Button variant="outline" onClick={startCreate}>
                  取消编辑
                </Button>
              ) : null}
            </div>
          </div>
        </Card>
      </div>
    </PageContainer>
  );
}
