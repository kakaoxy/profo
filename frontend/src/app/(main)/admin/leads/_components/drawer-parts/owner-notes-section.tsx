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

export const OwnerNotesSection: React.FC<OwnerNotesSectionProps> = ({ lead }) => {
  const remarks = lead.remarks ?? "";
  const hasNotes = remarks.trim().length > 0;
  const hasExpected = lead.expectedPrice != null;

  return (
    <section className="bg-pure-white rounded-cards shadow-steep-sm overflow-hidden">
      {/* 头部 */}
      <div className="bg-fog px-4 py-2.5 border-b border-dove flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <Quote className="h-3 w-3 text-graphite shrink-0" />
          <span className="text-xs font-medium text-graphite">业主补充信息</span>
          <span className="text-dove">·</span>
          <span className="text-xs text-graphite truncate">C 端提交评估时填写</span>
        </div>
        <span className="text-xs text-graphite font-medium shrink-0 ml-2">{remarks.length} 字</span>
      </div>

      {/* 主体 */}
      <div className="p-4">
        {hasNotes ? (
          <div className="space-y-3">
            {hasExpected && (
              <div className="bg-apricot-wash px-3 py-2 rounded-[12px] text-sm font-medium text-rust">
                心理预期价：¥{lead.expectedPrice} 万
              </div>
            )}
            <div className="bg-fog border-l-2 border-l-dove rounded-[12px] pl-3 pr-3 py-2.5">
              <p className="text-sm text-ink italic leading-relaxed">{remarks}</p>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-xs text-graphite font-medium">
                <User className="h-3 w-3" />
                业主提交 · {formatCreatedAt(lead.createdAt)}
              </span>
              <span className="text-xs text-graphite">来自 C 端估价表单</span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-graphite italic">业主未在 C 端提交补充信息</p>
        )}
      </div>
    </section>
  );
};
