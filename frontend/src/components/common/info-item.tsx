"use client";

import { useState, useCallback } from "react";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
interface InfoItemProps {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  copyable?: boolean;
  copyValue?: string;
  variant?: "default" | "muted";
  muted?: boolean;
  className?: string;
  highlight?: boolean;
}

export function InfoItem({
  label,
  value,
  icon,
  copyable,
  copyValue,
  variant: variantProp,
  muted,
  className,
  highlight,
}: InfoItemProps) {
  const variant = muted ? "muted" : variantProp ?? "default";
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    const textToCopy = copyValue ?? (typeof value === "string" ? value : "");
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    toast.success("已复制到剪贴板");
    setTimeout(() => setCopied(false), 2000);
  }, [copyValue, value]);

  if (value === undefined || value === null || value === "") return null;

  const copyButton = copyable ? (
    <Button
      variant="ghost"
      size="icon"
      className="h-4 w-4 text-muted-foreground hover:text-foreground p-0 shrink-0"
      onClick={handleCopy}
      title="复制"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
    </Button>
  ) : null;

  const valueClassName = cn(
    variant === "muted" && "text-muted-foreground",
    highlight && "font-bold font-mono"
  );

  if (icon) {
    return (
      <div className={cn("flex items-start gap-3 p-3 bg-muted rounded-lg", className)}>
        <span className="text-muted-foreground shrink-0 mt-0.5">{icon}</span>
        <div className="flex-1 min-w-0 space-y-1">
          <p className="text-xs text-muted-foreground">{label}</p>
          <div className="flex items-center gap-2">
            <span className={cn("text-sm font-medium text-foreground", valueClassName)}>
              {value}
            </span>
            {copyButton}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center justify-between gap-2 py-0.5 min-h-[24px]", className)}>
      <span className="text-xs text-muted-foreground font-medium shrink-0 mr-4">{label}</span>
      <div className="flex items-center gap-2">
        <span className={cn("text-sm font-medium text-foreground", valueClassName)}>
          {value}
        </span>
        {copyButton}
      </div>
    </div>
  );
}

export type { InfoItemProps };
