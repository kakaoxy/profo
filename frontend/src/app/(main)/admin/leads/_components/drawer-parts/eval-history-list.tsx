"use client";

import React, { useEffect, useState } from "react";
import { History, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EvalHistory } from "../../types";
import { getEvalHistoriesAction } from "../../actions";
import { safeFormatDate } from "@/lib/formatters";

interface EvalHistoryListProps {
  leadId: string;
  initialHistories?: EvalHistory[];
  refreshKey?: number;
}

/** 格式化评估时间为 "yyyy-MM-dd HH:mm"，SSR/CSR 一致 */
function formatEvalDate(dateStr: string): string {
  return safeFormatDate(dateStr, "yyyy-MM-dd HH:mm");
}

export const EvalHistoryList: React.FC<EvalHistoryListProps> = ({
  leadId,
  initialHistories,
  refreshKey,
}) => {
  const [histories, setHistories] = useState<EvalHistory[]>(
    initialHistories ?? []
  );

  useEffect(() => {
    if (!leadId) return;
    getEvalHistoriesAction(leadId).then((result) => {
      if (result.success) setHistories(result.data);
    });
  }, [leadId, refreshKey]);

  // 服务端已按 evaluated_at DESC 返回，前端无需重复排序
  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
      <div className="bg-muted/30 px-4 py-2.5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-3 w-3" />
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            评估历史
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {histories.length} 条记录
        </span>
      </div>
      <div className="p-4 space-y-2">
        {histories.length === 0 ? (
          <div className="text-center py-6 text-xs text-muted-foreground italic">
            暂无评估历史
          </div>
        ) : (
          histories.map((h, idx) => (
            <div
              key={h.id}
              className="flex items-start gap-3 p-3 rounded-xl border border-border hover:border-primary/20 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-bold text-foreground">
                    ¥{h.evalPrice} 万
                  </span>
                  {idx === 0 && (
                    <Badge className="bg-orange-100 text-orange-800 border-orange-200 hover:bg-orange-100">
                      当前
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {h.remark || "未填写调整说明"}
                </div>
                <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-2">
                  <span>
                    <User className="h-2.5 w-2.5 inline" />{" "}
                    {h.evaluatorName || "未知"}
                  </span>
                  <span>·</span>
                  <span>{formatEvalDate(h.evaluatedAt)}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
