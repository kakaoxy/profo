"use client";

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
import { merchantApi } from "../_components/merchant-api";

const COOPERATION_TYPE_LABELS: Record<string, string> = {
  store: "门店协议",
  company: "公司协议",
};

type Template = components["schemas"]["AgreementTemplateResponse"];

export default function AgreementTemplatesPage() {
  const [items, setItems] = useState<Template[]>([]);
  const [name, setName] = useState("");
  const [type, setType] = useState("store");
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Template | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState("store");
  const [editContent, setEditContent] = useState("");
  const [editVersion, setEditVersion] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setItems(await merchantApi<Template[]>("/admin/merchant/agreement-templates"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const create = async () => {
    if (!name.trim() || !content.trim()) {
      setError("模板名称与正文必填");
      return;
    }
    try {
      await merchantApi("/admin/merchant/agreement-templates", {
        method: "POST",
        body: JSON.stringify({
          template_name: name.trim(),
          cooperation_type: type,
          content: content.trim(),
          version: "v1",
        }),
      });
      setName("");
      setContent("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    }
  };

  const openEdit = (item: Template) => {
    setEditing(item);
    setEditName(item.template_name);
    setEditType(item.cooperation_type);
    setEditContent(item.content);
    setEditVersion(item.version);
    setError("");
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (!editName.trim() || !editContent.trim()) {
      setError("模板名称与正文必填");
      return;
    }
    setSavingEdit(true);
    try {
      await merchantApi(`/admin/merchant/agreement-templates/${editing.id}`, {
        method: "PUT",
        body: JSON.stringify({
          template_name: editName.trim(),
          cooperation_type: editType,
          content: editContent.trim(),
          version: editVersion.trim() || "v1",
        }),
      });
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSavingEdit(false);
    }
  };

  const toggle = async (item: Template) => {
    try {
      await merchantApi(`/admin/merchant/agreement-templates/${item.id}`, {
        method: "PUT",
        body: JSON.stringify({ status: item.status === "enabled" ? "disabled" : "enabled" }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    }
  };

  return (
    <div className="min-h-screen bg-fog">
      <PageContainer className="flex flex-col gap-6">
        <PageHeader title="协议模板" description="运营按合作类型维护多套模板；停用不影响已发起协议" />

        {error ? <Card className="rounded-cards border-0 shadow-steep-sm p-5 text-sm text-error">{error}</Card> : null}

        <Card className="rounded-cards border-0 shadow-steep-sm p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="模板名称" required>
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label="适用合作类型" required hint="决定员工发起协议时该模板出现在哪类主体下">
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="store">门店协议</SelectItem>
                  <SelectItem value="company">公司协议</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="协议正文" required className="md:col-span-2" hint="支持 {{变量}} 占位符，发起协议时按门店/公司数据渲染">
              <textarea
                className="min-h-40 rounded-inputs border border-input bg-background p-3 text-sm"
                value={content}
                onChange={(event) => setContent(event.target.value)}
              />
            </Field>
            <div className="md:col-span-2">
              <Button onClick={() => void create()}>新建模板</Button>
            </div>
          </div>
        </Card>

        {loading ? <Card className="rounded-cards border-0 shadow-steep-sm p-6 text-sm text-muted-foreground">加载中...</Card> : null}

        {!loading && items.length === 0 ? (
          <Card className="rounded-cards border-0 shadow-steep-sm p-6 text-sm text-graphite">
            还没有协议模板，先在上方新建一套，员工发起协议时即可选择。
          </Card>
        ) : null}

        {items.length ? (
          <div className="grid gap-3">
            {items.map((item) => (
              <Card key={item.id} className="rounded-cards border-0 shadow-steep-sm p-5">
                {/* Card 自带 flex-col：横向排列必须放进内层容器 */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{item.template_name}</div>
                    <div className="text-xs text-graphite">
                      {COOPERATION_TYPE_LABELS[item.cooperation_type] || item.cooperation_type} ·{" "}
                      {item.version}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge tone={item.status === "enabled" ? "positive" : "neutral"}>
                      {item.status === "enabled" ? "启用" : "停用"}
                    </StatusBadge>
                    <Button size="sm" variant="outline" onClick={() => openEdit(item)}>
                      编辑
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void toggle(item)}>
                      {item.status === "enabled" ? "停用" : "启用"}
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : null}
        {editing ? (
          <Card className="rounded-cards border-0 shadow-steep-sm fixed inset-0 z-50 m-auto flex h-fit max-h-[85vh] w-[min(640px,92vw)] flex-col gap-3 overflow-y-auto p-5">
            <div className="text-sm font-medium">编辑协议模板</div>
            <Field label="模板名称" required>
              <Input value={editName} onChange={(event) => setEditName(event.target.value)} />
            </Field>
            <Field label="适用合作类型" required>
              <Select value={editType} onValueChange={setEditType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="store">门店协议</SelectItem>
                  <SelectItem value="company">公司协议</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="协议正文" required hint="支持 {{变量}} 占位符">
              <textarea
                className="min-h-40 rounded-inputs border border-input bg-background p-3 text-sm"
                value={editContent}
                onChange={(event) => setEditContent(event.target.value)}
              />
            </Field>
            <Field label="版本">
              <Input value={editVersion} onChange={(event) => setEditVersion(event.target.value)} />
            </Field>
            <div className="flex gap-2">
              <Button onClick={() => void saveEdit()} disabled={savingEdit}>
                {savingEdit ? "保存中…" : "保存"}
              </Button>
              <Button variant="outline" onClick={() => setEditing(null)}>
                取消
              </Button>
            </div>
          </Card>
        ) : null}
      </PageContainer>
    </div>
  );
}
