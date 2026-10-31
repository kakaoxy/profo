"use client";

import { useEffect, useState } from "react";

import { PageContainer } from "@/app/(main)/admin/_components/page-container";
import { PageHeader } from "@/app/(main)/admin/_components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { components } from "@/lib/api-types";
import { merchantApi } from "../_components/merchant-api";

type Template = components["schemas"]["AgreementTemplateResponse"];

export default function AgreementTemplatesPage() {
  const [items, setItems] = useState<Template[]>([]);
  const [name, setName] = useState("");
  const [type, setType] = useState("store");
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

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

        {error ? <Card className="p-4 text-sm text-error">{error}</Card> : null}

        <Card className="grid gap-3 p-6 md:grid-cols-2">
          <Input placeholder="模板名称 *" value={name} onChange={(event) => setName(event.target.value)} />
          <Input placeholder="适用合作类型（如 store / company）" value={type} onChange={(event) => setType(event.target.value)} />
          <textarea
            className="min-h-40 rounded-md border border-input bg-background p-3 text-sm md:col-span-2"
            placeholder="协议正文 *"
            value={content}
            onChange={(event) => setContent(event.target.value)}
          />
          <div className="md:col-span-2">
            <Button onClick={() => void create()}>新建模板</Button>
          </div>
        </Card>

        {loading ? <Card className="p-6 text-sm text-muted-foreground">加载中...</Card> : null}

        {items.length ? (
          <div className="grid gap-3">
            {items.map((item) => (
              <Card key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <div className="font-medium">{item.template_name}</div>
                  <div className="text-xs text-graphite">
                    {item.cooperation_type} · {item.version}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={item.status === "enabled" ? "default" : "secondary"}>
                    {item.status === "enabled" ? "启用" : "停用"}
                  </Badge>
                  <Button size="sm" variant="outline" onClick={() => void toggle(item)}>
                    {item.status === "enabled" ? "停用" : "启用"}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        ) : null}
      </PageContainer>
    </div>
  );
}
