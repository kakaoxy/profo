"use client";

import React, { useEffect, useState } from "react";
import { History, UserRound } from "lucide-react";
import { toast } from "sonner";
import { EvalHistory } from "../../types";
import { getEvalHistoriesAction } from "../../actions";
import { safeFormatDate } from "@/lib/formatters";
import { ScoreBadges } from "./verdict-badges";

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
  const [histories, setHistories] = useState<EvalHistory[]>(initialHistories ?? []);

  useEffect(() => {
    if (!leadId) return;
    getEvalHistoriesAction(leadId).then((result) => {
      if (result.success) {
        setHistories(result.data);
      } else {
        toast.error(result.error || "获取评估历史失败");
        setHistories([]);
      }
    });
  }, [leadId, refreshKey]);

  // 服务端已按 evaluated_at DESC 返回，前端无需重复排序
  return (
    <div className="overflow-hidden rounded-[16px] border border-dove/35 bg-pure-white">
      <div className="flex items-center justify-between border-b border-dove/25 px-5 py-3">
        <span className="inline-flex items-center gap-2 text-[12px] font-[500] text-ink">
          <History className="h-3.5 w-3.5 text-graphite" strokeWidth={1.7} />
          评估历史
        </span>
        <span className="text-[10px] tabular-nums text-dove">{histories.length} 条记录</span>
      </div>
      {histories.length === 0 ? (
        <div className="px-5 py-6 text-center text-[11px] italic text-dove">暂无评估历史</div>
      ) : (
        histories.map((h, idx) => (
          <div
            key={h.id}
            className="grid grid-cols-[76px_1fr] gap-4 border-b border-dove/20 px-5 py-4 last:border-b-0"
          >
            <div className="pt-0.5 text-[9.5px] leading-[1.55] text-dove tabular-nums">
              {formatEvalDate(h.evaluatedAt).split(" ").map((part) => (
                <span key={part} className="block">
                  {part}
                </span>
              ))}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[16px] font-[480] tracking-[-0.02em] text-ink tabular-nums">
                  ¥{h.evalPrice.toLocaleString("zh-CN")} 万
                </span>
                <ScoreBadges score={h.conditionScore} days={h.expectedSaleDays} compact />
                {idx === 0 && (
                  <span className="inline-flex h-[20px] items-center rounded-full bg-apricot-wash px-2 text-[9px] font-medium text-rust">
                    当前
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-[10.5px] leading-[1.55] text-graphite">
                {h.remark || "未填写调整说明"}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[9px] text-dove">
                <UserRound className="h-2.5 w-2.5" strokeWidth={1.7} />
                <span>{h.evaluatorName || "未知"}</span>
                {idx === 0 && h.evaluatorPhone ? (
                  <>
                    <span>·</span>
                    <span className="font-mono tracking-tight">{h.evaluatorPhone}</span>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
};
