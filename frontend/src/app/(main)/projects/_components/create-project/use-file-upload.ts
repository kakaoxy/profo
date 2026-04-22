"use client";

/**
 * 项目附件上传 Hook
 * 基于通用上传系统，针对项目附件场景封装
 */

import { useCallback } from "react";
import { useUpload, formatFileSize } from "@/components/common/upload";
import {
  MAX_FILE_SIZE,
  isAllowedFile,
  type Attachment,
  type AttachmentCategory,
} from "./attachment-types";
import { createAttachment } from "./file-upload-utils";

interface UseFileUploadOptions {
  category: AttachmentCategory;
  onUploadComplete: (attachment: Attachment) => void;
}

interface UseFileUploadReturn {
  uploadingFiles: { filename: string; progress: number }[];
  isUploading: boolean;
  uploadFile: (file: File) => Promise<boolean>;
  uploadFiles: (files: FileList) => Promise<void>;
}

/**
 * 项目文件上传 Hook
 * 处理单文件和多文件上传逻辑，自动创建 Attachment 对象
 */
export function useFileUpload({
  category,
  onUploadComplete,
}: UseFileUploadOptions): UseFileUploadReturn {
  const { isUploading, uploadingFiles, upload, uploadSingle } = useUpload({
    maxSize: MAX_FILE_SIZE,
    multiple: true,
    validateFile: (file) => {
      if (!isAllowedFile(file)) {
        return "不支持的文件格式";
      }
      if (file.size > MAX_FILE_SIZE) {
        return `文件过大，最大支持 ${formatFileSize(MAX_FILE_SIZE)}`;
      }
      return null;
    },
    onSuccess: (response, file) => {
      // 创建附件对象
      const attachment = createAttachment(file, response.raw, category);
      if (attachment) {
        onUploadComplete(attachment);
      }
    },
  });

  const uploadFile = useCallback(
    async (file: File): Promise<boolean> => {
      const result = await uploadSingle(file);
      return result !== null;
    },
    [uploadSingle]
  );

  const uploadFiles = useCallback(
    async (files: FileList) => {
      await upload(Array.from(files));
    },
    [upload]
  );

  // 转换为旧接口格式以保持兼容性
  const formattedUploadingFiles = uploadingFiles.map((f) => ({
    filename: f.filename,
    progress: f.progress,
  }));

  return {
    uploadingFiles: formattedUploadingFiles,
    isUploading,
    uploadFile,
    uploadFiles,
  };
}
