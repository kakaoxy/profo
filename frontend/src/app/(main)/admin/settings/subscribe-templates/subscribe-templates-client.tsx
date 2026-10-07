"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { usePermission } from "@/hooks/use-permission";
import { client } from "@/lib/api-client";
import { cn } from "@/lib/utils";

/** 单个模板 key 的请求体字段名（openapi-typescript 已内联 source 联合类型，本地取值） */
type TemplateKey =
  "recruit_lead" | "valuation_price" | "customer_lead" | "project_new" | "project_price_change";
type SubscribeTemplatesResponse = {
  recruit_lead: TemplateValue;
  valuation_price: TemplateValue;
  customer_lead: TemplateValue;
  project_new: TemplateValue;
  project_price_change: TemplateValue;
  updated_at?: string | null;
  updated_by_name?: string | null;
};
interface TemplateValue {
  db_value: string;
  env_value: string;
  effective_value: string;
  source: "db" | "env" | "none";
}

/** 三个模板行的展示文案（名称 + 场景说明） */
const TEMPLATE_ROWS: { key: TemplateKey; name: string; desc: string }[] = [
  {
    key: "recruit_lead",
    name: "招募新线索提醒",
    desc: "经纪人在招募活动详情页发起订阅授权，新留资时微信提醒",
  },
  {
    key: "valuation_price",
    name: "估价授权价变更提醒",
    desc: "客户在估价列表/提交页授权，授权价变更时微信提醒",
  },
  {
    key: "customer_lead",
    name: "我的客户新线索提醒",
    desc: "客户留资时微信提醒归属员工",
  },
  {
    key: "project_new",
    name: "房源上新提醒",
    desc: "客户在房源列表页授权，新房源发布时微信服务通知提醒",
  },
  {
    key: "project_price_change",
    name: "房源调价提醒",
    desc: "客户在房源列表页授权，已发布房源调价时微信服务通知提醒",
  },
];

/** 生效来源徽标（数据库=ink / 环境变量=outline / 未配置=dove） */
function SourceBadge({ source }: { source: TemplateValue["source"] }) {
  if (source === "db") {
    return <Badge className="shrink-0 border-transparent bg-ink text-pure-white">数据库</Badge>;
  }
  if (source === "env") {
    return (
      <Badge variant="outline" className="shrink-0 border-graphite/40 text-graphite">
        环境变量
      </Badge>
    );
  }
  return <Badge className="shrink-0 border-transparent bg-dove text-pure-white">未配置</Badge>;
}

/**
 * 订阅消息模板配置表单（挂载时 GET /api/v1/subscribe-templates）.
 *
 * 三个输入行 + 显式保存（脏标 + 取消 + 保存）；留空保存 = 清除 DB 值
 * （回退 env / 关闭功能）。保存成功后重拉 GET 刷新来源徽标。
 */
export function SubscribeTemplatesClient() {
  const { roleCode } = usePermission();
  const canEdit = roleCode === "admin";

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [saved, setSaved] = useState<SubscribeTemplatesResponse | null>(null);
  // 本地编辑值（脏状态对比基准 = saved 的 db_value）
  const [values, setValues] = useState<Record<TemplateKey, string>>({
    recruit_lead: "",
    valuation_price: "",
    customer_lead: "",
    project_new: "",
    project_price_change: "",
  });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingState, setSavingState] = useState<"idle" | "ok" | "error">("idle");

  const applyResponse = useCallback((data: SubscribeTemplatesResponse) => {
    setSaved(data);
    setValues({
      recruit_lead: data.recruit_lead.db_value,
      valuation_price: data.valuation_price.db_value,
      customer_lead: data.customer_lead.db_value,
      project_new: data.project_new.db_value,
      project_price_change: data.project_price_change.db_value,
    });
    setDirty(false);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const { data, error, response } = await client.GET("/api/v1/subscribe-templates");
      if (response?.status === 403) {
        setForbidden(true);
        return;
      }
      if (error || !data) {
        setLoadError(true);
        return;
      }
      applyResponse(data as SubscribeTemplatesResponse);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [applyResponse]);

  useEffect(() => {
    void load();
  }, [load]);

  const setValue = (key: TemplateKey, v: string) => {
    setValues((prev) => ({ ...prev, [key]: v }));
    setDirty(true);
    setSavingState("idle");
  };

  const handleCancel = () => {
    if (!saved) return;
    applyResponse(saved);
  };

  const handleSave = async () => {
    setSaving(true);
    setSavingState("idle");
    try {
      const { data, error, response } = await client.PUT("/api/v1/subscribe-templates", {
        body: values,
      });
      if (response?.status === 403) {
        setForbidden(true);
        toast.error("仅管理员可保存订阅消息模板配置");
        return;
      }
      if (error || !data) {
        toast.error("保存失败，请稍后重试");
        setSavingState("error");
        return;
      }
      applyResponse(data as SubscribeTemplatesResponse);
      toast.success("订阅消息模板已保存，即时生效");
      setSavingState("ok");
    } catch {
      toast.error("保存失败，请稍后重试");
      setSavingState("error");
    } finally {
      setSaving(false);
    }
  };

  // 403：非管理员（operator 可见导航入口但接口拒绝，理论不可达兜底）
  if (forbidden && roleCode !== "admin") {
    return (
      <div className="rounded-cards bg-white p-8 text-center text-sm text-graphite shadow-steep">
        仅管理员可查看和修改订阅消息模板配置。
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-cards bg-white shadow-steep">
        <Loader2 className="h-8 w-8 animate-spin text-graphite" />
      </div>
    );
  }

  if (loadError || !saved) {
    return (
      <div className="rounded-cards bg-white p-8 text-center shadow-steep">
        <p className="text-sm text-graphite">配置加载失败，请刷新页面重试。</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 rounded-full bg-ink px-4 py-1.5 text-[13px] text-pure-white transition-colors hover:bg-[#2a2d31]"
        >
          重新加载
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-cards bg-white p-6 shadow-steep">
        <div className="flex flex-col gap-5">
          {TEMPLATE_ROWS.map(({ key, name, desc }) => {
            const info = saved[key];
            const isDirty = values[key] !== info.db_value;
            return (
              <div key={key} className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-ink">{name}</span>
                  <SourceBadge source={info.source} />
                  {isDirty && <span className="text-[11px] font-medium text-rust">未保存</span>}
                </div>
                <p className="text-[13px] leading-[1.6] text-graphite">{desc}</p>
                <Input
                  value={values[key]}
                  disabled={!canEdit}
                  placeholder={info.env_value || "未配置环境变量兜底值，留空 = 功能关闭"}
                  onChange={(e) => setValue(key, e.target.value)}
                  className="max-w-[560px] font-mono text-[13px]"
                  aria-label={`${name}模板 ID`}
                />
              </div>
            );
          })}
        </div>

        <p className="mt-5 border-t border-[#f0f0f2] pt-4 text-[13px] leading-[1.7] text-graphite">
          生效优先级：数据库配置 &gt; 环境变量兜底；留空保存 =
          清除数据库配置（回退环境变量，均空则关闭该提醒功能）。
          {saved.updated_at && (
            <>
              <br />
              最后修改：{saved.updated_by_name ?? "—"} ·{" "}
              {new Date(saved.updated_at).toLocaleString("zh-CN", { hour12: false })}
            </>
          )}
        </p>
      </div>

      {canEdit && (
        <div className="flex items-center gap-2">
          {dirty && (
            <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-rust before:h-[7px] before:w-[7px] before:shrink-0 before:rounded-full before:bg-rust before:content-['']">
              有未保存改动
            </span>
          )}
          {!dirty && savingState === "ok" && (
            <span className="text-[12px] text-graphite">已保存</span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              disabled={!dirty || saving}
              onClick={handleCancel}
              className={cn(
                "rounded-full bg-pure-white px-4 py-[7px] text-[12.5px] font-medium text-ink shadow-steep-sm transition-shadow hover:shadow-steep",
                (!dirty || saving) && "pointer-events-none opacity-40",
              )}
            >
              取消
            </button>
            <button
              type="button"
              disabled={!dirty || saving}
              onClick={() => void handleSave()}
              className="rounded-full bg-ink px-[18px] py-[7px] text-[12.5px] font-medium text-pure-white transition-colors hover:bg-[#2a2d31] disabled:opacity-60"
            >
              {saving ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
