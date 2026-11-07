"use client";

import { useMemo, useState } from "react";
import { format, isValid, parseISO } from "date-fns";
import { Eye, Handshake, MessageSquare, Plus } from "lucide-react";

import { Project, SalesRecord } from "../../../../types";
import { AddRecordDialog } from "./components/add-record-dialog";

interface SalesProgressProps {
  project: Project;
  onRefresh?: () => void;
}

const RECORD_META = {
  viewing: { label: "带看", icon: Eye, tag: "待跟进", tagClass: "bg-apricot-wash text-rust" },
  offer: { label: "出价", icon: Handshake, tag: "已记录", tagClass: "bg-fog text-graphite" },
  negotiation: { label: "面谈", icon: MessageSquare, tag: "已面谈", tagClass: "bg-fog text-graphite" },
} as const;

function recordDate(record: SalesRecord): string {
  const date = parseISO(record.record_date);
  return isValid(date) ? format(date, "MM/dd") : record.record_date;
}

function recordTitle(record: SalesRecord): string {
  const meta = RECORD_META[record.record_type];
  if (record.record_type === "offer") {
    return `${meta.label} · ${record.price != null ? `${record.price} 万` : "未填写价格"}`;
  }
  return `${meta.label} · ${record.customer_name || "未填写客户"}`;
}

export function SalesProgress({ project, onRefresh }: SalesProgressProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const records = useMemo(() => project.sales_records ?? [], [project.sales_records]);
  const sortedRecords = useMemo(
    () =>
      [...records].sort(
        (a, b) => new Date(b.record_date).getTime() - new Date(a.record_date).getTime(),
      ),
    [records],
  );
  const counts = useMemo(
    () => ({
      viewing: records.filter((record) => record.record_type === "viewing").length,
      offer: records.filter((record) => record.record_type === "offer").length,
      negotiation: records.filter((record) => record.record_type === "negotiation").length,
    }),
    [records],
  );

  return (
    <section
      id="project-section-selling-sales"
      className="mb-5 scroll-mt-28 rounded-cards bg-pure-white p-6 shadow-steep md:p-7"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-[500] text-ink">销售进展</h2>
          <p className="mt-1 text-[13px] font-[430] text-graphite">带看、出价与面谈的关键记录</p>
        </div>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="inline-flex shrink-0 items-center gap-1 text-[13px] font-[450] text-graphite transition-colors hover:text-ink"
        >
          <Plus className="size-3.5" />
          记录带看
        </button>
      </div>

      <div className="mt-6 grid grid-cols-3 border-b border-[#f0f0f2] pb-5">
        {[
          ["累计带看", counts.viewing, "次"],
          ["有效出价", counts.offer, "组"],
          ["面谈", counts.negotiation, "场"],
        ].map(([label, value, unit]) => (
          <div key={label as string} className="text-center first:text-left last:text-right">
            <span className="text-[12px] font-[430] text-graphite">{label}</span>
            <b className="mt-1 block font-signifier text-[28px] font-[430] leading-none tracking-[-0.02em] text-ink">
              {value}
              <small className="ml-0.5 font-sohne text-[11px] font-[430] tracking-normal text-graphite">{unit}</small>
            </b>
          </div>
        ))}
      </div>

      <div className="mt-1">
        {sortedRecords.slice(0, 3).map((record) => {
          const meta = RECORD_META[record.record_type];
          const Icon = meta.icon;
          return (
            <div key={record.id} className="flex gap-3.5 border-b border-[#f0f0f2] py-4 last:border-b-0">
              <div className="w-12 shrink-0 text-center">
                <b className="block text-[13px] font-[480] text-ink">{recordDate(record)}</b>
                <span className="mt-0.5 block text-[10px] text-dove">记录</span>
              </div>
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-fog text-graphite">
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <b className="block text-[14px] font-[480] text-ink">{recordTitle(record)}</b>
                <p className="mt-1 line-clamp-2 text-[12.5px] font-[430] leading-[1.55] text-ash">
                  {record.notes || "已记录，可在销售动态中查看完整记录。"}
                </p>
              </div>
              <span className={`mt-1 h-fit shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-[450] ${meta.tagClass}`}>
                {meta.tag}
              </span>
            </div>
          );
        })}
        {sortedRecords.length === 0 && (
          <div className="rounded-[16px] border border-dashed border-dove/60 py-10 text-center text-[13px] text-graphite">
            暂无销售记录
          </div>
        )}
      </div>

      <AddRecordDialog
        projectId={project.id}
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSuccess={() => {
          setDialogOpen(false);
          onRefresh?.();
        }}
        defaultTab="viewing"
        canEditSales={!project.is_archived}
      />
    </section>
  );
}
