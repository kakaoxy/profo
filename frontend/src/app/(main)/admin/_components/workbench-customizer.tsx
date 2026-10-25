"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GripVertical, ChevronUp, ChevronDown, RotateCcw, Sliders, X } from "lucide-react";
import type { components } from "@/lib/api-types";
import { getWidget } from "@/lib/workbench-widgets";

type WorkbenchWidgetEntry = components["schemas"]["WorkbenchWidgetEntry"];

interface WorkbenchCustomizerProps {
  /** 后端返回的完整条目（含 enabled=false），source 用于展示「来源 = 个人覆盖」 */
  widgets: WorkbenchWidgetEntry[];
}

/**
 * 工作台定制器（client）：显示/隐藏 + 上移下移 + 重置。
 *
 * 只做这三种操作（Out of Scope：不做拖拽自由布局）。
 * 保存调用 `PUT /api/v1/admin/workbench/config`，重置调用 `DELETE`。
 * user 角色不渲染本组件（后端同时返回 403，D-07）。
 */
export function WorkbenchCustomizer({ widgets }: WorkbenchCustomizerProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<WorkbenchWidgetEntry[]>(widgets);
  // 服务端布局变化（保存/重置触发 RSC 刷新后 props 变新数组）→ 重新同步本地条目。
  // React「渲染期派生 state」范式：不用 effect（避免双渲染），也不 remount。
  const [syncedWidgets, setSyncedWidgets] = useState(widgets);
  if (syncedWidgets !== widgets) {
    setSyncedWidgets(widgets);
    setItems(widgets);
  }
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const move = (index: number, delta: number) => {
    const next = [...items];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next.map((item, i) => ({ ...item, order: (i + 1) * 10 })));
  };

  const toggle = (index: number) => {
    const next = [...items];
    next[index] = { ...next[index], enabled: !next[index].enabled };
    setItems(next);
  };

  const persist = (method: "PUT" | "DELETE") =>
    startTransition(async () => {
      setError(null);
      try {
        const res = await fetch("/api/v1/admin/workbench/config", {
          method,
          headers: {
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
          },
          credentials: "include",
          body: method === "PUT" ? JSON.stringify({ widgets: items }) : undefined,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({ message: "保存失败" }));
          setError(body.message ?? "保存失败");
          return;
        }
        setOpen(false);
        // 保存/重置成功后必须触发 RSC 刷新，否则页面仍渲染旧布局
        router.refresh();
      } catch {
        setError("网络错误，请重试");
      }
    });

  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-inputs bg-white px-3.5 py-2 text-[13.5px] font-[450] text-ink shadow-steep-sm transition-colors hover:bg-fog focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Sliders className="h-3.5 w-3.5" aria-hidden="true" />
        定制
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="定制工作台"
          className="mt-3 w-full max-w-[380px] rounded-cards bg-white p-5 shadow-steep"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-[15px] font-medium text-ink">定制工作台</h3>
              <p className="mt-1 text-[12px] leading-[1.5] text-graphite">
                显示 / 隐藏 + 上下移动。栅格宽度由 widget 注册表决定，不随布局变化。
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="关闭"
              className="rounded-full p-1 text-graphite transition-colors hover:bg-fog"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <ul className="mt-4 max-h-[320px] space-y-1 overflow-y-auto pr-1">
            {items.map((item, index) => {
              const meta = getWidget(item.key);
              if (!meta) return null;
              return (
                <li
                  key={item.key}
                  className={`flex items-center gap-2 rounded-inputs px-2 py-1.5 ${
                    item.enabled ? "" : "opacity-45"
                  }`}
                >
                  <GripVertical className="h-3.5 w-3.5 shrink-0 text-dove" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{meta.label}</span>
                  <span className="shrink-0 text-[11px] text-dove">
                    {meta.span === 12 ? "满宽" : `${meta.span} 栏`}
                  </span>
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
                    disabled={index === items.length - 1}
                    aria-label="下移"
                    className="rounded p-1 text-graphite transition-colors hover:bg-fog disabled:opacity-30"
                  >
                    <ChevronDown className="h-3 w-3" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={item.enabled}
                    aria-label={`显示 ${meta.label}`}
                    onClick={() => toggle(index)}
                    className={`relative h-[18px] w-8 shrink-0 rounded-full transition-colors ${
                      item.enabled ? "bg-ink" : "bg-dove/45"
                    }`}
                  >
                    <span
                      className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white transition-all ${
                        item.enabled ? "left-[16px]" : "left-[2px]"
                      }`}
                    />
                  </button>
                </li>
              );
            })}
          </ul>

          {error && (
            <p role="alert" className="mt-3 text-[12px] text-rust">
              {error}
            </p>
          )}

          <div className="mt-4 flex items-center gap-3 border-t border-dove/25 pt-3">
            <button
              type="button"
              onClick={() => persist("DELETE")}
              disabled={isPending}
              className="inline-flex items-center gap-1 text-[12.5px] text-graphite transition-colors hover:text-ink disabled:opacity-50"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              重置
            </button>
            <span className="flex-1 text-right text-[11.5px] text-dove">来源：个人覆盖</span>
            <button
              type="button"
              onClick={() => persist("PUT")}
              disabled={isPending}
              className="rounded-pill bg-ink px-3.5 py-1.5 text-[12.5px] font-[450] text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {isPending ? "保存中…" : "保存布局"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
