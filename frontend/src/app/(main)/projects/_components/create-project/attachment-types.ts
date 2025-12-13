/**
 * 附件上传相关类型定义和常量
 * 支持的文档类型：签约合同/产证/产调/业主身份证/业主银行卡/装修合同/
 * 房屋交接书/收款收据/合作房源确认函/门店跟投协议书/增值服务确认书/其他
 */

// 附件分类枚举
export const ATTACHMENT_CATEGORIES = [
  { value: "signing_contract", label: "签约合同" },
  { value: "property_certificate", label: "产证" },
  { value: "property_survey", label: "产调" },
  { value: "owner_id_card", label: "业主身份证" },
  { value: "owner_bank_card", label: "业主银行卡" },
  { value: "renovation_contract", label: "装修合同" },
  { value: "handover_document", label: "房屋交接书" },
  { value: "receipt", label: "收款收据" },
  { value: "cooperation_confirmation", label: "合作房源确认函" },
  { value: "store_investment_agreement", label: "门店跟投协议书" },
  { value: "value_added_service", label: "增值服务确认书" },
  { value: "other", label: "其他" },
] as const;

export type AttachmentCategory = (typeof ATTACHMENT_CATEGORIES)[number]["value"];

// 支持的文件类型及其 MIME 类型
export const ALLOWED_FILE_TYPES = {
  excel: {
    extensions: [".xlsx", ".xls"],
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ],
  },
  image: {
    extensions: [".jpg", ".jpeg", ".png", ".gif", ".webp"],
    mimeTypes: ["image/jpeg", "image/png", "image/gif", "image/webp"],
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
} as const;

export type FileType = keyof typeof ALLOWED_FILE_TYPES;

// 所有允许的扩展名（用于 input accept 属性）
export const ALLOWED_EXTENSIONS = Object.values(ALLOWED_FILE_TYPES)
  .flatMap((type) => type.extensions)
  .join(",");

// 所有允许的 MIME 类型
export const ALLOWED_MIME_TYPES = Object.values(ALLOWED_FILE_TYPES).flatMap(
  (type) => type.mimeTypes
);

// 最大文件大小：10MB
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

// 附件接口
export interface Attachment {
  id: string;
  filename: string;
  url: string;
  category: AttachmentCategory;
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
 * 验证文件是否为允许的类型
 */
export function isAllowedFile(file: File): boolean {
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
  return Object.values(ALLOWED_FILE_TYPES).some((config) =>
    (config.extensions as readonly string[]).includes(ext)
  );
}

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * 获取分类标签
 */
export function getCategoryLabel(value: AttachmentCategory): string {
  const category = ATTACHMENT_CATEGORIES.find((c) => c.value === value);
  return category?.label ?? value;
}
