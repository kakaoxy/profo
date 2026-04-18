"use client";

import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CompetitorItem } from "../../../actions/monitor-lib/types";

interface CompetitorListProps {
  competitors: CompetitorItem[];
  loading: boolean;
  deletingId: number | null;
  onRemove: (id: number) => void;
}

export function CompetitorList({
  competitors,
  loading,
  deletingId,
  onRemove,
}: CompetitorListProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  if (competitors.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-slate-400 bg-slate-50 rounded-lg">
        暂未添加竞品小区
      </div>
    );
  }

  return (
    <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
      {competitors.map((item) => (
        <div
          key={item.community_id}
          className="px-4 py-3 flex items-center justify-between"
        >
          <div>
            <div className="font-medium text-sm text-slate-800">
              {item.community_name}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              在售 {item.on_sale_count} 套 · 均价 ¥
              {item.avg_price?.toLocaleString() || "-"}/㎡
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRemove(item.community_id)}
            disabled={deletingId === item.community_id}
            className="text-rose-500 hover:text-rose-600 hover:bg-rose-50 h-8 w-8 p-0"
          >
            {deletingId === item.community_id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      ))}
    </div>
  );
}
