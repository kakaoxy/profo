"use client";

/**
 * 通用上传系统
 * 整合6个上传模块的共同功能
 */

// 类型
export type {
  UploadStatus,
  UploadFile,
  UploadResponse,
  UploadProgress,
  UploadOptions,
  UseUploadReturn,
  FileUploaderProps,
} from "./types";

// Hook 和组件
export { useUpload } from "./use-upload";
export { FileUploader } from "./file-uploader";

// 工具函数
export {
  tryRefreshToken,
  getValidToken,
  isTokenExpired,
  getUploadUrl,
  formatFileSize,
  isAllowedFileType,
  validateFile,
  parseUploadResponse,
  handleUploadError,
  generateId,
} from "./utils";

// 常量
export {
  DEFAULT_ALLOWED_IMAGE_TYPES,
  DEFAULT_ALLOWED_FILE_TYPES,
  DEFAULT_MAX_FILE_SIZE,
} from "./types";
