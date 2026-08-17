"use client";

import { Trash2, Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { DocumentResponse } from "../../../../../actions/documents";

const STATUS_OPTIONS = [
  { value: "unsigned", label: "未签署" },
  { value: "signed", label: "签署" },
  { value: "archived", label: "归档" },
] as const;

/** 三态 active 配色（对齐原型 .doc-state：未签署灰 / 已签署蓝 / 已归档橙） */
const STATUS_ACTIVE_CLASS: Record<string, string> = {
  unsigned: "border-[#f0f0f2] bg-[#f0f0f2] text-ash",
  signed: "border-sky-wash bg-sky-wash text-[#2c4a78]",
  archived: "border-apricot-wash bg-apricot-wash text-rust",
};

/** 行内编辑状态：记录每行 draft 值，按 document.id 索引 */
export type DraftMap = Record<string, { signoff_status: string; archive_date: string }>;

interface DocumentCardProps {
  doc: DocumentResponse;
  draft: DraftMap[string];
  showUpload: boolean;
  /** 该文书所属分类下的现有附件数（attach-chip 计数） */
  attachmentCount: number;
  onStatusChange: (docId: string, newStatus: string) => void;
  onUpdateDraft: (docId: string, patch: Partial<DraftMap[string]>) => void;
  onDelete: (doc: DocumentResponse) => void;
  onUpload: (doc: DocumentResponse) => void;
}

/**
 * 文书行（原型 .doc-row）：名称 + 三个状态 pill 按钮 + 归档日期 + 上传/删除按钮。
 * 虚线分隔行；归档行显示日期选择器，签署行显示「待归档」提示。
 */
export function DocumentCard({
  doc,
  draft,
  showUpload,
  attachmentCount,
  onStatusChange,
  onUpdateDraft,
  onDelete,
  onUpload,
}: DocumentCardProps) {
  const isDirty =
    draft.signoff_status !== doc.signoff_status || draft.archive_date !== (doc.archive_date || "");
  const isArchived = draft.signoff_status === "archived";
  const isSigned = draft.signoff_status === "signed";

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-2.5 gap-y-2 border-b border-dashed border-[#ececef] py-[9px] last:border-b-0",
        isDirty && "-mx-2 bg-fog/30 px-2",
      )}
    >
      {/* 名称 */}
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-sm font-[430] text-ink",
          isDirty && "font-[480]",
        )}
        title={doc.document_name}
      >
        {doc.document_name}
      </span>

      {/* 三个状态 pill 按钮（active 三态配色） */}
      <div className="flex shrink-0 gap-1.5">
        {STATUS_OPTIONS.map((opt) => {
          const active = draft.signoff_status === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onStatusChange(doc.id, opt.value)}
              className={cn(
                "inline-flex cursor-pointer items-center whitespace-nowrap rounded-full border px-[11px] py-[4px] text-[13px] font-[450] transition-all",
                active
                  ? STATUS_ACTIVE_CLASS[opt.value]
                  : "border-dove/50 bg-pure-white text-graphite hover:border-dove hover:bg-fog/50",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* 归档日期：archived 时显示 date input，签署态显示「待归档」提示，其余显示文本 */}
      {isArchived ? (
        <Input
          type="date"
          value={draft.archive_date}
          onChange={(e) => onUpdateDraft(doc.id, { archive_date: e.target.value })}
          className="h-8 w-[150px] shrink-0 text-[13px]"
        />
      ) : (
        <span className="shrink-0 text-[13px] font-[430] text-graphite">
          {isSigned ? "待归档 · 选择归档日期" : doc.archive_date || "—"}
        </span>
      )}

      {/* 附件入口（仅归档文书，原型 .attach-chip 胶囊）：上传时继承文书分类 */}
      {showUpload && (
        <button
          type="button"
          onClick={() => onUpload(doc)}
          className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border border-[#e7e7ea] bg-pure-white px-[11px] py-[4px] text-[13px] font-[450] text-ash transition-colors hover:border-dove hover:text-ink"
        >
          <Upload className="h-3 w-3" />
          {attachmentCount > 0 ? `${attachmentCount} 个附件 · 补传` : "上传附件"}
        </button>
      )}

      {/* 删除（原型 .icon-btn） */}
      <button
        type="button"
        title="删除要件"
        onClick={() => onDelete(doc)}
        className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-lg text-graphite transition-all hover:bg-fog hover:text-ink"
      >
        <Trash2 className="h-[14.5px] w-[14.5px]" />
      </button>
    </div>
  );
}
