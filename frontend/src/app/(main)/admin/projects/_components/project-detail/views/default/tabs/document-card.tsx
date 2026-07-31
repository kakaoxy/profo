"use client";

import { Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { DocumentResponse } from "../../../../../actions/documents";

const STATUS_OPTIONS = [
  { value: "unsigned", label: "未签署" },
  { value: "signed", label: "签署" },
  { value: "archived", label: "归档" },
] as const;

/** 行内编辑状态：记录每行 draft 值，按 document.id 索引 */
export type DraftMap = Record<string, { signoff_status: string; archive_date: string }>;

interface DocumentCardProps {
  doc: DocumentResponse;
  index: number;
  draft: DraftMap[string];
  showUpload: boolean;
  onStatusChange: (docId: string, newStatus: string) => void;
  onUpdateDraft: (docId: string, patch: Partial<DraftMap[string]>) => void;
  onDelete: (doc: DocumentResponse) => void;
  onUpload: (doc: DocumentResponse) => void;
}

/**
 * 文书行卡片：序号 + 名称 + 状态 pill + 归档日期 + 上传/删除按钮。
 * 网格列宽随是否显示上传按钮自适应。
 */
export function DocumentCard({
  doc,
  index,
  draft,
  showUpload,
  onStatusChange,
  onUpdateDraft,
  onDelete,
  onUpload,
}: DocumentCardProps) {
  const isDirty =
    draft.signoff_status !== doc.signoff_status ||
    draft.archive_date !== (doc.archive_date || "");
  const isArchived = draft.signoff_status === "archived";

  return (
    <div
      className={cn(
        "grid items-center gap-3 rounded-md border px-4 py-3 transition-colors",
        isDirty ? "border-ink/40 bg-fog/30" : "hover:bg-accent/50",
        showUpload
          ? "grid-cols-[24px_minmax(120px,1fr)_auto_160px_auto_32px]"
          : isArchived
            ? "grid-cols-[24px_minmax(120px,1fr)_auto_160px_32px]"
            : "grid-cols-[24px_minmax(120px,1fr)_auto_120px_32px]",
      )}
    >
      {/* 序号 */}
      <span className="text-muted-foreground text-sm">{index + 1}.</span>

      {/* 名称 */}
      <span className="font-medium truncate" title={doc.document_name}>
        {doc.document_name}
      </span>

      {/* 三个状态 pill 按钮 */}
      <div className="flex gap-1.5">
        {STATUS_OPTIONS.map((opt) => {
          const active = draft.signoff_status === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onStatusChange(doc.id, opt.value)}
              className={cn(
                "inline-flex items-center rounded-full px-3 py-1 text-[12px] font-medium cursor-pointer transition-all border whitespace-nowrap",
                active
                  ? "bg-ink text-pure-white border-ink"
                  : "bg-pure-white text-graphite border-dove/50 hover:border-dove hover:bg-fog/50",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* 归档日期：archived 时显示 date input，其他状态显示文本 */}
      {isArchived ? (
        <Input
          type="date"
          value={draft.archive_date}
          onChange={(e) => onUpdateDraft(doc.id, { archive_date: e.target.value })}
          className="h-8 text-[13px] w-full"
        />
      ) : (
        <span className="text-sm text-muted-foreground text-right truncate">
          {doc.archive_date || "—"}
        </span>
      )}

      {/* 上传文件（仅归档文书）：上传时继承文书分类 */}
      {showUpload && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => onUpload(doc)}
        >
          <Upload className="mr-1 h-3.5 w-3.5" />
          上传文件
        </Button>
      )}

      {/* 删除 */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
        onClick={() => onDelete(doc)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
