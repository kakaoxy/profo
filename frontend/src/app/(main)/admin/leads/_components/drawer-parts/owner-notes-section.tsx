import React from "react";
import { Quote, User } from "lucide-react";
import { Lead } from "../../types";
import { safeFormatDate } from "@/lib/formatters";

interface OwnerNotesSectionProps {
  lead: Lead;
}

const formatCreatedAt = (raw: string): string => {
  return safeFormatDate(raw, "yyyy-MM-dd HH:mm", "—");
};

export const OwnerNotesSection: React.FC<OwnerNotesSectionProps> = ({
  lead,
}) => {
  const remarks = lead.remarks ?? "";
  const hasNotes = remarks.trim().length > 0;
  const hasExpected = lead.expectedPrice != null;

  return (
    <section className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
      {/* 头部 */}
      <div className="bg-muted/30 px-4 py-2.5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <Quote className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            业主补充信息
          </span>
          <span className="text-muted-foreground/40">·</span>
          <span className="text-[10px] text-muted-foreground truncate">
            C 端提交评估时填写
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground font-bold shrink-0 ml-2">
          {remarks.length} 字
        </span>
      </div>

      {/* 主体 */}
      <div className="p-4">
        {hasNotes ? (
          <div className="space-y-3">
            {hasExpected && (
              <div className="bg-orange-50 border border-orange-200 px-3 py-2 rounded-lg text-sm font-bold text-orange-800">
                心理预期价：¥{lead.expectedPrice} 万
              </div>
            )}
            <div className="border-l-2 border-orange-200 pl-3">
              <p className="text-sm text-foreground italic leading-relaxed">
                {remarks}
              </p>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-bold">
                <User className="h-3 w-3" />
                业主提交 · {formatCreatedAt(lead.createdAt)}
              </span>
              <span className="text-[10px] text-muted-foreground">
                来自 C 端估价表单
              </span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">
            业主未在 C 端提交补充信息
          </p>
        )}
      </div>
    </section>
  );
};
