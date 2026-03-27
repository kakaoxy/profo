"use client";

import * as React from "react";
import type { LayoutInputsProps } from "./types";

/**
 * 户型输入组件
 * 
 * 提供室、厅、卫的独立输入，自动组合成户型字符串
 * 支持从现有户型字符串解析初始值
 * 
 * @example
 * ```tsx
 * <LayoutInputs 
 *   value="3室2厅1卫" 
 *   onChange={(layout) => console.log(layout)} 
 * />
 * ```
 */
export function LayoutInputs({ value, onChange }: LayoutInputsProps) {
  // 从户型字符串解析初始值
  const [room, setRoom] = React.useState(() => value.match(/(\d+)室/)?.[1] || "");
  const [hall, setHall] = React.useState(() => value.match(/(\d+)厅/)?.[1] || "");
  const [toilet, setToilet] = React.useState(() => value.match(/(\d+)卫/)?.[1] || "");

  /**
   * 处理单个输入变化
   * 更新本地状态并组合成完整户型字符串
   */
  const handleChange = (type: "room" | "hall" | "toilet", val: string) => {
    const num = val.replace(/[^\d]/g, "");
    let newRoom = room;
    let newHall = hall;
    let newToilet = toilet;

    if (type === "room") {
      setRoom(num);
      newRoom = num;
    }
    if (type === "hall") {
      setHall(num);
      newHall = num;
    }
    if (type === "toilet") {
      setToilet(num);
      newToilet = num;
    }

    // 组合户型字符串
    if (newRoom) {
      let res = `${newRoom}室`;
      if (newHall) res += `${newHall}厅`;
      if (newToilet) res += `${newToilet}卫`;
      onChange(res);
    } else {
      onChange("");
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-xs font-bold text-[#707785] uppercase tracking-wider">
        房源户型 <span className="text-[#ba1a1a]">*</span>
      </label>
      <div className="flex items-center gap-2">
        {/* 室 */}
        <div className="relative flex-1">
          <input
            inputMode="numeric"
            className="w-full h-11 px-3 border border-[#c0c7d6]/50 rounded-xl bg-white text-sm font-bold text-center outline-none focus:ring-2 focus:ring-[#005daa]/20 text-[#0b1c30]"
            value={room}
            onChange={(e) => handleChange("room", e.target.value)}
            placeholder="n"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#707785]">室</span>
        </div>
        {/* 厅 */}
        <div className="relative flex-1">
          <input
            inputMode="numeric"
            className="w-full h-11 px-3 border border-[#c0c7d6]/50 rounded-xl bg-white text-sm font-bold text-center outline-none focus:ring-2 focus:ring-[#005daa]/20 text-[#0b1c30]"
            value={hall}
            onChange={(e) => handleChange("hall", e.target.value)}
            placeholder="n"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#707785]">厅</span>
        </div>
        {/* 卫 */}
        <div className="relative flex-1">
          <input
            inputMode="numeric"
            className="w-full h-11 px-3 border border-[#c0c7d6]/50 rounded-xl bg-white text-sm font-bold text-center outline-none focus:ring-2 focus:ring-[#005daa]/20 text-[#0b1c30]"
            value={toilet}
            onChange={(e) => handleChange("toilet", e.target.value)}
            placeholder="n"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#707785]">卫</span>
        </div>
      </div>
    </div>
  );
}
