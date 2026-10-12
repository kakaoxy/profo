import type { components } from "@/lib/api-types";
import { Project } from "../../types";

// F1: 直接引用生成类型，避免与 api-types.d.ts 中的 SigningMaterial 重复定义
export type AttachmentInfo = components["schemas"]["SigningMaterial"];
export type SigningMaterial = components["schemas"]["SigningMaterial"];

/**
 * 附件保存选项（并发合并防护）
 */
export interface AttachmentSaveOptions {
  /** 本次保存中用户显式删除的附件 URL 列表；后端据此从附件库移除（合并语义下删除必须显式声明） */
  removedUrls?: string[];
}

/**
 * ProjectDetailSheet 组件属性
 */
export interface ProjectDetailSheetProps {
  project: Project | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateAttachments?: (
    attachments: SigningMaterial[],
    options?: AttachmentSaveOptions,
  ) => void | Promise<void>;
}

/**
 * 附件操作处理器
 */
export interface AttachmentHandlers {
  onPreview: (url: string, fileType: string) => void;
  onDownload: (url: string, filename: string) => void;
  onDelete?: (url: string) => void;
}
