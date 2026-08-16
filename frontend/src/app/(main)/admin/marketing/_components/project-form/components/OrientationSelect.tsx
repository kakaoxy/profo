"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { OrientationSelectProps } from "./types";

/** 朝向基础选项列表（与 admin/projects 新建项目弹窗保持一致） */
const BASE_ORIENTATIONS = ["南北", "南", "东", "西", "北"] as const;

/**
 * 朝向选择组件
 *
 * 提供5种标准朝向的网格选择（与项目弹窗一致）；
 * 编辑存量数据时若朝向不在基础选项中则追加显示，避免旧值丢失选中态
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
  const orientations =
    value && !BASE_ORIENTATIONS.includes(value as (typeof BASE_ORIENTATIONS)[number])
      ? [...BASE_ORIENTATIONS, value]
      : [...BASE_ORIENTATIONS];
  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-graphite uppercase tracking-wider">
        朝向 <span className="text-error">*</span>
      </label>
      <div className="grid grid-cols-5 gap-2">
        {orientations.map((orientation) => (
          <button
            key={orientation}
            type="button"
            onClick={() => onChange(orientation)}
            className={cn(
              "h-10 rounded-lg text-sm font-medium transition-all border",
              value === orientation
                ? "bg-ink text-white border-ink"
                : "bg-white text-ink border-dove/40 hover:border-rust/60",
            )}
          >
            {orientation}
          </button>
        ))}
      </div>
    </div>
  );
}
