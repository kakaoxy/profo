"use client";

import { useEffect, useState, type ReactNode } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import type { components } from "@/lib/api-types";

import { merchantApi } from "../../_components/merchant-api";
import { COMPANY_STATUS_LABELS, companyTone, formatCompanyDateTime } from "./company-status";

type CompanyItem = components["schemas"]["MerchantCompanyResponse"];
type CompanyList = components["schemas"]["MerchantCompanyListResponse"];

type DrawerMode = "view" | "edit" | "create";

type CompanyForm = {
  company_name: string;
  contact_name: string;
  contact_phone: string;
  remark: string;
  status: "normal" | "disabled";
};

const EMPTY_FORM: CompanyForm = {
  company_name: "",
  contact_name: "",
  contact_phone: "",
  remark: "",
  status: "normal",
};

function toForm(company: CompanyItem | null): CompanyForm {
  if (!company) return EMPTY_FORM;
  return {
    company_name: company.company_name,
    contact_name: company.contact_name ?? "",
    // 列表接口只返回脱敏号码，不能回填；留空保存由后端保持原号码不变
    contact_phone: "",
    remark: company.remark ?? "",
    status: company.status === "disabled" ? "disabled" : "normal",
  };
}

export function CompanyDrawer({
  open,
  company,
  mode,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  company: CompanyItem | null;
  mode: DrawerMode;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [detail, setDetail] = useState<CompanyItem | null>(company);
  const [editing, setEditing] = useState(mode !== "view");
  const [form, setForm] = useState<CompanyForm>(EMPTY_FORM);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [duplicateName, setDuplicateName] = useState("");
  const current = detail ?? company;

  useEffect(() => {
    if (!open) return;
    setDetail(company);
    setEditing(mode !== "view");
    setError("");
    setSaving(false);
    setDuplicateName("");
    setForm(toForm(company));
  }, [open, company, mode]);

  const cancelEditing = () => {
    if (!company) {
      onOpenChange(false);
      return;
    }
    setEditing(false);
    setError("");
    setDuplicateName("");
    setForm(toForm(detail ?? company));
  };

  const submit = async () => {
    const name = form.company_name.trim();
    if (!name) {
      setError("公司名称不能为空");
      return;
    }

    if (!company && duplicateName !== name) {
      try {
        const existing = await merchantApi<CompanyList>(
          `/admin/merchant/companies?keyword=${encodeURIComponent(name)}&include_disabled=true&page_size=20`,
        );
        if (existing.items.some((item) => item.company_name.trim() === name)) {
          setDuplicateName(name);
          setError("已存在同名公司，确认仍要创建请再次点击创建公司");
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
        company_name: name,
        contact_name: form.contact_name.trim() || null,
        contact_phone: form.contact_phone.trim() || null,
        remark: form.remark.trim() || null,
      };
      if (company) {
        const updated = await merchantApi<CompanyItem>(
          `/admin/merchant/companies/${company.id}`,
          {
            method: "PUT",
            body: JSON.stringify({ ...body, status: form.status }),
          },
        );
        setDetail(updated);
        setForm(toForm(updated));
        setEditing(false);
        onSaved();
      } else {
        await merchantApi("/admin/merchant/companies", {
          method: "POST",
          body: JSON.stringify(body),
        });
        onOpenChange(false);
        onSaved();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存公司失败");
    } finally {
      setSaving(false);
    }
  };

  const title = editing ? (company ? "编辑公司" : "新建公司") : current?.company_name ?? "公司详情";
  const description = editing
    ? company
      ? "联系电话留空表示保持原号码不变；停用后不可再被新建门店选择。"
      : "维护商户公司主数据，创建后可在同一抽屉中继续编辑。"
    : "商户公司主数据";

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
              <SheetTitle className="break-words text-[26px] leading-[1.18] font-[500] tracking-[-0.009em] text-ink">
                {title}
              </SheetTitle>
              <SheetDescription className="mt-1 text-[15px] leading-[1.4] text-graphite">
                {description}
              </SheetDescription>
              {!editing && current ? (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <StatusBadge tone={companyTone(current.status)}>
                    {COMPANY_STATUS_LABELS[current.status] ?? current.status}
                  </StatusBadge>
                </div>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {!editing && current ? (
                <SteepButton
                  variant="text"
                  className="focus-visible:underline focus-visible:ring-0 focus-visible:ring-offset-0"
                  onClick={() => setEditing(true)}
                >
                  <PencilLine />
                  编辑
                </SteepButton>
              ) : null}
              <SheetClose asChild>
                <SteepButton variant="icon" aria-label="关闭公司详情">
                  <X />
                </SteepButton>
              </SheetClose>
            </div>
          </div>
        </div>

        {error ? (
          <p
            role="alert"
            className="mx-6 mt-4 rounded-[16px] bg-apricot-wash px-4 py-3 text-[14px] leading-[1.5] text-rust"
          >
            {error}
          </p>
        ) : null}

        {!editing ? (
          current ? (
            <div className="flex flex-col gap-8 px-6 py-6">
              <section className="flex flex-col gap-4">
                <h2 className="text-[14px] font-[500] tracking-[-0.009em] text-graphite">基础信息</h2>
                <dl className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
                  <DetailItem label="联系人">{current.contact_name || "—"}</DetailItem>
                  <DetailItem label="联系电话">
                    <span className="tabular-nums">{current.contact_phone_masked || "—"}</span>
                  </DetailItem>
                  <DetailItem label="状态">
                    <StatusBadge tone={companyTone(current.status)}>
                      {COMPANY_STATUS_LABELS[current.status] ?? current.status}
                    </StatusBadge>
                  </DetailItem>
                  <DetailItem label="创建时间">
                    <span className="tabular-nums">{formatCompanyDateTime(current.created_at)}</span>
                  </DetailItem>
                </dl>
              </section>

              <section className="flex flex-col gap-4 border-t border-dove/40 pt-6">
                <h2 className="text-[14px] font-[500] tracking-[-0.009em] text-graphite">档案信息</h2>
                <dl className="grid grid-cols-1 gap-x-6 gap-y-5">
                  <DetailItem label="备注">
                    <span className="whitespace-pre-wrap">{current.remark || "—"}</span>
                  </DetailItem>
                  <DetailItem label="更新时间">
                    <span className="tabular-nums">{formatCompanyDateTime(current.updated_at)}</span>
                  </DetailItem>
                </dl>
              </section>
            </div>
          ) : (
            <p className="px-6 py-8 text-[15px] leading-[1.5] text-graphite">公司信息不存在</p>
          )
        ) : (
          <>
            <div className="flex flex-col gap-5 px-6 py-6">
              <Field label="公司名称" required>
                <SteepInput
                  value={form.company_name}
                  onChange={(event) => {
                    setForm({ ...form, company_name: event.target.value });
                    if (duplicateName && event.target.value.trim() !== duplicateName) {
                      setDuplicateName("");
                    }
                  }}
                  placeholder="请输入公司名称"
                />
              </Field>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <Field label="联系人">
                  <SteepInput
                    value={form.contact_name}
                    onChange={(event) => setForm({ ...form, contact_name: event.target.value })}
                    placeholder="选填"
                  />
                </Field>
                <Field label="联系电话" hint={editing && company ? "留空则不修改原号码" : undefined}>
                  <SteepInput
                    value={form.contact_phone}
                    onChange={(event) => setForm({ ...form, contact_phone: event.target.value })}
                    placeholder={editing && company ? "已脱敏，留空保持不变" : "选填"}
                    inputMode="tel"
                  />
                </Field>
              </div>

              {company ? (
                <Field label="状态">
                  <Select
                    value={form.status}
                    onValueChange={(value) =>
                      setForm({ ...form, status: value as "normal" | "disabled" })
                    }
                  >
                    <SteepSelectTrigger aria-label="公司状态">
                      <SelectValue />
                    </SteepSelectTrigger>
                    <SelectContent className="rounded-[16px] border-dove/40 shadow-steep">
                      <SelectItem value="normal">正常</SelectItem>
                      <SelectItem value="disabled">停用</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              ) : null}

              <Field label="备注">
                <Textarea
                  value={form.remark}
                  onChange={(event) => setForm({ ...form, remark: event.target.value })}
                  placeholder="选填，最多 500 字"
                  className="min-h-[104px] resize-y rounded-[16px] border border-dove/70 bg-pure-white px-4 py-3 text-[15px] font-[450] tracking-[-0.009em] text-ink shadow-none placeholder:text-graphite focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-ink/10 md:text-[15px]"
                />
              </Field>
            </div>

            <div className="sticky bottom-0 -mx-0 flex items-center justify-end gap-4 border-t border-dove/40 bg-pure-white px-6 py-4">
              <SteepButton variant="text" onClick={cancelEditing} disabled={saving}>
                取消
              </SteepButton>
              <SteepButton variant="primary" onClick={() => void submit()} disabled={saving}>
                {saving ? "保存中…" : company ? "保存修改" : "创建公司"}
              </SteepButton>
            </div>
          </>
        )}
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
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <dt className="text-[14px] leading-[1.4] text-graphite">{label}</dt>
      <dd className="mt-1 text-[15px] leading-[1.5] text-ink">{children}</dd>
    </div>
  );
}
