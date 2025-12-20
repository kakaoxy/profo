"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Trash2,
  Download,
  Eye,
  FileSpreadsheet,
  FileImage,
  FileText,
  File,
} from "lucide-react";
import {
  CATEGORY_LABELS,
  FILE_ICON_COLORS,
  type AttachmentGroupConfig,
} from "../constants";
import type { AttachmentInfo, AttachmentHandlers } from "../types";

interface AttachmentGroupProps {
  groupKey: string;
  groupConfig: AttachmentGroupConfig;
  attachments: AttachmentInfo[];
  handlers: AttachmentHandlers;
}

/**
 * 附件组组件 - 按分类渲染附件列表
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
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <GroupIcon className="h-4 w-4" />
        {groupConfig.label}
        <Badge variant="secondary" className="text-xs">
          {attachments.length}
        </Badge>
      </div>
      <div className="space-y-2">
        {attachments.map((att, idx) => (
          <AttachmentItem
            key={`${groupKey}-${idx}`}
            attachment={att}
            handlers={handlers}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * 文件图标组件 - 根据文件类型渲染对应图标
 */
function FileIcon({
  fileType,
  className,
}: {
  fileType: string;
  className?: string;
}) {
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

interface AttachmentItemProps {
  attachment: AttachmentInfo;
  handlers: AttachmentHandlers;
}

/**
 * 单个附件项组件
 */
function AttachmentItem({ attachment, handlers }: AttachmentItemProps) {
  const { onPreview, onDownload, onDelete } = handlers;

  return (
    <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
      {/* 缩略图 */}
      <div className="flex-shrink-0">
        {attachment.fileType === "image" ? (
          <div
            className="h-10 w-10 rounded overflow-hidden border cursor-pointer"
            onClick={() => onPreview(attachment.url, attachment.fileType)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={attachment.url}
              alt={attachment.filename}
              className="h-full w-full object-cover"
            />
          </div>
        ) : (
          <div className="h-10 w-10 rounded bg-background border flex items-center justify-center">
            <FileIcon fileType={attachment.fileType} className="h-5 w-5" />
          </div>
        )}
      </div>

      {/* 文件名 */}
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate" title={attachment.filename}>
          {attachment.filename}
        </p>
        <p className="text-xs text-muted-foreground">
          {CATEGORY_LABELS[attachment.category] || attachment.category}
        </p>
      </div>

      {/* 操作 */}
      <div className="flex items-center gap-1">
        {(attachment.fileType === "image" || attachment.fileType === "pdf") && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onPreview(attachment.url, attachment.fileType)}
          >
            <Eye className="h-4 w-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => onDownload(attachment.url, attachment.filename)}
        >
          <Download className="h-4 w-4" />
        </Button>
        {onDelete && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>确认删除</AlertDialogTitle>
                <AlertDialogDescription>
                  确定要删除附件 &ldquo;{attachment.filename}&rdquo;
                  吗？此操作无法撤销。
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
      </div>
    </div>
  );
}
