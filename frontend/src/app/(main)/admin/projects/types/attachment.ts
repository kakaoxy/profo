// src/app/(main)/projects/types/attachment.ts
// 附件相关类型定义

import type { components } from "@/lib/api-types";

// F1: 直接引用生成类型，避免与 api-types.d.ts 中的 SigningMaterial 重复定义
export type AttachmentInfo = components["schemas"]["SigningMaterial"];

export interface SigningMaterials {
  attachments?: AttachmentInfo[];
}

export interface AttachmentHandlers {
  onPreview: (url: string, fileType: string) => void;
  onDownload: (url: string, filename: string) => void;
  onDelete?: (url: string) => void;
}
