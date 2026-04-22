"use client";

/**
 * 通用上传系统 - Hook
 * 整合6个上传模块的共同逻辑
 */

import { useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import type {
  UploadFile,
  UploadResponse,
  UploadProgress,
  UploadOptions,
  UseUploadReturn,
} from "./types";
import {
  getValidToken,
  getUploadUrl,
  validateFile,
  parseUploadResponse,
  generateId,
} from "./utils";
import { DEFAULT_MAX_FILE_SIZE, DEFAULT_ALLOWED_IMAGE_TYPES } from "./types";

export function useUpload(options: UploadOptions = {}): UseUploadReturn {
  const {
    url = getUploadUrl(),
    maxSize = DEFAULT_MAX_FILE_SIZE,
    allowedTypes = DEFAULT_ALLOWED_IMAGE_TYPES,
    multiple = true,
    maxCount,
    validateFile: customValidate,
    beforeUpload,
    onSuccess,
    onError,
    onProgress,
  } = options;

  const [files, setFiles] = useState<UploadFile[]>([]);
  const filesRef = useRef(files);

  // 同步 ref，避免闭包问题
  filesRef.current = files;

  const isUploading = files.some((f) => f.status === "uploading");

  const uploadingFiles: UploadProgress[] = files
    .filter((f) => f.status === "uploading")
    .map((f) => ({ id: f.id, filename: f.file.name, progress: f.progress }));

  /**
   * 上传单个文件 (核心方法)
   */
  const uploadSingle = useCallback(
    async (file: File): Promise<UploadResponse | null> => {
      // 1. 文件验证
      if (customValidate) {
        const customError = customValidate(file);
        if (customError) {
          toast.error(`${file.name}: ${customError}`);
          return null;
        }
      } else {
        const error = validateFile(file, { maxSize, allowedTypes });
        if (error) {
          toast.error(`${file.name}: ${error}`);
          return null;
        }
      }

      // 2. 上传前处理
      let processedFile = file;
      if (beforeUpload) {
        const result = await beforeUpload(file);
        if (result === null) return null;
        processedFile = result;
      }

      // 3. 获取 token
      const token = await getValidToken();
      if (!token) {
        toast.error("登录已过期，请重新登录");
        return null;
      }

      // 4. 创建上传记录
      const fileId = generateId();
      const newFile: UploadFile = {
        id: fileId,
        file: processedFile,
        status: "uploading",
        progress: 0,
      };

      setFiles((prev) => [...prev, newFile]);

      // 5. 执行上传
      return new Promise((resolve) => {
        const formData = new FormData();
        formData.append("file", processedFile);

        const xhr = new XMLHttpRequest();

        xhr.open("POST", url);
        xhr.withCredentials = true;
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);

        // 进度监听
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            setFiles((prev) =>
              prev.map((f) =>
                f.id === fileId ? { ...f, progress: percent } : f
              )
            );
            onProgress?.({ id: fileId, filename: processedFile.name, progress: percent });
          }
        };

        // 完成处理
        xhr.onload = () => {
          setFiles((prev) =>
            prev.map((f) =>
              f.id === fileId ? { ...f, status: "success" as const } : f
            )
          );

          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const result = JSON.parse(xhr.responseText);
              const response = parseUploadResponse(result);

              if (!response) {
                toast.error(`${processedFile.name}: 解析响应失败`);
                const error = new Error("解析响应失败");
                setFiles((prev) =>
                  prev.map((f) =>
                    f.id === fileId
                      ? { ...f, status: "error" as const, error: error.message }
                      : f
                  )
                );
                onError?.(error, processedFile);
                resolve(null);
                return;
              }

              onSuccess?.(response, processedFile);
              resolve(response);
            } catch (err) {
              const error =
                err instanceof Error ? err : new Error("解析响应失败");
              toast.error(`${processedFile.name}: ${error.message}`);
              setFiles((prev) =>
                prev.map((f) =>
                  f.id === fileId
                    ? { ...f, status: "error" as const, error: error.message }
                    : f
                )
              );
              onError?.(error, processedFile);
              resolve(null);
            }
          } else {
            const errorMsg =
              xhr.status === 401
                ? "登录已过期，请刷新页面后重试"
                : `上传失败 (${xhr.status})`;
            const error = new Error(errorMsg);
            toast.error(`${processedFile.name}: ${errorMsg}`);
            setFiles((prev) =>
              prev.map((f) =>
                f.id === fileId
                  ? { ...f, status: "error" as const, error: errorMsg }
                  : f
              )
            );
            onError?.(error, processedFile);
            resolve(null);
          }
        };

        // 错误处理
        xhr.onerror = () => {
          const error = new Error("网络错误");
          toast.error(`${processedFile.name}: 网络错误`);
          setFiles((prev) =>
            prev.map((f) =>
              f.id === fileId
                ? { ...f, status: "error" as const, error: error.message }
                : f
            )
          );
          onError?.(error, processedFile);
          resolve(null);
        };

        xhr.onabort = () => {
          const error = new Error("上传已取消");
          setFiles((prev) => prev.filter((f) => f.id !== fileId));
          onError?.(error, processedFile);
          resolve(null);
        };

        xhr.send(formData);
      });
    },
    [url, maxSize, allowedTypes, customValidate, beforeUpload, onSuccess, onError, onProgress]
  );

  /**
   * 上传多个文件
   */
  const upload = useCallback(
    async (fileList: File[]) => {
      if (!fileList.length) return;

      // 检查最大数量限制
      if (maxCount && filesRef.current.length + fileList.length > maxCount) {
        toast.error(`最多只能上传 ${maxCount} 个文件`);
        return;
      }

      if (fileList.length > 1) {
        toast.info(`开始上传 ${fileList.length} 个文件...`);
      }

      const results = await Promise.all(
        fileList.map((file) => uploadSingle(file))
      );

      const successCount = results.filter(Boolean).length;

      if (fileList.length > 1) {
        toast.success(`上传完成`, {
          description: `成功 ${successCount} 个，共 ${fileList.length} 个文件`,
        });
      }
    },
    [uploadSingle, maxCount]
  );

  /**
   * 移除文件
   */
  const remove = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  /**
   * 清空所有文件
   */
  const clear = useCallback(() => {
    setFiles([]);
  }, []);

  /**
   * 重新上传失败的文件
   */
  const retry = useCallback(
    async (id: string) => {
      const fileItem = files.find((f) => f.id === id);
      if (!fileItem || fileItem.status !== "error") return;

      // 移除失败的记录
      setFiles((prev) => prev.filter((f) => f.id !== id));

      // 重新上传
      await uploadSingle(fileItem.file);
    },
    [files, uploadSingle]
  );

  return {
    files,
    isUploading,
    uploadingFiles,
    upload,
    uploadSingle,
    remove,
    clear,
    retry,
  };
}

export default useUpload;
