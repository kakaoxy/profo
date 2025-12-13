"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface InfoItemProps {
  label: string;
  value?: React.ReactNode;
  className?: string;
  copyable?: boolean;
  copyValue?: string;
  highlight?: boolean;
}

/**
 * 信息项组件 - 支持复制功能
 */
export function InfoItem({
  label,
  value,
  className,
  copyable,
  copyValue,
  highlight,
}: InfoItemProps) {
  const [copied, setCopied] = useState(false);

  // 隐藏空值
  if (value === undefined || value === null || value === "") return null;

  const handleCopy = () => {
    if (copyValue) {
      navigator.clipboard.writeText(copyValue);
      setCopied(true);
      toast.success("已复制到剪贴板");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className={cn("group flex items-center justify-between py-0.5 min-h-[24px]", className)}>
      <span className="text-xs text-muted-foreground font-medium shrink-0 mr-4">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <span className={cn("text-sm font-medium text-slate-900", highlight && "font-bold font-mono")}>
          {value}
        </span>
        {copyable && copyValue && (
          <Button
            variant="ghost"
            size="icon"
            className="h-4 w-4 text-muted-foreground hover:text-foreground p-0"
            onClick={handleCopy}
            title="复制"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </Button>
        )}
      </div>
    </div>
  );
}
