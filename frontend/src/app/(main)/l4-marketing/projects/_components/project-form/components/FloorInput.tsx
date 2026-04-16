"use client";

import * as React from "react";
import type { FloorInputProps } from "./types";

/**
 * 楼层输入组件
 * 
 * 提供当前楼层和总楼层的独立输入
 * 支持从现有楼层字符串解析初始值，格式如："5/共12层"
 * 
 * @example
 * ```tsx
 * <FloorInput 
 *   value="5/共12层" 
 *   onChange={(floor) => console.log(floor)} 
 * />
 * ```
 */
export function FloorInput({ value, onChange }: FloorInputProps) {
  // 从楼层字符串解析初始值
  const [current, setCurrent] = React.useState(() => value.match(/^(\d+)\//)?.[1] || "");
  const [total, setTotal] = React.useState(() => value.match(/共(\d+)层/)?.[1] || "");

  /**
   * 处理单个输入变化
   * 更新本地状态并组合成完整楼层字符串
   */
  const handleChange = (type: "current" | "total", val: string) => {
    const num = val.replace(/[^\d]/g, "");
    let newCurrent = current;
    let newTotal = total;

    if (type === "current") {
      setCurrent(num);
      newCurrent = num;
    }
    if (type === "total") {
      setTotal(num);
      newTotal = num;
    }

    // 组合楼层字符串
    if (newCurrent && newTotal) {
      onChange(`${newCurrent}/共${newTotal}层`);
    } else if (newCurrent) {
      onChange(`${newCurrent}层`);
    } else {
      onChange("");
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-xs font-bold text-[#707785] uppercase tracking-wider">
        楼层信息 <span className="text-[#ba1a1a]">*</span>
      </label>
      <div className="flex items-center gap-2">
        {/* 当前楼层 */}
        <div className="relative flex-1">
          <input
            inputMode="numeric"
            className="w-full h-11 px-3 border border-[#c0c7d6]/50 rounded-xl bg-white text-sm font-bold text-center outline-none focus:ring-2 focus:ring-[#005daa]/20 text-[#0b1c30]"
            value={current}
            onChange={(e) => handleChange("current", e.target.value)}
            placeholder="当前"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#707785]">层</span>
        </div>
        {/* 分隔符 */}
        <span className="text-[#707785] font-bold">/</span>
        {/* 总楼层 */}
        <div className="relative flex-1">
          <input
            inputMode="numeric"
            className="w-full h-11 px-3 border border-[#c0c7d6]/50 rounded-xl bg-white text-sm font-bold text-center outline-none focus:ring-2 focus:ring-[#005daa]/20 text-[#0b1c30]"
            value={total}
            onChange={(e) => handleChange("total", e.target.value)}
            placeholder="总"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#707785]">层</span>
        </div>
      </div>
    </div>
  );
}
