"use client";

import { logger } from "@/lib/logger";
import { useState } from "react";
import { Copy, Check, Eye, EyeOff, Clock, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

interface ApiKeyDisplayProps {
  apiKey: string;
  prefix: string;
  createdAt: string;
  expiresAt?: string | null;
  onDismiss: () => void;
}

export function ApiKeyDisplay({
  apiKey,
  prefix,
  createdAt,
  expiresAt,
  onDismiss,
}: ApiKeyDisplayProps) {
  const [copied, setCopied] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      logger.error("Failed to copy:", err);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "yyyy年MM月dd日 HH:mm", { locale: zhCN });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="rounded-cards bg-white shadow-steep">
      <div className="flex items-center justify-between gap-4 border-b border-fog px-6 py-5">
        <span className="text-[15px] font-medium text-ink">您的 API Key</span>
        <span className="rounded-full bg-apricot-wash/60 px-2 py-1 text-xs font-medium text-rust">
          新生成
        </span>
      </div>

      <div className="space-y-4 px-6 py-5">
        {/* Key Display */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-graphite uppercase tracking-wider">
            API Key
          </label>
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              readOnly
              className="w-full rounded-inputs border border-dove/40 bg-fog px-4 py-3 pr-24 font-mono text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/30"
            />
            <button
              onClick={() => setShowKey(!showKey)}
              className="absolute right-12 top-1/2 -translate-y-1/2 p-1.5 text-graphite transition-colors hover:text-ink"
              title={showKey ? "隐藏" : "显示"}
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
            <button
              onClick={handleCopy}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-graphite transition-colors hover:text-ink"
              title="复制"
            >
              {copied ? <Check className="h-4 w-4 text-rust" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Key Info */}
        <div className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-graphite uppercase tracking-wider">
              前缀
            </label>
            <p className="font-mono text-sm text-ink">{prefix}</p>
          </div>
          <div className="space-y-1">
            <label className="flex items-center gap-1 text-xs font-medium text-graphite uppercase tracking-wider">
              <Calendar className="h-3 w-3" aria-hidden="true" />
              创建时间
            </label>
            <p className="text-sm text-ink">{formatDate(createdAt)}</p>
          </div>
          <div className="space-y-1">
            <label className="flex items-center gap-1 text-xs font-medium text-graphite uppercase tracking-wider">
              <Clock className="h-3 w-3" aria-hidden="true" />
              过期时间
            </label>
            <p className="text-sm text-ink">{expiresAt ? formatDate(expiresAt) : "永不过期"}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 border-t border-fog pt-4">
          <Button onClick={handleCopy} variant="outline" className="gap-2">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "已复制" : "复制 Key"}
          </Button>
          <Button onClick={onDismiss} variant="default">
            我已保存，关闭提示
          </Button>
        </div>
      </div>
    </div>
  );
}
