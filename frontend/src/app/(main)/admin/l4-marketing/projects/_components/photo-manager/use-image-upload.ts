"use client";

/**
 * L4 Marketing 图片上传 Hook
 * 基于通用上传系统，保留业务逻辑（创建模式/编辑模式、分类处理）
 */

import { useCallback, useRef, useState, useEffect } from "react";
import { toast } from "sonner";
import { useUpload } from "@/components/common/upload";
import { createL4MarketingMediaAction } from "../../actions";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_SIZE,
  MAX_UPLOAD_FILES,
} from "@/lib/constants";
import type { L4MarketingMedia, PhotoCategory } from "../../types";

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

  useEffect(() => {
    onPhotosChangeRef.current = onPhotosChange;
  }, [onPhotosChange]);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  const { isUploading, uploadSingle } = useUpload({
    maxSize: MAX_IMAGE_SIZE,
    allowedTypes: ALLOWED_IMAGE_TYPES,
    multiple: true,
    onProgress: ({ file, progress }) => {
      // 同步到组件的 uploadingFiles 状态（用于UI展示）
      setUploadingFiles((prev) =>
        prev.map((item) => (item.file === file ? { ...item, progress } : item)),
      );
    },
  });

  const makeTempMedia = useCallback(
    (fileUrl: string, sortOrder: number): L4MarketingMedia => {
      return {
        id: Date.now() + Math.random(),
        file_url: fileUrl,
        media_type: "image",
        photo_category: uploadCategory,
        renovation_stage:
          uploadCategory === "renovation" ? uploadStage : null,
        sort_order: sortOrder,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as L4MarketingMedia;
    },
    [uploadCategory, uploadStage],
  );

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.isArray(files) ? files : Array.from(files);

      if (fileArray.length === 0) return;

      if (fileArray.length > MAX_UPLOAD_FILES) {
        toast.error(
          `一次最多上传 ${MAX_UPLOAD_FILES} 张图片，当前选择了 ${fileArray.length} 张`,
        );
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
        const results = await Promise.all(
          fileArray.map((file) => uploadSingle(file)),
        );

        const succeeded: { file: File; response: { url: string }; index: number }[] =
          [];
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
          const newPhotos = succeeded.map(({ response, index }) =>
            makeTempMedia(response.url, baseSortOrderRef.current + index),
          );
          onPhotosChangeRef.current([...currentPhotos, ...newPhotos]);
        } else {
          // 编辑模式：逐个调用后端接口创建媒体记录
          const newMedias: L4MarketingMedia[] = [];

          for (const { response, index } of succeeded) {
            const createResult = await createL4MarketingMediaAction(
              projectId,
              {
                file_url: response.url,
                media_type: "image",
                photo_category: uploadCategory,
                renovation_stage:
                  uploadCategory === "renovation" ? uploadStage : null,
                sort_order: baseSortOrderRef.current + index,
              },
            );

            if (createResult.success && createResult.data) {
              newMedias.push(createResult.data);
            } else {
              failed.push({
                filename: fileArray[index].name,
                file: fileArray[index],
              });
            }
          }

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
            toast.error(
              `上传完成：成功 ${successCount} 个，失败 ${failed.length} 个`,
            );
          }
        } else if (failed.length === 0) {
          toast.success(`${fileArray[0].name}: 上传成功`);
        }
      } catch {
        toast.error("上传过程中发生错误");
        setFailedUploads(
          fileArray.map((file) => ({ filename: file.name, file })),
        );
      } finally {
        setUploadingFiles([]);
      }
    },
    [uploadSingle, projectId, uploadCategory, uploadStage, makeTempMedia],
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
