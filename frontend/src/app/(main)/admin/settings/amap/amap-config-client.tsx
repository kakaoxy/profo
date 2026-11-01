"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { usePermission } from "@/hooks/use-permission";
import { client } from "@/lib/api-client";

type AmapConfig = {
  js_key: string;
  security_js_code: string;
  configured: boolean;
  updated_at?: string | null;
  updated_by_name?: string | null;
};

function formatUpdatedAt(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN");
}

/** 高德 Web 端 Key 配置表单（仅 admin 可保存）. */
export function AmapConfigClient() {
  const { roleCode } = usePermission();
  const canEdit = roleCode === "admin";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<AmapConfig | null>(null);
  const [value, setValue] = useState("");
  const [securityValue, setSecurityValue] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const apply = useCallback((data: AmapConfig) => {
    setSaved(data);
    setValue(data.js_key);
    setSecurityValue(data.security_js_code ?? "");
    setDirty(false);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data, error: reqError } = await client.GET("/api/v1/amap-config");
      if (reqError || !data) {
        setError("高德地图配置加载失败");
        return;
      }
      apply(data as AmapConfig);
    } catch {
      setError("高德地图配置加载失败");
    } finally {
      setLoading(false);
    }
  }, [apply]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data, error: reqError } = await client.PUT("/api/v1/amap-config", {
        body: { js_key: value.trim(), security_js_code: securityValue.trim() },
      });
      if (reqError || !data) {
        toast.error("保存失败，请确认当前账号为管理员");
        return;
      }
      apply(data as AmapConfig);
      toast.success(value.trim() ? "高德地图 Key 已保存，刷新地图页生效" : "已清除高德地图 Key");
    } catch {
      toast.error("保存失败，请稍后重试");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-5">
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-graphite">
          <Loader2 className="h-4 w-4 animate-spin" />
          加载中…
        </div>
      ) : error ? (
        <div className="text-sm text-error">{error}</div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-medium text-ink">高德 Web 端（JS API）Key</span>
                <Badge
                  className={
                    saved?.configured
                      ? "border-transparent bg-ink text-pure-white"
                      : "border-transparent bg-dove text-pure-white"
                  }
                >
                  {saved?.configured ? "已配置" : "未配置"}
                </Badge>
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-graphite">
                用于后台门店地图与拜访轨迹。在高德开放平台创建「Web端（JS API）」应用后获取；
                2021-12-02 之后申请的 Key 必须同时填写安全密钥；保存后刷新地图/轨迹页生效。
              </p>
            </div>
            <div className="text-right text-xs text-graphite">
              <div>最近修改：{formatUpdatedAt(saved?.updated_at)}</div>
              <div>修改人：{saved?.updated_by_name || "—"}</div>
            </div>
          </div>

          <div className="space-y-2">
            <Input
              placeholder="请输入高德 Web 端（JS API）Key"
              value={value}
              disabled={!canEdit || saving}
              onChange={(event) => {
                setValue(event.target.value);
                setDirty(true);
              }}
              autoComplete="off"
            />
            <Input
              type="password"
              placeholder="请输入高德 Web 端（JS API）安全密钥"
              value={securityValue}
              disabled={!canEdit || saving}
              onChange={(event) => {
                setSecurityValue(event.target.value);
                setDirty(true);
              }}
              autoComplete="new-password"
            />
            {!canEdit ? (
              <p className="ml-1 text-[11px] text-graphite">仅管理员可修改该配置。</p>
            ) : null}
          </div>

          {canEdit ? (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="rounded-full"
                disabled={!dirty || saving}
                onClick={() => saved && apply(saved)}
              >
                取消
              </Button>
              <Button
                className="rounded-full bg-ink text-white hover:bg-ink/90"
                disabled={!dirty || saving}
                onClick={() => void handleSave()}
              >
                {saving ? "保存中…" : "保存"}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}
