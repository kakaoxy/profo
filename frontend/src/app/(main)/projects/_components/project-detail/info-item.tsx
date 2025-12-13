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
  if (!value && value !== 0) return null;

  const handleCopy = () => {
    if (copyValue) {
      navigator.clipboard.writeText(copyValue);
      setCopied(true);
      toast.success("已复制到剪贴板");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className={cn("flex items-start gap-2", className)}>
      <span className="text-muted-foreground text-sm whitespace-nowrap">
        {label}：
      </span>
      <span className={cn("text-sm flex-1", highlight && "font-bold font-mono")}>
        {value}
      </span>
      {copyable && copyValue && (
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 text-muted-foreground hover:text-foreground"
          onClick={handleCopy}
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </Button>
      )}
    </div>
  );
}
