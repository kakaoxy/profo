"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Lock, Mail } from "lucide-react";
import type { NotificationPreferencesResponse } from "@/components/notifications/shared";

interface PreferenceFormProps {
  initial: NotificationPreferencesResponse;
}

/** 分类展示顺序（与后端 CATEGORY_META 一致） */
const CATEGORY_ORDER = [
  "lead",
  "growth",
  "project",
  "key",
  "marketing",
  "finance",
  "system",
  "security",
] as const;

/**
 * 消息偏好表单（设计稿屏 04）。
 *
 * 规则（SPEC K5 / K18）：
 * - `system` / `security` 的站内信开关锁定（后端强制忽略关闭，返回 400）；
 * - `marketing` 仅微信（站内信开关置灰）；
 * - 模板缺失的分类微信开关置灰（TEMPLATE_MISSING）；
 * - 未绑定微信 → 微信整列禁用。
 */
export function PreferenceForm({ initial }: PreferenceFormProps) {
  const router = useRouter();
  const [prefs, setPrefs] = useState(initial.categories);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const wechatAvailable = initial.wechat_available;

  const toggle = (category: string, channel: "in_app" | "wechat") => {
    const row = prefs[category];
    if (!row) return;
    if (channel === "in_app" && (row.in_app_locked || row.wechat_only)) return;
    if (channel === "wechat" && (!wechatAvailable || row.wechat_template_missing)) return;
    setSaved(false);
    setPrefs({ ...prefs, [category]: { ...row, [channel]: !row[channel] } });
  };

  const save = () =>
    startTransition(async () => {
      setError(null);
      const payload = {
        categories: Object.fromEntries(
          Object.entries(prefs).map(([cat, row]) => [
            cat,
            { in_app: row.in_app, wechat: row.wechat },
          ]),
        ),
      };
      try {
        const res = await fetch("/api/v1/notifications/preferences", {
          method: "PUT",
          headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
          credentials: "include",
          body: JSON.stringify(payload),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(body.message ?? "保存失败");
          return;
        }
        setPrefs(body.categories);
        setSaved(true);
        router.refresh();
      } catch {
        setError("网络错误，请重试");
      }
    });

  return (
    <>
      {initial.template_missing_count > 0 && (
        <div className="mb-5 flex items-start gap-3 rounded-cards bg-apricot-wash px-5 py-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rust" aria-hidden="true" />
          <div className="min-w-0 text-[13px] text-rust">
            <p className="font-[450]">
              微信模板缺失：5 个订阅入口中 {initial.template_missing_count} 个未配置
            </p>
            <p className="mt-1 leading-[1.6] text-rust/80">
              对应分类的微信开关已置灰且不可打开（error_code=TEMPLATE_MISSING）。
              请先在「设置 → 订阅消息模板」补齐后再回来开启。
            </p>
          </div>
        </div>
      )}

      {!wechatAvailable && (
        <div className="mb-5 flex items-start gap-3 rounded-cards bg-white px-5 py-4 shadow-steep-sm">
          <Mail className="mt-0.5 h-4 w-4 shrink-0 text-graphite" aria-hidden="true" />
          <div className="min-w-0 text-[13px] text-ink">
            <p className="font-[450]">当前账号未绑定微信</p>
            <p className="mt-1 leading-[1.6] text-graphite">
              微信渠道整列不可用。请先在小程序端完成绑定。
            </p>
          </div>
        </div>
      )}

      <div className="rounded-cards bg-white px-5 py-4 shadow-steep-sm">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#f0f0f2] text-[12px] text-graphite">
              <th className="pb-3 text-left font-[450]">分类</th>
              <th className="w-28 pb-3 text-center font-[450]">站内信</th>
              <th className="w-28 pb-3 text-center font-[450]">微信</th>
            </tr>
          </thead>
          <tbody>
            {CATEGORY_ORDER.map((category) => {
              const row = prefs[category];
              if (!row) return null;
              const inAppDisabled = row.in_app_locked || row.wechat_only;
              const wechatDisabled = !wechatAvailable || row.wechat_template_missing;
              return (
                <tr key={category} className="border-b border-[#f0f0f2] last:border-0">
                  <td className="py-3.5">
                    <div className="flex items-center gap-2 text-[13.5px] font-[450] text-ink">
                      {row.label}
                      {row.in_app_locked && (
                        <span className="rounded-pill bg-fog px-2 py-0.5 text-[11px] text-graphite">
                          不可关闭
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[12px] text-graphite">{row.description}</p>
                  </td>
                  <td className="py-3.5 text-center">
                    <span className="inline-flex items-center gap-1.5">
                      {row.in_app_locked && (
                        <Lock className="h-3 w-3 text-dove" aria-hidden="true" />
                      )}
                      <Switch
                        on={row.in_app}
                        disabled={inAppDisabled}
                        label={`${row.label} 站内信`}
                        onChange={() => toggle(category, "in_app")}
                      />
                    </span>
                  </td>
                  <td className="py-3.5 text-center">
                    <span className="inline-flex items-center gap-1.5">
                      <Switch
                        on={row.wechat}
                        disabled={wechatDisabled}
                        label={`${row.label} 微信`}
                        onChange={() => toggle(category, "wechat")}
                      />
                      {row.wechat_template_missing && (
                        <span
                          title="模板未配置（TEMPLATE_MISSING），不可打开"
                          aria-label="模板未配置，微信不可开启"
                          className="inline-flex"
                        >
                          <Lock className="h-3 w-3 text-dove" aria-hidden="true" />
                        </span>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="rounded-pill bg-ink px-4 py-2 text-[13.5px] font-[450] text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "保存中…" : "保存偏好"}
        </button>
        {saved && <span className="text-[12.5px] text-money-negative">已保存</span>}
        {error && (
          <span role="alert" className="text-[12.5px] text-rust">
            {error}
          </span>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-cards bg-white px-5 py-[18px] shadow-steep-sm">
          <p className="text-[13.5px] font-medium text-ink">关闭后会发生什么</p>
          <p className="mt-2 text-[12.5px] leading-[1.72] text-graphite">
            关闭某分类的站内信后，事件仍会触发、微信仍按原逻辑发送，但
            <b className="font-[480] text-ink">不产生新的收件记录</b>；已产生的历史消息不受影响。
          </p>
        </div>
        <div className="rounded-cards bg-white px-5 py-[18px] shadow-steep-sm">
          <p className="text-[13.5px] font-medium text-ink">C 端事件不在本页</p>
          <p className="mt-2 text-[12.5px] leading-[1.72] text-graphite">
            营销发布、营销调价、评估价变更仅落投递审计日志，不建站内信，因此不出现在偏好设置中。
          </p>
        </div>
      </div>
    </>
  );
}

interface SwitchProps {
  on: boolean;
  disabled?: boolean;
  label: string;
  onChange: () => void;
}

/** 开关（Steep：Ink 实底，禁用态降权；role=switch + aria-checked 保证可访问） */
function Switch({ on, disabled, label, onChange }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-disabled={disabled || undefined}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative h-[18px] w-8 rounded-full transition-colors ${
        disabled ? "cursor-not-allowed bg-dove/30" : on ? "bg-ink" : "bg-dove/45"
      }`}
    >
      <span
        className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white transition-all ${
          on ? "left-[16px]" : "left-[2px]"
        }`}
      />
    </button>
  );
}
