"use client";

import { useState } from "react";
import { Copy, Check, Eye, EyeOff, Clock, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      console.error("Failed to copy:", err);
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
    <Card className="border-slate-200 dark:border-slate-800">
      <CardHeader className="pb-4">
        <CardTitle className="text-base font-semibold flex items-center justify-between">
          <span>您的 API Key</span>
          <span className="text-xs font-normal px-2 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300">
            新生成
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Key Display */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            API Key
          </label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                readOnly
                className="w-full px-4 py-3 pr-24 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:focus:ring-slate-700"
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="absolute right-12 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                title={showKey ? "隐藏" : "显示"}
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              <button
                onClick={handleCopy}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                title="复制"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Key Info */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              前缀
            </label>
            <p className="text-sm font-mono text-slate-900 dark:text-slate-100">{prefix}</p>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              创建时间
            </label>
            <p className="text-sm text-slate-700 dark:text-slate-300">{formatDate(createdAt)}</p>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Clock className="h-3 w-3" />
              过期时间
            </label>
            <p className="text-sm text-slate-700 dark:text-slate-300">
              {expiresAt ? formatDate(expiresAt) : "永不过期"}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-800">
          <Button onClick={handleCopy} variant="outline" className="gap-2 mr-2">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "已复制" : "复制 Key"}
          </Button>
          <Button onClick={onDismiss} variant="default">
            我已保存，关闭提示
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
