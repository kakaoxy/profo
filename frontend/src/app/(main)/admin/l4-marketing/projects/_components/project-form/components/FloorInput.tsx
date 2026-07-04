"use client";

import * as React from "react";
import type { FloorInputProps } from "./types";

/**
 * 从楼层字符串解析当前楼层
 * 兼容多种格式：
 * - "5/共12层"（组件生成格式）
 * - "5/28层"（L3 项目数据格式）
 * - "5层"（仅当前楼层）
 */
function parseCurrent(value: string): string {
  return value.match(/^(\d+)(?:\/|层)/)?.[1] || "";
}

/**
 * 从楼层字符串解析总楼层
 * 兼容多种格式：
 * - "5/共12层"（组件生成格式）
 * - "5/28层"（L3 项目数据格式）
 */
function parseTotal(value: string): string {
  return value.match(/\/共?(\d+)层/)?.[1] || "";
}

/**
 * 楼层输入组件
 *
 * 提供当前楼层和总楼层的独立输入
 * 支持从现有楼层字符串解析初始值，兼容多种格式
 *
 * 通过 useEffect 同步外部 value 变化（如从 L3 项目导入时
 * form.setValue 更新了 floor_info），确保组件状态反映最新值。
 *
 * @example
 * ```tsx
 * <FloorInput
 *   value="5/共12层"
 *   onChange={(floor) => logger.devDebug(floor)}
 * />
 * ```
 */
export function FloorInput({ value, onChange }: FloorInputProps) {
  // 从楼层字符串解析初始值
  const [current, setCurrent] = React.useState(() => parseCurrent(value));
  const [total, setTotal] = React.useState(() => parseTotal(value));

  // 同步外部 value 变化（如从项目导入时 form.setValue 更新了 floor_info）
  // 仅在解析结果与当前状态不一致时更新，避免输入时循环
  React.useEffect(() => {
    const parsedCurrent = parseCurrent(value);
    const parsedTotal = parseTotal(value);
    setCurrent((prev) => (prev !== parsedCurrent ? parsedCurrent : prev));
    setTotal((prev) => (prev !== parsedTotal ? parsedTotal : prev));
  }, [value]);

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
      <label className="block text-xs font-bold text-[var(--muted-foreground)] uppercase tracking-wider">
        楼层信息 <span className="text-[var(--error)]">*</span>
      </label>
      <div className="flex items-center gap-2">
        {/* 当前楼层 */}
        <div className="relative flex-1">
          <input
            inputMode="numeric"
            className="w-full h-11 px-3 border border-[var(--border)]/50 rounded-xl bg-card text-sm font-bold text-center outline-none focus:ring-2 focus:ring-primary/20 text-foreground"
            value={current}
            onChange={(e) => handleChange("current", e.target.value)}
            placeholder="当前"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--muted-foreground)]">层</span>
        </div>
        {/* 分隔符 */}
        <span className="text-[var(--muted-foreground)] font-bold">/</span>
        {/* 总楼层 */}
        <div className="relative flex-1">
          <input
            inputMode="numeric"
            className="w-full h-11 px-3 border border-[var(--border)]/50 rounded-xl bg-card text-sm font-bold text-center outline-none focus:ring-2 focus:ring-primary/20 text-foreground"
            value={total}
            onChange={(e) => handleChange("total", e.target.value)}
            placeholder="总"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--muted-foreground)]">层</span>
        </div>
      </div>
    </div>
  );
}
