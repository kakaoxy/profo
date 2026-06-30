"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { OrientationSelectProps } from "./types";

/** 朝向选项列表 */
const ORIENTATIONS = ["南", "北", "东", "西", "南北", "东西", "东南", "西南", "东北", "西北"] as const;

/**
 * 朝向选择组件
 *
 * 提供10种标准朝向的网格选择
 * 使用按钮网格布局，支持视觉反馈
 *
 * @example
 * ```tsx
 * <OrientationSelect
 *   value="南北"
 *   onChange={(orientation) => logger.devDebug(orientation)}
 * />
 * ```
 */
export function OrientationSelect({ value, onChange }: OrientationSelectProps) {
  return (
    <div className="space-y-2">
      <label className="block text-xs font-bold text-[var(--muted-foreground)] uppercase tracking-wider">
        朝向 <span className="text-[var(--error)]">*</span>
      </label>
      <div className="grid grid-cols-5 gap-2">
        {ORIENTATIONS.map((orientation) => (
          <button
            key={orientation}
            type="button"
            onClick={() => onChange(orientation)}
            className={cn(
              "h-10 rounded-lg text-sm font-bold transition-all border",
              value === orientation
                ? "bg-primary text-white border-primary"
                : "bg-card text-foreground border-[var(--border)]/50 hover:border-primary/50"
            )}
          >
            {orientation}
          </button>
        ))}
      </div>
    </div>
  );
}
