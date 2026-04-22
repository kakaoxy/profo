"use client";

/**
 * 通用上传系统 - 类型定义
 * 整合6个上传模块的共同功能
 */

/** 文件上传状态 */
export type UploadStatus = "pending" | "uploading" | "success" | "error";

/** 上传文件项 */
export interface UploadFile {
  /** 唯一标识 */
  id: string;
  /** 原始文件对象 */
  file: File;
  /** 上传状态 */
  status: UploadStatus;
  /** 上传进度 (0-100) */
  progress: number;
  /** 错误信息 */
  error?: string;
  /** 上传成功后的响应数据 */
  response?: UploadResponse;
}

/** 上传响应数据 */
export interface UploadResponse {
  /** 文件URL */
  url: string;
  /** 文件名称 */
  filename?: string;
  /** 文件大小 */
  size?: number;
  /** MIME类型 */
  mimeType?: string;
  /** 原始响应 */
  raw?: any;
}

/** 上传进度信息 */
export interface UploadProgress {
  /** 文件名 */
  filename: string;
  /** 进度百分比 */
  progress: number;
}

/** 上传配置选项 */
export interface UploadOptions {
  /** 上传接口URL (默认: /api/v1/files/upload) */
  url?: string;
  /** 最大文件大小 (字节, 默认10MB) */
  maxSize?: number;
  /** 允许的文件类型 (MIME类型数组, 默认图片类型) */
  allowedTypes?: string[];
  /** 是否支持多文件上传 */
  multiple?: boolean;
  /** 多文件上传时最大数量 */
  maxCount?: number;
  /** 自定义文件验证函数 */
  validateFile?: (file: File) => string | null;
  /** 上传前处理 */
  beforeUpload?: (file: File) => Promise<File | null> | File | null;
  /** 上传成功回调 */
  onSuccess?: (response: UploadResponse, file: File) => void;
  /** 上传失败回调 */
  onError?: (error: Error, file: File) => void;
  /** 进度变化回调 */
  onProgress?: (progress: UploadProgress) => void;
}

/** useUpload Hook 返回值 */
export interface UseUploadReturn {
  /** 当前上传文件列表 */
  files: UploadFile[];
  /** 是否正在上传中 */
  isUploading: boolean;
  /** 当前上传进度 */
  uploadingFiles: UploadProgress[];
  /** 上传文件 */
  upload: (files: File[]) => Promise<void>;
  /** 上传单个文件 */
  uploadSingle: (file: File) => Promise<UploadResponse | null>;
  /** 移除文件 */
  remove: (id: string) => void;
  /** 清空所有文件 */
  clear: () => void;
  /** 重新上传失败的文件 */
  retry: (id: string) => Promise<void>;
}

/** 文件上传器组件属性 */
export interface FileUploaderProps {
  /** 上传配置 */
  options?: UploadOptions;
  /** 是否禁用 */
  disabled?: boolean;
  /** 上传成功回调 */
  onUploadComplete?: (response: UploadResponse, file: File) => void;
  /** 上传失败回调 */
  onUploadError?: (error: Error, file: File) => void;
  /** 自定义上传区域内容 */
  children?: React.ReactNode;
  /** 自定义样式 */
  className?: string;
  /** 上传区域文本 */
  title?: string;
  /** 上传区域描述 */
  description?: string;
  /** 自定义渲染上传列表 */
  renderFileList?: (props: {
    files: UploadFile[];
    onRemove: (id: string) => void;
    onRetry: (id: string) => void;
  }) => React.ReactNode;
  /** 是否显示上传列表 */
  showFileList?: boolean;
}

/** 默认允许的图片类型 */
export const DEFAULT_ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

/** 默认允许的文件类型 (通用) */
export const DEFAULT_ALLOWED_FILE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

/** 默认文件大小限制: 10MB */
export const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024;
