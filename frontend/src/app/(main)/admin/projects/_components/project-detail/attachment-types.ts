/**
 * 附件上传相关类型定义和常量
 */

import { formatFileSize } from "@/lib/formatters";

// 支持的文件类型及其 MIME 类型
// 项目附件场景子集（不含 .csv/.md 等导入/通用类型）；后端全局 allowed_extensions 更宽
export const ALLOWED_FILE_TYPES = {
  excel: {
    extensions: [".xlsx", ".xls"],
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ],
  },
  image: {
    // 后端 settings.allowed_extensions 不含 .gif，前端对齐移除
    extensions: [".jpg", ".jpeg", ".png", ".webp"],
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
  },
  pdf: {
    extensions: [".pdf"],
    mimeTypes: ["application/pdf"],
  },
  word: {
    extensions: [".doc", ".docx"],
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
    ],
  },
  video: {
    extensions: [".mp4", ".mov", ".webm"],
    mimeTypes: ["video/mp4", "video/quicktime", "video/webm"],
  },
} as const;

export type FileType = keyof typeof ALLOWED_FILE_TYPES;

// 所有允许的扩展名（用于 input accept 属性）
export const ALLOWED_EXTENSIONS = Object.values(ALLOWED_FILE_TYPES)
  .flatMap((type) => type.extensions)
  .join(",");

// 所有允许的 MIME 类型
export const ALLOWED_MIME_TYPES = Object.values(ALLOWED_FILE_TYPES).flatMap(
  (type) => type.mimeTypes,
);

// 各文件类型大小上限（字节）
// 文档/图片/PDF/Word/Excel：100MB；视频：500MB（与后端 settings.max_upload_size 对齐）
// M6 修复：按业务面拆分限额，避免视频被 100MB 误拦或文档被 500MB 放过
export const MAX_FILE_SIZE_BY_TYPE: Record<FileType, number> = {
  excel: 100 * 1024 * 1024,
  image: 100 * 1024 * 1024,
  pdf: 100 * 1024 * 1024,
  word: 100 * 1024 * 1024,
  video: 500 * 1024 * 1024,
};

// 默认大小上限：100MB（文档类，向后兼容现有引用）
export const MAX_FILE_SIZE = 100 * 1024 * 1024;

// 附件接口
export interface Attachment {
  id: string;
  filename: string;
  url: string;
  category: string;
  fileType: FileType;
  size: number;
  uploadedAt: string; // ISO 8601 格式
}

/**
 * 根据文件名判断文件类型
 */
export function getFileType(filename: string): FileType | null {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf("."));
  for (const [type, config] of Object.entries(ALLOWED_FILE_TYPES)) {
    if ((config.extensions as readonly string[]).includes(ext)) {
      return type as FileType;
    }
  }
  return null;
}

/**
 * 根据文件名返回对应类型的大小上限（字节）
 * 用于按业务面拆分限额：文档/图片 100MB，视频 500MB
 */
export function getMaxFileSizeForFile(filename: string): number {
  const fileType = getFileType(filename);
  return fileType ? MAX_FILE_SIZE_BY_TYPE[fileType] : MAX_FILE_SIZE;
}

/**
 * 项目附件上传校验：扩展名白名单 + 按类型大小上限
 * 供 CommonFileUploader 的 validateFile 选项使用
 */
export function attachmentValidateFile(file: File): string | null {
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
  const allowedExts = ALLOWED_EXTENSIONS.split(",");
  if (!allowedExts.includes(ext)) {
    return "不支持的文件格式";
  }
  const maxSize = getMaxFileSizeForFile(file.name);
  if (file.size > maxSize) {
    return `文件大小超过限制（最大 ${formatFileSize(maxSize)}）`;
  }
  return null;
}

/**
 * 验证文件是否为允许的类型
 */
export function isAllowedFile(file: File): boolean {
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
  return Object.values(ALLOWED_FILE_TYPES).some((config) =>
    (config.extensions as readonly string[]).includes(ext),
  );
}
