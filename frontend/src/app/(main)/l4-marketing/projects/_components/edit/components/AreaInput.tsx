"use client";

import * as React from "react";
import type { AreaInputProps } from "./types";

/**
 * 面积输入组件
 *
 * 提供房源面积的输入功能，单位为㎡
 * 自动过滤非数字和小数点字符，限制最多两位小数
 * 使用内部状态管理输入字符串，避免数字转换导致的小数点丢失
 *
 * @example
 * ```tsx
 * <AreaInput
 *   value={120.5}
 *   onChange={(val) => console.log(val)}
 * />
 * ```
 */
export function AreaInput({ value, onChange }: AreaInputProps) {
  // 内部状态保存输入字符串，允许临时输入 "56." 这样的值
  const [inputValue, setInputValue] = React.useState<string>("");

  // 当外部 value 变化时，同步内部状态
  React.useEffect(() => {
    if (value !== undefined && value !== null) {
      // 只有当外部值与内部解析值不同时才更新，避免覆盖用户正在输入的内容
      const parsedInput = parseFloat(inputValue);
      if (inputValue === "" || value !== parsedInput) {
        setInputValue(String(value));
      }
    } else if (value === undefined || value === null) {
      setInputValue("");
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;

    // 允许空值
    if (rawVal === "") {
      setInputValue("");
      onChange(0);
      return;
    }

    // 过滤非数字和小数点字符
    let val = rawVal.replace(/[^\d.]/g, "");

    // 防止多个小数点
    const parts = val.split(".");
    if (parts.length > 2) {
      val = parts[0] + "." + parts.slice(1).join("");
    }

    // 限制最多两位小数
    const formattedParts = val.split(".");
    const formattedVal = formattedParts.length > 1
      ? `${formattedParts[0]}.${formattedParts[1].slice(0, 2)}`
      : val;

    // 更新内部状态（字符串）
    setInputValue(formattedVal);

    // 转换为数字并回调（"56." 会解析为 56，这是预期的）
    const numVal = formattedVal === "" ? 0 : parseFloat(formattedVal);
    onChange(numVal);
  };

  const handleBlur = () => {
    // 失去焦点时，规范化显示值
    if (inputValue === "" || inputValue === ".") {
      setInputValue("");
      onChange(0);
    } else {
      // 去除末尾的小数点，如 "56." 变为 "56"
      const normalized = inputValue.replace(/\.$/, "");
      if (normalized !== inputValue) {
        setInputValue(normalized);
      }
    }
  };

  return (
    <div className="relative">
      <input
        inputMode="decimal"
        className="w-full h-11 px-4 border border-[#c0c7d6]/50 rounded-xl bg-white text-sm font-bold outline-none focus:ring-2 focus:ring-[#005daa]/20 text-[#0b1c30]"
        value={inputValue}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder="例如：120.5"
      />
      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-[#707785]">㎡</span>
    </div>
  );
}
