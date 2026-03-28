"use client";

import * as React from "react";
import type { TotalPriceInputProps, UnitPriceDisplayProps } from "./types";

/**
 * 总价输入组件
 *
 * 提供房源总价的输入功能，单位为万元
 * 自动过滤非数字和小数点字符，限制最多两位小数
 * 使用内部状态管理输入字符串，避免数字转换导致的小数点丢失
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
  // 内部状态保存输入字符串，允许临时输入 "56." 这样的值
  const [inputValue, setInputValue] = React.useState<string>(value || "");

  // 当外部 value 变化时，同步内部状态
  React.useEffect(() => {
    const stringValue = value || "";
    // 只有当外部值与内部解析值不同时才更新，避免覆盖用户正在输入的内容
    const parsedInput = parseFloat(inputValue);
    const parsedExternal = parseFloat(stringValue);
    if (inputValue === "" || parsedExternal !== parsedInput) {
      setInputValue(stringValue);
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;

    // 允许空值
    if (rawVal === "") {
      setInputValue("");
      onChange("");
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

    // 回调字符串值
    onChange(formattedVal);
  };

  const handleBlur = () => {
    // 失去焦点时，规范化显示值
    if (inputValue === "" || inputValue === ".") {
      setInputValue("");
      onChange("");
    } else {
      // 去除末尾的小数点，如 "56." 变为 "56"
      const normalized = inputValue.replace(/\.$/, "");
      if (normalized !== inputValue) {
        setInputValue(normalized);
        onChange(normalized);
      }
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-xs font-bold text-[#707785] uppercase tracking-wider">
        总价 (万元) <span className="text-[#ba1a1a]">*</span>
      </label>
      <div className="relative">
        <input
          inputMode="decimal"
          className="w-full h-14 px-4 border border-[#c0c7d6]/50 rounded-xl bg-white text-2xl font-black outline-none focus:ring-2 focus:ring-[#005daa]/20 text-[#005daa]"
          value={inputValue}
          onChange={handleChange}
          onBlur={handleBlur}
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
