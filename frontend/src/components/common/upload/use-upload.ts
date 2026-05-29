"use client";

/**
 * 通用上传系统 - Hook
 * 整合6个上传模块的共同逻辑
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { toast } from "sonner";
import type {
  UploadFile,
  UploadResponse,
  UploadProgress,
  UploadOptions,
  UseUploadReturn,
} from "./types";
import {
  getUploadUrl,
  validateFile,
  parseUploadResponse,
  generateId,
} from "./utils";
import { DEFAULT_MAX_FILE_SIZE, DEFAULT_ALLOWED_IMAGE_TYPES } from "./types";

const DEFAULT_MAX_CONCURRENCY = 3;

export function useUpload(options: UploadOptions = {}): UseUploadReturn {
  const {
    url = getUploadUrl(),
    maxSize = DEFAULT_MAX_FILE_SIZE,
    allowedTypes = DEFAULT_ALLOWED_IMAGE_TYPES,
    maxCount,
    maxConcurrency = DEFAULT_MAX_CONCURRENCY,
    validateFile: customValidate,
    beforeUpload,
    onSuccess,
    onError,
    onProgress,
  } = options;

  const [files, setFiles] = useState<UploadFile[]>([]);
  const filesRef = useRef(files);
  const activeXhrs = useRef<Map<string, XMLHttpRequest>>(new Map());
  const activeCountRef = useRef(0);
  const pendingQueueRef = useRef<Array<() => void>>([]);

  // 使用 ref 模式稳定回调引用，消除对外部回调稳定性的依赖
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  const onProgressRef = useRef(onProgress);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  const isUploading = useMemo(
    () => files.some((f) => f.status === "uploading"),
    [files]
  );

  const uploadingFiles: UploadProgress[] = useMemo(
    () =>
      files
        .filter((f) => f.status === "uploading")
        .map((f) => ({ id: f.id, filename: f.file.name, progress: f.progress, file: f.file })),
    [files]
  );

  const dequeueNext = useCallback(() => {
    if (activeCountRef.current >= maxConcurrency) return;
    if (pendingQueueRef.current.length > 0) {
      const next = pendingQueueRef.current.shift()!;
      next();
    }
  }, [maxConcurrency]);

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

      // 3. 创建上传记录
      const fileId = generateId();
      const newFile: UploadFile = {
        id: fileId,
        file: processedFile,
        status: "uploading",
        progress: 0,
      };

      setFiles((prev) => [...prev, newFile]);

      // 4. 执行上传
      return new Promise((resolve) => {
        const formData = new FormData();
        formData.append("file", processedFile);

        const xhr = new XMLHttpRequest();
        activeXhrs.current.set(fileId, xhr);
        activeCountRef.current += 1;

        const cleanup = () => {
          activeXhrs.current.delete(fileId);
          activeCountRef.current -= 1;
          dequeueNext();
        };

        xhr.open("POST", url);
        xhr.withCredentials = true;

        // 进度监听
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            setFiles((prev) =>
              prev.map((f) =>
                f.id === fileId ? { ...f, progress: percent } : f
              )
            );
            onProgressRef.current?.({ id: fileId, filename: processedFile.name, progress: percent, file: processedFile });
          }
        };

        // 完成处理
        xhr.onload = () => {
          cleanup();

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
                onErrorRef.current?.(error, processedFile);
                resolve(null);
                return;
              }

              setFiles((prev) =>
                prev.map((f) =>
                  f.id === fileId
                    ? { ...f, status: "success" as const, response }
                    : f
                )
              );
              onSuccessRef.current?.(response, processedFile);
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
              onErrorRef.current?.(error, processedFile);
              resolve(null);
            }
          } else {
            let errorMsg: string;
            if (xhr.status === 401) {
              errorMsg = "登录已过期，请刷新页面后重试";
            } else {
              try {
                const errorBody = JSON.parse(xhr.responseText);
                errorMsg = errorBody.detail || `上传失败 (${xhr.status})`;
              } catch {
                errorMsg = `上传失败 (${xhr.status})`;
              }
            }
            const error = new Error(errorMsg);
            toast.error(`${processedFile.name}: ${errorMsg}`);
            setFiles((prev) =>
              prev.map((f) =>
                f.id === fileId
                  ? { ...f, status: "error" as const, error: errorMsg }
                  : f
              )
            );
            onErrorRef.current?.(error, processedFile);
            resolve(null);
          }
        };

        // 错误处理
        xhr.onerror = () => {
          cleanup();
          const error = new Error("网络错误");
          toast.error(`${processedFile.name}: 网络错误`);
          setFiles((prev) =>
            prev.map((f) =>
              f.id === fileId
                ? { ...f, status: "error" as const, error: error.message }
                : f
            )
          );
          onErrorRef.current?.(error, processedFile);
          resolve(null);
        };

        xhr.onabort = () => {
          cleanup();
          const error = new Error("上传已取消");
          setFiles((prev) =>
            prev.map((f) =>
              f.id === fileId
                ? { ...f, status: "error" as const, error: error.message }
                : f
            )
          );
          onErrorRef.current?.(error, processedFile);
          resolve(null);
        };

        xhr.send(formData);
      });
    },
    [url, maxSize, allowedTypes, customValidate, beforeUpload, dequeueNext]
  );

  /**
   * 上传多个文件（支持并发控制）
   */
  const upload = useCallback(
    (fileList: File[]) => {
      if (!fileList.length) return;

      // 检查最大数量限制
      if (maxCount) {
        const activeFiles = filesRef.current.filter(
          (f) => f.status === "uploading" || f.status === "pending"
        );
        if (activeFiles.length + fileList.length > maxCount) {
          toast.error(`最多只能上传 ${maxCount} 个文件`);
          return;
        }
      }

      if (fileList.length > 1) {
        toast.info(`开始上传 ${fileList.length} 个文件...`);
      }

      let completedCount = 0;
      let successCount = 0;
      const total = fileList.length;

      const onComplete = (ok: boolean) => {
        if (ok) successCount += 1;
        completedCount += 1;

        if (completedCount === total && total > 1) {
          toast.success(`上传完成`, {
            description: `成功 ${successCount} 个，共 ${total} 个文件`,
          });
        }
      };

      for (const file of fileList) {
        const startUpload = () => {
          uploadSingle(file)
            .then((result) => {
              onComplete(result !== null);
            });
        };

        if (activeCountRef.current < maxConcurrency) {
          startUpload();
        } else {
          pendingQueueRef.current.push(startUpload);
        }
      }
    },
    [uploadSingle, maxCount, maxConcurrency]
  );

  /**
   * 移除文件
   */
  const remove = useCallback((id: string) => {
    const xhr = activeXhrs.current.get(id);
    if (xhr) {
      xhr.abort();
    }
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  /**
   * 清空所有文件
   */
  const clear = useCallback(() => {
    activeXhrs.current.forEach((xhr) => xhr.abort());
    activeXhrs.current.clear();
    setFiles([]);
  }, []);

  /**
   * 重新上传失败的文件
   */
  const retry = useCallback(
    async (id: string) => {
      const fileItem = files.find((f) => f.id === id);
      if (!fileItem || fileItem.status !== "error") return;

      // 移除失败/取消的记录
      setFiles((prev) => prev.filter((f) => f.id !== id));

      // 重新上传
      await uploadSingle(fileItem.file);
    },
    [files, uploadSingle]
  );

  /**
   * 取消单个文件上传
   */
  const cancel = useCallback((id: string) => {
    const xhr = activeXhrs.current.get(id);
    if (xhr) {
      xhr.abort();
    }
    // 从等待队列中移除（简单方案：标记后 dequeueNext 会跳过不存在的文件）
  }, []);

  /**
   * 取消所有上传
   * 中止所有进行中的 XHR，清空等待队列
   */
  const cancelAll = useCallback(() => {
    activeXhrs.current.forEach((xhr) => xhr.abort());
    activeXhrs.current.clear();
    pendingQueueRef.current = [];
  }, []);

  return {
    files,
    isUploading,
    uploadingFiles,
    upload,
    uploadSingle,
    remove,
    clear,
    retry,
    cancelAll,
    cancel,
  };
}

export default useUpload;
