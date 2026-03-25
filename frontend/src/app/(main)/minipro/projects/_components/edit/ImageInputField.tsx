"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { getFileUrl } from "@/lib/config";

interface ImageInputFieldProps {
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
}

export function ImageInputField({
  value,
  onChange,
  placeholder = "http(s):// 或 /path",
}: ImageInputFieldProps) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="w-12 h-12 rounded-md bg-slate-100 border border-slate-200 bg-cover bg-center shrink-0"
        style={{
          backgroundImage: value ? `url(${getFileUrl(value)})` : "none",
        }}
      />
      <Input
        placeholder={placeholder}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value ? e.target.value : null)}
        className="border-slate-200 focus-visible:ring-blue-600"
      />
    </div>
  );
}
