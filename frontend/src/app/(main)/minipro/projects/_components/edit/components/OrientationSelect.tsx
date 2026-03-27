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
 *   onChange={(orientation) => console.log(orientation)}
 * />
 * ```
 */
export function OrientationSelect({ value, onChange }: OrientationSelectProps) {
  return (
    <div className="space-y-2">
      <label className="block text-xs font-bold text-[#707785] uppercase tracking-wider">
        朝向 <span className="text-[#ba1a1a]">*</span>
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
                ? "bg-[#005daa] text-white border-[#005daa]"
                : "bg-white text-[#0b1c30] border-[#c0c7d6]/50 hover:border-[#005daa]/50"
            )}
          >
            {orientation}
          </button>
        ))}
      </div>
    </div>
  );
}
