"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronUp, GripVertical, RotateCcw } from "lucide-react";
import type { components } from "@/lib/api-types";
import { getWidget, resolveSpans } from "@/lib/workbench-widgets";

type Entry = components["schemas"]["WorkbenchWidgetEntry"];
type RoleLayoutsResponse = components["schemas"]["WorkbenchRoleLayoutsResponse"];

const ROLES = [
  { code: "admin", label: "管理员" },
  { code: "operator", label: "运营" },
  { code: "user", label: "业务员" },
] as const;

interface WorkbenchLayoutAdminProps {
  initial: RoleLayoutsResponse;
}

/**
 * 角色默认工作台布局管理（设计稿屏 05，需 workbench:manage）。
 *
 * 左列：可分配 widget 清单（顺序 + 启用）；右列：12 栏实时预览 + 来源优先级说明。
 * 保存写 `PUT /api/v1/admin/workbench/role-layouts`（后端记 operation_logs）。
 */
export function WorkbenchLayoutAdmin({ initial }: WorkbenchLayoutAdminProps) {
  const router = useRouter();
  const [role, setRole] = useState<string>("admin");
  const [roles, setRoles] = useState<Record<string, Entry[]>>(initial.roles);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const entries = roles[role] ?? [];
  const enabledKeys = entries.filter((e) => e.enabled).map((e) => e.key);
  const spanMap = resolveSpans(enabledKeys);

  const update = (next: Entry[]) => {
    setSaved(false);
    setRoles({ ...roles, [role]: next });
  };

  const move = (index: number, delta: number) => {
    const next = [...entries];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    update(next.map((item, i) => ({ ...item, order: (i + 1) * 10 })));
  };

  const toggle = (index: number) => {
    const next = [...entries];
    next[index] = { ...next[index], enabled: !next[index].enabled };
    update(next);
  };

  const save = () =>
    startTransition(async () => {
      setError(null);
      try {
        const res = await fetch("/api/v1/admin/workbench/role-layouts", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
          },
          credentials: "include",
          body: JSON.stringify({ roles }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(body.message ?? "保存失败");
          return;
        }
        setRoles(body.roles);
        setSaved(true);
        router.refresh();
      } catch {
        setError("网络错误，请重试");
      }
    });

  const resetRole = () => {
    // 重置为后端代码兜底：删除该角色条目后由后端 fallback
    const next = { ...roles };
    delete next[role];
    setRoles(next);
    setSaved(false);
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
      {/* 左：widget 清单 */}
      <div className="rounded-cards bg-white px-4 py-3 shadow-steep-sm">
        <div className="flex items-center gap-3 px-1 py-2">
          <span className="text-[15px] font-medium text-ink">
            {ROLES.find((r) => r.code === role)?.label}默认布局
          </span>
          <span className="rounded-pill bg-fog px-2.5 py-0.5 text-[11.5px] text-graphite tabular-nums">
            {enabledKeys.length} / {entries.length}
          </span>
          <span className="flex-1" />
          <span className="text-[11.5px] text-dove">上移 / 下移排序</span>
        </div>

        <ul className="mt-1 divide-y divide-[#f7f7f8]">
          {entries.map((entry, index) => {
            const meta = getWidget(entry.key);
            if (!meta) return null;
            return (
              <li key={entry.key} className="flex items-center gap-2 py-2">
                <span className="w-7 shrink-0 text-[12px] text-dove tabular-nums">
                  {String((index + 1) * 10).padStart(2, "0")}
                </span>
                <GripVertical className="h-3.5 w-3.5 shrink-0 text-dove" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-[13.5px] font-[450] ${
                      entry.enabled ? "text-ink" : "text-dove"
                    }`}
                  >
                    {meta.label}
                  </span>
                  <span className="block truncate text-[11.5px] text-graphite">
                    {meta.permission ?? "仅需登录"} ·{" "}
                    {meta.span === 12 ? "满宽" : `${meta.span} 栏`}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label="上移"
                    className="rounded p-1 text-graphite transition-colors hover:bg-fog disabled:opacity-30"
                  >
                    <ChevronUp className="h-3 w-3" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === entries.length - 1}
                    aria-label="下移"
                    className="rounded p-1 text-graphite transition-colors hover:bg-fog disabled:opacity-30"
                  >
                    <ChevronDown className="h-3 w-3" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={entry.enabled}
                    aria-label={`启用 ${meta.label}`}
                    onClick={() => toggle(index)}
                    className={`relative h-[18px] w-8 rounded-full transition-colors ${
                      entry.enabled ? "bg-ink" : "bg-dove/45"
                    }`}
                  >
                    <span
                      className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white transition-all ${
                        entry.enabled ? "left-[16px]" : "left-[2px]"
                      }`}
                    />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>

        <div className="mt-2 flex items-center gap-3 border-t border-dove/25 px-1 pt-3">
          <button
            type="button"
            onClick={resetRole}
            className="inline-flex items-center gap-1 text-[12.5px] text-graphite transition-colors hover:text-ink"
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            重置为代码默认
          </button>
          <span className="flex-1" />
          <span className="text-[11.5px] text-dove">切换角色可分别配置</span>
        </div>
      </div>

      {/* 右：预览 + 规则 */}
      <div className="flex flex-col gap-4">
        <div className="rounded-cards bg-white px-5 py-5 shadow-steep-sm">
          <div className="mb-3.5 flex items-center justify-between">
            <span className="text-[15px] font-medium text-ink">实时预览</span>
            <span className="text-[11.5px] text-graphite">12 栏栅格</span>
          </div>
          <div className="grid grid-cols-12 gap-2">
            {enabledKeys.map((key) => {
              const meta = getWidget(key);
              if (!meta) return null;
              const span = spanMap.get(key) ?? meta.span;
              return (
                <div
                  key={key}
                  className={`rounded-[10px] px-3 py-3 text-[12.5px] ${
                    key === "alert_card" ? "bg-apricot-wash text-rust" : "bg-fog text-ash"
                  }`}
                  style={{ gridColumn: `span ${span}` }}
                >
                  {meta.label}
                </div>
              );
            })}
            {enabledKeys.length === 0 && (
              <div className="col-span-12 rounded-[10px] bg-fog px-3 py-3 text-[12.5px] text-dove">
                未启用任何卡片
              </div>
            )}
          </div>
          <p className="mt-3 text-[11.5px] leading-[1.65] text-graphite">
            {role === "user"
              ? "业务员默认只有 3 个 widget：快捷入口 + 我负责的项目 + 我的待办。"
              : role === "operator"
                ? "获客总览在本角色落单，自动升为满宽；资金与审计对运营不可见。"
                : "资金概览与获客总览成对；审计概览落单升满宽。"}
          </p>
        </div>

        <div className="rounded-cards bg-white px-5 py-5 shadow-steep-sm">
          <p className="text-[15px] font-medium text-ink">布局来源优先级</p>
          <ul className="mt-3 space-y-2.5">
            {[
              { n: "1", t: "个人覆盖", d: "user_preferences · workbench.layout" },
              { n: "2", t: "角色默认", d: "system_configs · workbench_role_layouts", on: true },
              { n: "3", t: "代码兜底", d: "WORKBENCH_ROLE_DEFAULTS" },
            ].map((step) => (
              <li key={step.n} className="flex items-center gap-2.5">
                <span
                  className={`min-w-[22px] rounded-pill px-2 py-0.5 text-center text-[11.5px] ${
                    step.on ? "bg-ink text-white" : "bg-fog text-graphite"
                  }`}
                >
                  {step.n}
                </span>
                <span className="flex-1">
                  <span className="block text-[13px] font-[450] text-ink">{step.t}</span>
                  <span className="block font-mono text-[11px] text-dove">{step.d}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3.5 border-t border-dove/22 pt-3 text-[12px] leading-[1.7] text-graphite">
            三级都必须过权限过滤；布局中出现无权限或未注册的 widget
            时，后端剔除并记日志，不报错。布局永远不能授予权限。
          </p>
        </div>
      </div>

      {/* 底部操作条 */}
      <div className="lg:col-span-2 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5" role="group" aria-label="预览角色">
          <span className="text-[12.5px] text-graphite">预览角色</span>
          <div className="flex items-center gap-1 rounded-pill bg-white p-1 shadow-steep-sm">
            {ROLES.map((r) => (
              <button
                key={r.code}
                type="button"
                onClick={() => setRole(r.code)}
                aria-pressed={role === r.code}
                className={`rounded-pill px-3 py-1 text-[12.5px] transition-colors ${
                  role === r.code ? "bg-ink text-white" : "text-graphite hover:text-ink"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <span className="flex-1" />
        {error && (
          <span role="alert" className="text-[12.5px] text-rust">
            {error}
          </span>
        )}
        {saved && <span className="text-[12.5px] text-money-negative">已保存</span>}
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-pill bg-ink px-4 py-2 text-[13.5px] font-[450] text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          {isPending ? "保存中…" : "保存为角色默认"}
        </button>
      </div>
    </div>
  );
}
