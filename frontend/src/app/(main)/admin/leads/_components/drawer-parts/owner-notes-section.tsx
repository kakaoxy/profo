import React from "react";
import { Quote, UserRound } from "lucide-react";
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
    <section className="overflow-hidden rounded-[16px] border border-dove/35 bg-pure-white">
      <div className="flex items-center justify-between border-b border-dove/25 px-5 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Quote className="h-3.5 w-3.5 shrink-0 text-graphite" strokeWidth={1.7} />
          <span className="text-[12px] font-[500] text-ink">业主补充信息</span>
          <span className="text-[10px] text-dove">C 端提交评估时填写</span>
        </div>
        <span className="shrink-0 text-[10px] tabular-nums text-dove">{remarks.length} 字</span>
      </div>

      <div className="px-5 py-4">
        {hasNotes ? (
          <div className="space-y-3">
            {hasExpected && (
              <div className="inline-flex items-center rounded-full bg-apricot-wash px-3 py-1 text-[11px] font-[500] text-rust">
                心理预期价 ¥{lead.expectedPrice} 万
              </div>
            )}
            <blockquote className="rounded-[12px] bg-fog px-4 py-3 text-[12px] italic leading-[1.75] text-ash">
              “{remarks}”
            </blockquote>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-dove">
              <span className="inline-flex items-center gap-1">
                <UserRound className="h-3 w-3" strokeWidth={1.7} />
                业主提交 · {formatCreatedAt(lead.createdAt)}
              </span>
              <span>来自 C 端估价表单</span>
            </div>
          </div>
        ) : (
          <p className="text-[11px] italic text-dove">业主未在 C 端提交补充信息</p>
        )}
      </div>
    </section>
  );
};
