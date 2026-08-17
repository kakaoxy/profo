"use client";

import type { ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2, Download, Eye, FileSpreadsheet, FileImage, FileText, File } from "lucide-react";
import { FILE_ICON_COLORS, type AttachmentGroupConfig } from "../constants";
import type { AttachmentInfo, AttachmentHandlers } from "../types";
import { formatFileSize } from "@/lib/formatters";

interface AttachmentGroupProps {
  groupKey: string;
  groupConfig: AttachmentGroupConfig;
  attachments: AttachmentInfo[];
  handlers: AttachmentHandlers;
}

/**
 * 附件组组件（V4.2 · 设计稿 1:1）— doc-group 容器：
 * 图标块 + 标题 + 计数 pill 组头，doc-row 虚线分隔附件行。
 */
export function AttachmentGroup({
  groupKey,
  groupConfig,
  attachments,
  handlers,
}: AttachmentGroupProps) {
  const GroupIcon = groupConfig.icon;

  if (attachments.length === 0) return null;

  return (
    <div className="rounded-[16px] border border-[#efeff1] px-[18px] py-4">
      {/* 分组头（原型 .doc-group-head）：图标块 + 标题 + 计数 pill */}
      <div className="mb-1.5 flex items-center gap-2.5">
        <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[10px] bg-fog text-ash">
          <GroupIcon className="h-[15px] w-[15px]" />
        </span>
        <span className="flex-1 text-[14.5px] font-medium text-ink">{groupConfig.label}</span>
        <span className="shrink-0 rounded-full bg-fog px-2.5 py-[3px] text-xs font-[430] text-graphite">
          {attachments.length} 份
        </span>
      </div>

      {attachments.map((att, idx) => (
        <AttachmentItem key={`${groupKey}-${idx}`} attachment={att} handlers={handlers} />
      ))}
    </div>
  );
}

/**
 * 文件图标组件 - 根据文件类型渲染对应图标（14px 行内小图标，对齐原型 doc-row）
 */
function FileIcon({ fileType, className }: { fileType: string; className?: string }) {
  const iconColor = FILE_ICON_COLORS[fileType] || FILE_ICON_COLORS.default;
  const combinedClassName = `${className || ""} ${iconColor}`.trim();

  switch (fileType) {
    case "excel":
      return <FileSpreadsheet className={combinedClassName} />;
    case "image":
      return <FileImage className={combinedClassName} />;
    case "pdf":
      return <FileText className={combinedClassName} />;
    case "word":
      return <File className={combinedClassName} />;
    default:
      return <File className={combinedClassName} />;
  }
}

/** 图标按钮（原型 .icon-btn）：28px 圆角 8，graphite → hover fog/ink */
function IconBtn({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="grid h-7 w-7 cursor-pointer place-items-center rounded-lg text-graphite transition-all hover:bg-fog hover:text-ink"
    >
      {children}
    </button>
  );
}

interface AttachmentItemProps {
  attachment: AttachmentInfo;
  handlers: AttachmentHandlers;
}

/**
 * 单个附件项（原型 .doc-row）：文件小图标 + 文件名 + 大小 + 预览/下载/删除 icon-btn
 */
function AttachmentItem({ attachment, handlers }: AttachmentItemProps) {
  const { onPreview, onDownload, onDelete } = handlers;

  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 border-b border-dashed border-[#ececef] py-[9px] text-sm last:border-b-0">
      {/* 文件名（文件类型小图标 + 截断） */}
      <span className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
        <FileIcon fileType={attachment.fileType} className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate font-[430] text-ink" title={attachment.filename}>
          {attachment.filename}
        </span>
      </span>

      {/* 大小 */}
      {attachment.size ? (
        <span className="shrink-0 text-[12.5px] font-[430] text-graphite">
          {formatFileSize(attachment.size)}
        </span>
      ) : null}

      {/* 操作 */}
      <span className="flex shrink-0 gap-0.5">
        {(attachment.fileType === "image" || attachment.fileType === "pdf") && (
          <IconBtn title="预览" onClick={() => onPreview(attachment.url, attachment.fileType)}>
            <Eye className="h-[14.5px] w-[14.5px]" />
          </IconBtn>
        )}
        <IconBtn title="下载" onClick={() => onDownload(attachment.url, attachment.filename)}>
          <Download className="h-[14.5px] w-[14.5px]" />
        </IconBtn>
        {onDelete && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <IconBtn title="删除">
                <Trash2 className="h-[14.5px] w-[14.5px]" />
              </IconBtn>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>确认删除</AlertDialogTitle>
                <AlertDialogDescription>
                  确定要删除附件 &ldquo;{attachment.filename}&rdquo; 吗？此操作无法撤销。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction onClick={() => onDelete(attachment.url)}>
                  确认删除
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </span>
    </div>
  );
}
