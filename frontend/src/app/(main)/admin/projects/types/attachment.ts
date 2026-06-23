// src/app/(main)/projects/types/attachment.ts
// 附件相关类型定义

export interface AttachmentInfo {
  filename: string;
  url: string;
  category: string;
  fileType: string;
  size?: number;
}

export interface SigningMaterials {
  attachments?: AttachmentInfo[];
}

export interface AttachmentHandlers {
  onPreview: (url: string, fileType: string) => void;
  onDownload: (url: string, filename: string) => void;
  onDelete?: (url: string) => void;
}
