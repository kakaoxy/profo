"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";

interface TagInputFieldProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
}

export function TagInputField({
  value,
  onChange,
  placeholder = "添加标签，回车确认",
}: TagInputFieldProps) {
  const [tagInput, setTagInput] = React.useState("");

  const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" && e.key !== ",") return;
    e.preventDefault();
    const val = tagInput.trim().replace(/,$/, "");
    if (!val) return;
    if (!value.includes(val)) {
      onChange([...value, val]);
    }
    setTagInput("");
  };

  const handleRemoveTag = (tag: string) => {
    onChange(value.filter((t) => t !== tag));
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50/50 p-2">
      {value.map((tag) => (
        <Badge
          key={tag}
          variant="secondary"
          className="pr-1.5 bg-slate-100 text-slate-700"
        >
          {tag}
          <button
            type="button"
            className="ml-1 inline-flex size-4 items-center justify-center rounded-sm hover:bg-slate-200"
            onClick={() => handleRemoveTag(tag)}
            aria-label={`移除标签 ${tag}`}
          >
            ×
          </button>
        </Badge>
      ))}
      <input
        className="h-7 flex-1 min-w-[140px] bg-transparent px-1 text-sm outline-none placeholder:text-slate-400"
        placeholder={placeholder}
        value={tagInput}
        onChange={(e) => setTagInput(e.target.value)}
        onKeyDown={handleAddTag}
      />
    </div>
  );
}
