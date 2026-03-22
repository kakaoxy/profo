"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { API_BASE_URL } from "@/lib/config";
import {
  MAX_FILE_SIZE,
  isAllowedFile,
  formatFileSize,
  type Attachment,
  type AttachmentCategory,
} from "./attachment-types";
import {
  getValidToken,
  createAttachment,
  handleUploadError,
  type UploadProgress,
} from "./file-upload-utils";

interface UseFileUploadOptions {
  category: AttachmentCategory;
  onUploadComplete: (attachment: Attachment) => void;
}

interface UseFileUploadReturn {
  uploadingFiles: UploadProgress[];
  isUploading: boolean;
  uploadFile: (file: File) => Promise<boolean>;
  uploadFiles: (files: FileList) => Promise<void>;
  setUploadingFiles: React.Dispatch<React.SetStateAction<UploadProgress[]>>;
}

/**
 * 文件上传 Hook
 * 处理单文件和多文件上传逻辑
 */
export function useFileUpload({
  category,
  onUploadComplete,
}: UseFileUploadOptions): UseFileUploadReturn {
  const [uploadingFiles, setUploadingFiles] = useState<UploadProgress[]>([]);
  const isUploading = uploadingFiles.length > 0;

  const uploadFile = useCallback(
    async (file: File): Promise<boolean> => {
      // 验证文件类型
      if (!isAllowedFile(file)) {
        toast.error(`${file.name}: 不支持的文件格式`);
        return false;
      }

      // 验证文件大小
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name}: 文件过大`, {
          description: `文件大小不能超过 ${formatFileSize(MAX_FILE_SIZE)}`,
        });
        return false;
      }

      // 添加到上传队列
      setUploadingFiles((prev) => [...prev, { filename: file.name, progress: 0 }]);

      // 获取有效 token
      const token = await getValidToken();
      if (!token) {
        setUploadingFiles((prev) => prev.filter((f) => f.filename !== file.name));
        return false;
      }

      return new Promise((resolve) => {
        const formData = new FormData();
        formData.append("file", file);

        const xhr = new XMLHttpRequest();
        const uploadUrl = `${API_BASE_URL}/api/v1/files/upload`;

        xhr.open("POST", uploadUrl);
        xhr.withCredentials = true;

        if (token) {
          xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        }

        // 进度监听
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            setUploadingFiles((prev) =>
              prev.map((f) =>
                f.filename === file.name ? { ...f, progress: percent } : f
              )
            );
          }
        };

        // 完成处理
        xhr.onload = () => {
          setUploadingFiles((prev) => prev.filter((f) => f.filename !== file.name));

          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const result = JSON.parse(xhr.responseText);
              const attachment = createAttachment(file, result, category);

              if (!attachment) {
                toast.error(`${file.name}: 解析响应失败`);
                resolve(false);
                return;
              }

              onUploadComplete(attachment);
              toast.success(`${file.name}: 上传成功`);
              resolve(true);
            } catch {
              toast.error(`${file.name}: 解析响应失败`);
              resolve(false);
            }
          } else {
            handleUploadError(xhr, file.name);
            resolve(false);
          }
        };

        xhr.onerror = () => {
          setUploadingFiles((prev) => prev.filter((f) => f.filename !== file.name));
          toast.error(`${file.name}: 网络错误`);
          resolve(false);
        };

        xhr.send(formData);
      });
    },
    [category, onUploadComplete]
  );

  const uploadFiles = useCallback(
    async (files: FileList) => {
      const fileArray = Array.from(files);
      if (fileArray.length > 1) {
        toast.info(`开始上传 ${fileArray.length} 个文件...`);
      }

      const results = await Promise.all(fileArray.map((file) => uploadFile(file)));
      const successCount = results.filter(Boolean).length;

      if (fileArray.length > 1) {
        toast.success(`上传完成`, {
          description: `成功 ${successCount} 个，共 ${fileArray.length} 个文件`,
        });
      }
    },
    [uploadFile]
  );

  return {
    uploadingFiles,
    isUploading,
    uploadFile,
    uploadFiles,
    setUploadingFiles,
  };
}
