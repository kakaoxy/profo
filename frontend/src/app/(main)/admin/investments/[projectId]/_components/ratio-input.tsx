"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

/** 比例内联输入（保留中间输入态，避免小数点被吞） */
export function RatioInput({
  value,
  onChange,
  className,
}: {
  value: number;
  onChange: (n: number) => void;
  className?: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    setText(String(value));
  }, [value]);
  return (
    <Input
      type="number"
      step="0.01"
      min="0"
      max="100"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(parseFloat(e.target.value) || 0);
      }}
      className={className}
    />
  );
}
