import { Project } from "../../types";

/**
 * 附件信息接口
 */
export interface AttachmentInfo {
  filename: string;
  url: string;
  category: string;
  fileType: string;
  size?: number;
}

/**
 * ProjectDetailSheet 组件属性
 */
export interface ProjectDetailSheetProps {
  project: Project | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateAttachments?: (attachments: Project["signing_materials"]) => void;
}

/**
 * 附件操作处理器
 */
export interface AttachmentHandlers {
  onPreview: (url: string, fileType: string) => void;
  onDownload: (url: string, filename: string) => void;
  onDelete?: (url: string) => void;
}
