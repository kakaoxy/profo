"use client";

import { FileText } from "lucide-react";
import { AttachmentGroup } from "../attachment-group";
import { ATTACHMENT_GROUPS } from "../constants";
import type { AttachmentInfo, AttachmentHandlers } from "../types";

interface AttachmentsTabProps {
  attachments: AttachmentInfo[];
  handlers: AttachmentHandlers;
}

/**
 * 附件 Tab - 按分类展示附件列表
 */
export function AttachmentsTab({ attachments, handlers }: AttachmentsTabProps) {
  // 按分类分组附件
  const groupedAttachments = Object.entries(ATTACHMENT_GROUPS).reduce(
    (acc, [key, config]) => {
      acc[key] = attachments.filter((att) =>
        config.categories.includes(att.category)
      );
      return acc;
    },
    {} as Record<string, AttachmentInfo[]>
  );

  if (attachments.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <FileText className="h-16 w-16 mx-auto mb-4 opacity-30" />
        <p className="text-lg">暂无附件</p>
        <p className="text-sm mt-1">此项目尚未上传任何附件</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {Object.entries(ATTACHMENT_GROUPS).map(([key, config]) => (
        <AttachmentGroup
          key={key}
          groupKey={key}
          groupConfig={config}
          attachments={groupedAttachments[key] || []}
          handlers={handlers}
        />
      ))}
    </div>
  );
}
