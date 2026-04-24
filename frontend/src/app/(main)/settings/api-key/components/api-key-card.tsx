"use client";

import { KeyRound, Clock, Calendar, Activity, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiKeyInfoResponse } from "../actions";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

interface ApiKeyCardProps {
  apiKeyInfo: ApiKeyInfoResponse;
  onDelete: () => void;
}

export function ApiKeyCard({ apiKeyInfo, onDelete }: ApiKeyCardProps) {
  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "-";
    try {
      return format(new Date(dateStr), "yyyy年MM月dd日 HH:mm", { locale: zhCN });
    } catch {
      return dateStr;
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; className: string }> = {
      active: {
        label: "正常",
        className: "bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300",
      },
      revoked: {
        label: "已撤销",
        className: "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300",
      },
      expired: {
        label: "已过期",
        className: "bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300",
      },
    };

    const config = statusConfig[status] || {
      label: status,
      className: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300",
    };

    return (
      <span className={`text-xs font-medium px-2 py-1 rounded-full ${config.className}`}>
        {config.label}
      </span>
    );
  };

  // 隐藏完整的 key，只显示前缀
  const maskedKey = `${apiKeyInfo.prefix}••••••••••••••••••••••••`;

  return (
    <Card className="border-slate-200 dark:border-slate-800">
      <CardHeader className="pb-4">
        <CardTitle className="text-base font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-slate-500" />
            <span>当前 API Key</span>
          </div>
          {getStatusBadge(apiKeyInfo.status)}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Key Display */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            API Key
          </label>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono text-sm text-slate-500 dark:text-slate-400">
              {maskedKey}
            </code>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            出于安全考虑，完整的 Key 不会再次显示
          </p>
        </div>

        {/* Key Info Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              创建时间
            </label>
            <p className="text-sm text-slate-700 dark:text-slate-300">
              {formatDate(apiKeyInfo.created_at)}
            </p>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Activity className="h-3 w-3" />
              最后使用
            </label>
            <p className="text-sm text-slate-700 dark:text-slate-300">
              {formatDate(apiKeyInfo.last_used_at)}
            </p>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Clock className="h-3 w-3" />
              过期时间
            </label>
            <p className="text-sm text-slate-700 dark:text-slate-300">
              {apiKeyInfo.expires_at ? formatDate(apiKeyInfo.expires_at) : "永不过期"}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-800">
          <Button
            onClick={onDelete}
            variant="outline"
            className="gap-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-700 dark:hover:text-red-300 border-red-200 dark:border-red-800"
          >
            <Trash2 className="h-4 w-4" />
            撤销 Key
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
