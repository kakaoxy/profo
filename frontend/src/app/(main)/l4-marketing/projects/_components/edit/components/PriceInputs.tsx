"use client";

import * as React from "react";
import type { TotalPriceInputProps, UnitPriceDisplayProps } from "./types";

/**
 * 总价输入组件
 *
 * 提供房源总价的输入功能，单位为万元
 * 自动过滤非数字和小数点字符
 *
 * @example
 * ```tsx
 * <TotalPriceInput
 *   value="213"
 *   onChange={(val) => console.log(val)}
 * />
 * ```
 */
export function TotalPriceInput({ value, onChange }: TotalPriceInputProps) {
  return (
    <div className="space-y-2">
      <label className="block text-xs font-bold text-[#707785] uppercase tracking-wider">
        总价 (万元) <span className="text-[#ba1a1a]">*</span>
      </label>
      <div className="relative">
        <input
          inputMode="decimal"
          className="w-full h-14 px-4 border border-[#c0c7d6]/50 rounded-xl bg-white text-2xl font-black outline-none focus:ring-2 focus:ring-[#005daa]/20 text-[#005daa]"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
          placeholder="0"
        />
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-[#707785]">万</span>
      </div>
    </div>
  );
}

/**
 * 单价显示组件
 *
 * 自动计算并显示房源单价，单位为 万元/㎡
 * 只读显示，自动根据总价和面积计算
 *
 * @example
 * ```tsx
 * <UnitPriceDisplay value="3.84" />
 * ```
 */
export function UnitPriceDisplay({ value }: UnitPriceDisplayProps) {
  return (
    <div className="space-y-2">
      <label className="block text-xs font-bold text-[#707785] uppercase tracking-wider">
        单价 (万元/㎡)
      </label>
      <div className="relative">
        <input
          inputMode="decimal"
          className="w-full h-14 px-4 border border-[#c0c7d6]/50 rounded-xl bg-[#f8f9ff] text-xl font-bold outline-none text-[#0b1c30]"
          value={value}
          readOnly
          placeholder="自动计算"
        />
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-[#7d5400] bg-[#ffddb0]/30 px-2 py-0.5 rounded">
          自动
        </span>
      </div>
    </div>
  );
}
