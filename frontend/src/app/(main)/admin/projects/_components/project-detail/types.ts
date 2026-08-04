import type { components } from "@/lib/api-types";
import { Project } from "../../types";

// F1: 直接引用生成类型，避免与 api-types.d.ts 中的 SigningMaterial 重复定义
export type AttachmentInfo = components["schemas"]["SigningMaterial"];
export type SigningMaterial = components["schemas"]["SigningMaterial"];

/**
 * ProjectDetailSheet 组件属性
 */
export interface ProjectDetailSheetProps {
  project: Project | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateAttachments?: (attachments: SigningMaterial[]) => void;
}

/**
 * 附件操作处理器
 */
export interface AttachmentHandlers {
  onPreview: (url: string, fileType: string) => void;
  onDownload: (url: string, filename: string) => void;
  onDelete?: (url: string) => void;
}
