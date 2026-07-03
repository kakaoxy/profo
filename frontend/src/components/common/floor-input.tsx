"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

export interface FloorInputProps {
  /** 楼层信息字符串，格式："X/Y层" 或 "X层" 或 "" */
  value: string;
  /** 值变化回调，回传拼好的 floorInfo 字符串 */
  onChange: (floorInfo: string) => void;
  className?: string;
}

/**
 * 解析 floorInfo 字符串为 { current, total }
 * - "5/28层" → { current: "5", total: "28" }
 * - "5层"    → { current: "5", total: "" }
 * - 其他     → { current: "", total: "" }
 */
function parseFloorInfo(value: string): { current: string; total: string } {
  if (!value) return { current: "", total: "" };
  const full = value.match(/(\d+)\s*\/\s*(\d+)\s*层/);
  if (full) return { current: full[1], total: full[2] };
  const simple = value.match(/(\d+)\s*层/);
  if (simple) return { current: simple[1], total: "" };
  return { current: "", total: "" };
}

/**
 * 拼接 current/total 为 floorInfo 字符串
 * - 两者都有值 → "X/Y层"
 * - 仅 current → "X层"
 * - 都为空    → ""
 */
function formatFloorInfo(current: string, total: string): string {
  const c = current.trim();
  const t = total.trim();
  if (c && t) return `${c}/${t}层`;
  if (c) return `${c}层`;
  return "";
}

/**
 * 楼层输入组件（共享）
 * - 同时兼容 react-hook-form（外层用 Controller 包装）和原生 useState 受控
 * - 输入框风格与项目表单/线索表单的 Input 一致
 */
export function FloorInput({ value, onChange, className }: FloorInputProps) {
  const parsed = parseFloorInfo(value ?? "");
  const [current, setCurrent] = useState(parsed.current);
  const [total, setTotal] = useState(parsed.total);

  // 外部 value 变化时（如表单 reset / 编辑回填）同步内部状态
  useEffect(() => {
    const p = parseFloorInfo(value ?? "");
    setCurrent(p.current);
    setTotal(p.total);
  }, [value]);

  const emitChange = (nextCurrent: string, nextTotal: string) => {
    setCurrent(nextCurrent);
    setTotal(nextTotal);
    onChange(formatFloorInfo(nextCurrent, nextTotal));
  };

  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <div className="relative flex-1">
        <Input
          type="number"
          min={0}
          placeholder="1"
          value={current}
          onChange={(e) => emitChange(e.target.value, total)}
          className="text-center pr-8"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground bg-background pointer-events-none">
          层
        </span>
      </div>
      <span className="text-muted-foreground/50">/</span>
      <div className="relative flex-1">
        <Input
          type="number"
          min={0}
          placeholder="6"
          value={total}
          onChange={(e) => emitChange(current, e.target.value)}
          className="text-center pr-8"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground bg-background pointer-events-none">
          总
        </span>
      </div>
    </div>
  );
}
