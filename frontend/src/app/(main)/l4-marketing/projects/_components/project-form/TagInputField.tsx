"use client";

import * as React from "react";

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
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)]/30 bg-card p-3">
      {value.map((tag) => (
        <span
          key={tag}
          className="bg-[var(--success)] text-[var(--success)] text-[10px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5"
        >
          {tag}
          <button
            type="button"
            className="inline-flex size-4 items-center justify-center rounded-full hover:bg-[var(--success)]/20 transition-colors"
            onClick={() => handleRemoveTag(tag)}
            aria-label={`移除标签 ${tag}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </span>
      ))}
      <input
        className="h-8 flex-1 min-w-[140px] bg-transparent px-1 text-sm outline-none placeholder:text-[var(--muted-foreground)]/60 text-[var(--foreground)]"
        placeholder={value.length === 0 ? placeholder : ""}
        value={tagInput}
        onChange={(e) => setTagInput(e.target.value)}
        onKeyDown={handleAddTag}
      />
      {value.length === 0 ? (
        <span className="text-[10px] text-[var(--muted-foreground)]/60 bg-[var(--primary)] px-2 py-1 rounded border border-dashed border-[var(--border)]/50 cursor-pointer hover:bg-[var(--primary)] transition-colors">
          + 添加标签
        </span>
      ) : null}
    </div>
  );
}
