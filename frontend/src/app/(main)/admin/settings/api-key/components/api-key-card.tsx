"use client";

import { KeyRound, Clock, Calendar, Activity, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
        className: "bg-apricot-wash/60 text-rust",
      },
      revoked: {
        label: "已撤销",
        className: "bg-fog text-ash",
      },
      expired: {
        label: "已过期",
        className: "bg-fog text-graphite",
      },
    };

    const config = statusConfig[status] || {
      label: status,
      className: "bg-fog text-graphite",
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
    <div className="rounded-cards bg-white shadow-steep">
      <div className="flex items-center justify-between gap-4 border-b border-fog px-6 py-5">
        <div className="flex items-center gap-2 text-[15px] font-medium text-ink">
          <KeyRound className="h-4 w-4 text-graphite" aria-hidden="true" />
          <span>当前 API Key</span>
        </div>
        {getStatusBadge(apiKeyInfo.status)}
      </div>

      <div className="space-y-4 px-6 py-5">
        {/* Key Display */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-graphite uppercase tracking-wider">
            API Key
          </label>
          <code className="block rounded-inputs bg-fog px-4 py-3 font-mono text-sm text-graphite">
            {maskedKey}
          </code>
          <p className="text-xs text-graphite">出于安全考虑，完整的 Key 不会再次显示</p>
        </div>

        {/* Key Info Grid */}
        <div className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="flex items-center gap-1 text-xs font-medium text-graphite uppercase tracking-wider">
              <Calendar className="h-3 w-3" aria-hidden="true" />
              创建时间
            </label>
            <p className="text-sm text-ink">{formatDate(apiKeyInfo.created_at)}</p>
          </div>
          <div className="space-y-1">
            <label className="flex items-center gap-1 text-xs font-medium text-graphite uppercase tracking-wider">
              <Activity className="h-3 w-3" aria-hidden="true" />
              最后使用
            </label>
            <p className="text-sm text-ink">{formatDate(apiKeyInfo.last_used_at)}</p>
          </div>
          <div className="space-y-1">
            <label className="flex items-center gap-1 text-xs font-medium text-graphite uppercase tracking-wider">
              <Clock className="h-3 w-3" aria-hidden="true" />
              过期时间
            </label>
            <p className="text-sm text-ink">
              {apiKeyInfo.expires_at ? formatDate(apiKeyInfo.expires_at) : "永不过期"}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end border-t border-fog pt-4">
          <Button
            onClick={onDelete}
            variant="outline"
            className="gap-2 border-error/30 text-error hover:bg-error-container hover:text-error"
          >
            <Trash2 className="h-4 w-4" />
            撤销 Key
          </Button>
        </div>
      </div>
    </div>
  );
}
