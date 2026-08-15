"use client";

/**
 * L4 Marketing 图片上传 Hook
 * 基于通用上传系统，保留业务逻辑（创建模式/编辑模式、分类处理）
 */

import { useCallback, useRef, useState, useEffect } from "react";
import { toast } from "sonner";
import { useUpload, compressImage } from "@/components/common/upload";
import { createL4MarketingMediaAction } from "../../actions";
import {
  ALLOWED_IMAGE_TYPES,
  ALLOWED_VIDEO_TYPES,
  MAX_IMAGE_SIZE,
  MAX_UPLOAD_FILES,
  MAX_VIDEO_SIZE,
} from "@/lib/constants";
import { formatFileSize } from "@/lib/formatters";
import type { L4MarketingMedia, MediaType, PhotoCategory } from "../../types";

/** 允许的媒体类型（图片 + 视频） */
const ALLOWED_MEDIA_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES];

/** 按文件类型校验大小：图片 100MB，视频 500MB */
function validateMediaFile(file: File): string | null {
  const isVideo = file.type.startsWith("video/");
  if (isVideo && file.size > MAX_VIDEO_SIZE) {
    return `视频文件过大，最大支持 ${formatFileSize(MAX_VIDEO_SIZE)}`;
  }
  if (!isVideo && file.size > MAX_IMAGE_SIZE) {
    return `图片文件过大，最大支持 ${formatFileSize(MAX_IMAGE_SIZE)}`;
  }
  if (!ALLOWED_MEDIA_TYPES.includes(file.type)) {
    return "不支持的文件格式";
  }
  return null;
}

/** 根据文件类型推断媒体类型 */
function inferMediaType(file: File): MediaType {
  return file.type.startsWith("video/") ? "video" : "image";
}

export interface UploadProgress {
  filename: string;
  progress: number;
  file: File;
}

interface FailedUpload {
  filename: string;
  file: File;
}

interface UseImageUploadOptions {
  projectId?: number;
  uploadCategory: PhotoCategory;
  uploadStage: string;
  photos: L4MarketingMedia[];
  /** 回调函数，接收更新后的完整照片列表 */
  onPhotosChange: (photos: L4MarketingMedia[]) => void;
}

interface UseImageUploadReturn {
  uploadingFiles: UploadProgress[];
  isUploading: boolean;
  uploadFiles: (files: FileList | File[]) => Promise<void>;
  failedUploads: FailedUpload[];
  retryFailed: () => Promise<void>;
  clearFailed: () => void;
}

export function useImageUpload({
  projectId,
  uploadCategory,
  uploadStage,
  photos,
  onPhotosChange,
}: UseImageUploadOptions): UseImageUploadReturn {
  // 本地状态管理上传进度（用于UI展示）
  const [uploadingFiles, setUploadingFiles] = useState<UploadProgress[]>([]);
  const [failedUploads, setFailedUploads] = useState<FailedUpload[]>([]);

  // 使用 ref 存储 onPhotosChange 和 photos，避免频繁变化导致 useCallback 重建
  const onPhotosChangeRef = useRef(onPhotosChange);
  const photosRef = useRef(photos);
  // 记录当前批次起始排序值，保证同一批次内 sort_order 不重复
  const baseSortOrderRef = useRef(0);
  // 串行化并发上传：连续选择多批文件时，后一批等待前一批完成（含 onPhotosChange）
  // 再开始，避免后一批读取过期的 photosRef 而覆盖前一批的上传结果
  const uploadChainRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    onPhotosChangeRef.current = onPhotosChange;
  }, [onPhotosChange]);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  const { isUploading, uploadSingle } = useUpload({
    maxSize: MAX_VIDEO_SIZE,
    allowedTypes: ALLOWED_MEDIA_TYPES,
    multiple: true,
    validateFile: validateMediaFile,
    beforeUpload: (file) => (file.type.startsWith("video/") ? file : compressImage(file)),
    onProgress: ({ file, progress }) => {
      // 同步到组件的 uploadingFiles 状态（用于UI展示）
      setUploadingFiles((prev) =>
        prev.map((item) => (item.file === file ? { ...item, progress } : item)),
      );
    },
  });

  const makeTempMedia = useCallback(
    (file: File, fileUrl: string, sortOrder: number): L4MarketingMedia => {
      return {
        id: Date.now() + Math.random(),
        file_url: fileUrl,
        media_type: inferMediaType(file),
        photo_category: uploadCategory,
        renovation_stage: uploadCategory === "renovation" ? uploadStage : null,
        sort_order: sortOrder,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as L4MarketingMedia;
    },
    [uploadCategory, uploadStage],
  );

  const runUpload = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.isArray(files) ? files : Array.from(files);

      if (fileArray.length === 0) return;

      if (fileArray.length > MAX_UPLOAD_FILES) {
        toast.error(`一次最多上传 ${MAX_UPLOAD_FILES} 个文件，当前选择了 ${fileArray.length} 个`);
        return;
      }

      setFailedUploads([]);
      setUploadingFiles(
        fileArray.map((file) => ({
          filename: file.name,
          progress: 0,
          file,
        })),
      );
      baseSortOrderRef.current = photosRef.current.filter(
        (p) => p.photo_category === uploadCategory,
      ).length;

      try {
        const results = await Promise.all(fileArray.map((file) => uploadSingle(file)));

        const succeeded: { file: File; response: { url: string }; index: number }[] = [];
        const failed: FailedUpload[] = [];

        results.forEach((response, idx) => {
          const file = fileArray[idx];
          if (response?.url) {
            succeeded.push({ file, response, index: idx });
          } else {
            failed.push({ filename: file.name, file });
          }
        });

        if (succeeded.length === 0) {
          setFailedUploads(failed);
          if (fileArray.length > 1) {
            toast.error(`上传失败：${failed.length} 个文件未上传成功`);
          } else {
            toast.error(`${fileArray[0].name}: 上传失败`);
          }
          return;
        }

        const currentPhotos = photosRef.current;

        if (!projectId) {
          // 创建模式：直接生成临时媒体记录，等提交时一并保存
          const newPhotos = succeeded.map(({ file, response, index }) =>
            makeTempMedia(file, response.url, baseSortOrderRef.current + index),
          );
          onPhotosChangeRef.current([...currentPhotos, ...newPhotos]);
        } else {
          // 编辑模式：并行调用后端接口创建媒体记录
          const responses = await Promise.all(
            succeeded.map(({ file, response, index }) =>
              createL4MarketingMediaAction(projectId, {
                file_url: response.url,
                media_type: inferMediaType(file),
                photo_category: uploadCategory,
                renovation_stage: uploadCategory === "renovation" ? uploadStage : null,
                sort_order: baseSortOrderRef.current + index,
              }),
            ),
          );

          const newMedias: L4MarketingMedia[] = [];
          responses.forEach((r, i) => {
            if (r.success && r.data) {
              newMedias.push(r.data);
            } else {
              failed.push({
                filename: succeeded[i].file.name,
                file: succeeded[i].file,
              });
            }
          });

          if (newMedias.length > 0) {
            onPhotosChangeRef.current([...currentPhotos, ...newMedias]);
          }
        }

        setFailedUploads(failed);

        const successCount = fileArray.length - failed.length;
        if (fileArray.length > 1) {
          if (failed.length === 0) {
            toast.success(`上传完成：成功 ${successCount} 个文件`);
          } else {
            toast.error(`上传完成：成功 ${successCount} 个，失败 ${failed.length} 个`);
          }
        } else if (failed.length === 0) {
          toast.success(`${fileArray[0].name}: 上传成功`);
        }
      } catch {
        toast.error("上传过程中发生错误");
        setFailedUploads(fileArray.map((file) => ({ filename: file.name, file })));
      } finally {
        setUploadingFiles([]);
      }
    },
    [uploadSingle, projectId, uploadCategory, uploadStage, makeTempMedia],
  );

  // 并发锁：连续触发 uploadFiles 时串行执行，后一批等待前一批完全结束
  // （含 onPhotosChange 回调）再开始，确保后一批读到最新的 photosRef，
  // 避免过期快照覆盖前一批的上传结果
  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const previous = uploadChainRef.current;
      let release!: () => void;
      uploadChainRef.current = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        await runUpload(files);
      } finally {
        release();
      }
    },
    [runUpload],
  );

  const retryFailed = useCallback(async () => {
    if (failedUploads.length === 0) return;
    await uploadFiles(failedUploads.map((f) => f.file));
  }, [failedUploads, uploadFiles]);

  const clearFailed = useCallback(() => {
    setFailedUploads([]);
  }, []);

  return {
    uploadingFiles,
    isUploading,
    uploadFiles,
    failedUploads,
    retryFailed,
    clearFailed,
  };
}
