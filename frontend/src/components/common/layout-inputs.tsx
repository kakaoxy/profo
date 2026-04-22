"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * 户型输入组件Props
 */
export interface LayoutInputsProps {
  /** 当前户型值，格式如："3室2厅1卫" */
  value: string;
  /** 变更回调 */
  onChange: (value: string) => void;
  /** 标签文本 */
  label?: string;
  /** 是否显示必填标记 */
  showRequired?: boolean;
  /** 自定义类名 */
  className?: string;
  /** 样式变体 */
  variant?: "default" | "marketing";
}

/**
 * 户型输入组件
 *
 * 提供室、厅、卫的独立输入，自动组合成户型字符串
 * 支持从现有户型字符串解析初始值
 *
 * @example
 * ```tsx
 * // 基础用法
 * <LayoutInputs
 *   value="3室2厅1卫"
 *   onChange={(layout) => console.log(layout)}
 * />
 *
 * // 营销版样式
 * <LayoutInputs
 *   value="3室2厅1卫"
 *   variant="marketing"
 *   showRequired
 *   onChange={(layout) => console.log(layout)}
 * />
 * ```
 */
export function LayoutInputs({
  value,
  onChange,
  label = "房源户型",
  showRequired = false,
  className,
  variant = "default",
}: LayoutInputsProps) {
  // 从户型字符串解析值的辅助函数
  const parseLayoutValue = (layoutValue: string) => ({
    room: layoutValue.match(/(\d+)室/)?.[1] || "",
    hall: layoutValue.match(/(\d+)厅/)?.[1] || "",
    toilet: layoutValue.match(/(\d+)卫/)?.[1] || "",
  });

  // 从户型字符串解析初始值
  const [room, setRoom] = React.useState(() => parseLayoutValue(value).room);
  const [hall, setHall] = React.useState(() => parseLayoutValue(value).hall);
  const [toilet, setToilet] = React.useState(() => parseLayoutValue(value).toilet);

  // 当外部 value 变化时，同步更新内部状态
  React.useEffect(() => {
    const parsed = parseLayoutValue(value);
    setRoom(parsed.room);
    setHall(parsed.hall);
    setToilet(parsed.toilet);
  }, [value]);

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

  // 样式配置
  const styles = {
    default: {
      container: "space-y-1.5",
      label: "text-[10px] font-bold text-slate-500 ml-1",
      required: "text-red-500",
      inputWrapper: "relative flex-1",
      input:
        "w-full h-11 px-3 border rounded-lg bg-background text-sm font-bold text-center outline-none focus:ring-2 focus:ring-primary/20",
      suffix:
        "absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400",
    },
    marketing: {
      container: "space-y-2",
      label: "block text-xs font-bold text-[#707785] uppercase tracking-wider",
      required: "text-[#ba1a1a]",
      inputWrapper: "relative flex-1",
      input:
        "w-full h-11 px-3 border border-[#c0c7d6]/50 rounded-xl bg-white text-sm font-bold text-center outline-none focus:ring-2 focus:ring-[#005daa]/20 text-[#0b1c30]",
      suffix:
        "absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#707785]",
    },
  };

  const s = styles[variant];

  return (
    <div className={cn(s.container, className)}>
      <label className={s.label}>
        {label}{" "}
        {showRequired && <span className={s.required}>*</span>}
      </label>
      <div className="flex items-center gap-2">
        {/* 室 */}
        <div className={s.inputWrapper}>
          <input
            inputMode="numeric"
            className={s.input}
            value={room}
            onChange={(e) => handleChange("room", e.target.value)}
            placeholder="n"
          />
          <span className={s.suffix}>室</span>
        </div>
        {/* 厅 */}
        <div className={s.inputWrapper}>
          <input
            inputMode="numeric"
            className={s.input}
            value={hall}
            onChange={(e) => handleChange("hall", e.target.value)}
            placeholder="n"
          />
          <span className={s.suffix}>厅</span>
        </div>
        {/* 卫 */}
        <div className={s.inputWrapper}>
          <input
            inputMode="numeric"
            className={s.input}
            value={toilet}
            onChange={(e) => handleChange("toilet", e.target.value)}
            placeholder="n"
          />
          <span className={s.suffix}>卫</span>
        </div>
      </div>
    </div>
  );
}
