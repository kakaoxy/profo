"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { Field } from "@/app/(main)/admin/_components/field";
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

type CompanyItem = components["schemas"]["MerchantCompanyResponse"];
type CompanyList = components["schemas"]["MerchantCompanyListResponse"];

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

export function CompanyFormSheet({
  open,
  company,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  company: CompanyItem | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<CompanyForm>(EMPTY_FORM);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [duplicateName, setDuplicateName] = useState("");
  const editing = Boolean(company);

  useEffect(() => {
    if (!open) return;
    setError("");
    setSaving(false);
    setDuplicateName("");
    setForm(
      company
        ? {
            company_name: company.company_name,
            contact_name: company.contact_name ?? "",
            // 列表接口只返回脱敏号码，不能回填；留空保存由后端保持原号码不变
            contact_phone: "",
            remark: company.remark ?? "",
            status: company.status === "disabled" ? "disabled" : "normal",
          }
        : EMPTY_FORM,
    );
  }, [open, company]);

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
        await merchantApi(`/admin/merchant/companies/${company.id}`, {
          method: "PUT",
          body: JSON.stringify({ ...body, status: form.status }),
        });
      } else {
        await merchantApi("/admin/merchant/companies", {
          method: "POST",
          body: JSON.stringify(body),
        });
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存公司失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full gap-0 overflow-y-auto rounded-l-[24px] border-0 bg-pure-white p-0 shadow-steep sm:max-w-[560px]"
      >
        <div className="border-b border-dove/40 px-6 pt-8 pb-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <SheetTitle className="text-[26px] leading-[1.18] font-[500] tracking-[-0.009em] text-ink">
                {editing ? "编辑公司" : "新建公司"}
              </SheetTitle>
              <SheetDescription className="mt-1 text-[15px] leading-[1.4] text-graphite">
                {editing
                  ? "联系电话留空表示保持原号码不变；停用后不可再被新建门店选择。"
                  : "维护商户公司主数据，创建后可在同一抽屉中继续编辑。"}
              </SheetDescription>
            </div>
            <SheetClose asChild>
              <SteepButton variant="icon" aria-label="关闭公司表单">
                <X />
              </SteepButton>
            </SheetClose>
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
            <Field
              label="联系电话"
              hint={editing ? "留空则不修改原号码" : undefined}
            >
              <SteepInput
                value={form.contact_phone}
                onChange={(event) => setForm({ ...form, contact_phone: event.target.value })}
                placeholder={editing ? "已脱敏，留空保持不变" : "选填"}
                inputMode="tel"
              />
            </Field>
          </div>

          {editing ? (
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
          <SteepButton variant="text" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </SteepButton>
          <SteepButton variant="primary" onClick={() => void submit()} disabled={saving}>
            {saving ? "保存中…" : editing ? "保存修改" : "创建公司"}
          </SteepButton>
        </div>
      </SheetContent>
    </Sheet>
  );
}
