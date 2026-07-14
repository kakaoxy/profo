"use client";

import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { DocumentsTab } from "./documents-tab";
import { AttachmentsTab } from "./attachments-tab";
import type {
  Project,
  AttachmentInfo,
  AttachmentHandlers,
} from "../../../../../types";

interface DocumentsAttachmentsTabProps {
  project: Project;
  attachments: AttachmentInfo[];
  handlers: AttachmentHandlers;
  onUpdateAttachments?: (attachments: AttachmentInfo[]) => void;
}

/**
 * 文书与附件合并 Tab
 * 上半区：文书签收清单（归档文书可上传文件）
 * 下半区：按分类展示附件列表
 */
export function DocumentsAttachmentsTab({
  project,
  attachments,
  handlers,
  onUpdateAttachments,
}: DocumentsAttachmentsTabProps) {
  const handleUploadAttachment = (attachment: AttachmentInfo) => {
    if (!onUpdateAttachments) {
      toast.error("当前无法保存附件");
      return;
    }
    const newAttachments = [...attachments, attachment];
    onUpdateAttachments(
      newAttachments.map((a) => ({
        filename: a.filename,
        url: a.url,
        category: a.category,
        fileType: a.fileType,
        size: a.size || 0,
      })),
    );
  };

  return (
    <div className="space-y-6">
      <DocumentsTab
        project={project}
        onUploadAttachment={
          onUpdateAttachments ? handleUploadAttachment : undefined
        }
      />
      <Separator />
      <AttachmentsTab attachments={attachments} handlers={handlers} />
    </div>
  );
}
