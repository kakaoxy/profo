"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { useUpload, DEFAULT_ALLOWED_IMAGE_TYPES, DEFAULT_MAX_FILE_SIZE } from "@/components/common/upload";
import type { ImageItem } from "./types";

interface UseImageUploadOptions {
  defaultValue?: ImageItem[];
  maxCount?: number;
  maxSize?: number;
  allowedTypes?: string[];
  maxConcurrency?: number;
  onUploadSuccess?: (item: ImageItem) => void;
  onUploadError?: (item: ImageItem) => void;
  onChange?: (items: ImageItem[]) => void;
}

interface UseImageUploadReturn {
  items: ImageItem[];
  isUploading: boolean;
  upload: (files: File[]) => void;
  remove: (id: string) => void;
  retry: (id: string) => void;
  cancelAll: () => void;
}

export function useImageUpload(options: UseImageUploadOptions = {}): UseImageUploadReturn {
  const {
    defaultValue,
    maxCount,
    maxSize = DEFAULT_MAX_FILE_SIZE,
    allowedTypes = DEFAULT_ALLOWED_IMAGE_TYPES,
    maxConcurrency = 3,
    onUploadSuccess,
    onUploadError,
    onChange,
  } = options;

  const [items, setItems] = useState<ImageItem[]>(defaultValue ?? []);
  const itemsRef = useRef(items);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const isUploading = useMemo(
    () => items.some((item) => item.status === "uploading"),
    [items]
  );

  const updateItem = useCallback((id: string, patch: Partial<ImageItem>) => {
    setItems((prev) => {
      const next = prev.map((item) =>
        item.id === id ? { ...item, ...patch } : item
      );
      onChangeRef.current?.(next);
      return next;
    });
  }, []);

  const { upload: baseUpload, cancelAll: baseCancelAll } = useUpload({
    maxSize,
    allowedTypes,
    maxConcurrency,
    onSuccess: (response, file) => {
      const fileId = itemsRef.current.find(
        (item) => item.file === file && item.status === "uploading"
      )?.id;
      if (!fileId) return;

      const item = itemsRef.current.find((i) => i.id === fileId);
      updateItem(fileId, {
        status: "success",
        progress: 100,
        url: response.url,
        response,
      });
      onUploadSuccess?.({
        id: fileId,
        file,
        url: response.url,
        status: "success",
        progress: 100,
        response,
        objectUrl: item?.objectUrl,
      });
    },
    onError: (error, file) => {
      const fileId = itemsRef.current.find(
        (item) => item.file === file && item.status === "uploading"
      )?.id;
      if (!fileId) return;

      updateItem(fileId, { status: "error", error: error.message });
      onUploadError?.({
        id: fileId,
        file,
        url: "",
        status: "error",
        progress: 0,
        error: error.message,
      });
    },
    onProgress: (progress) => {
      const fileId = itemsRef.current.find(
        (item) => item.file?.name === progress.filename && item.status === "uploading"
      )?.id;
      if (fileId) {
        updateItem(fileId, { progress: progress.progress });
      }
    },
  });

  const upload = useCallback(
    (files: File[]) => {
      const currentCount = itemsRef.current.length;
      const remainingCount = maxCount ? maxCount - currentCount : undefined;

      if (remainingCount !== undefined && remainingCount <= 0) {
        toast.error(`最多只能上传 ${maxCount} 张图片`);
        return;
      }

      const filesToUpload =
        remainingCount !== undefined ? files.slice(0, remainingCount) : files;

      if (remainingCount !== undefined && files.length > remainingCount) {
        toast.error(`最多还能上传 ${remainingCount} 张，已截取前 ${remainingCount} 张`);
      }

      const newItems: ImageItem[] = filesToUpload.map((file) => {
        const objectUrl = URL.createObjectURL(file);
        return {
          id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          file,
          url: objectUrl,
          status: "uploading" as const,
          progress: 0,
          objectUrl,
        };
      });

      newItems.forEach((item) => {
        setItems((prev) => {
          const next = [...prev, item];
          onChangeRef.current?.(next);
          return next;
        });
      });

      baseUpload(filesToUpload);
    },
    [baseUpload, maxCount]
  );

  const remove = useCallback(
    (id: string) => {
      const item = itemsRef.current.find((i) => i.id === id);
      if (item?.objectUrl) {
        URL.revokeObjectURL(item.objectUrl);
      }
      setItems((prev) => {
        const next = prev.filter((i) => i.id !== id);
        onChangeRef.current?.(next);
        return next;
      });
    },
    []
  );

  const retry = useCallback(
    (id: string) => {
      const item = itemsRef.current.find((i) => i.id === id);
      if (!item || !item.file) return;

      if (item.objectUrl) {
        URL.revokeObjectURL(item.objectUrl);
      }

      setItems((prev) => {
        const next = prev.filter((i) => i.id !== id);
        onChangeRef.current?.(next);
        return next;
      });

      upload([item.file]);
    },
    [upload]
  );

  const cancelAll = useCallback(() => {
    baseCancelAll();
  }, [baseCancelAll]);

  return {
    items,
    isUploading,
    upload,
    remove,
    retry,
    cancelAll,
  };
}
