"use client";

/**
 * L4 Marketing 图片上传 Hook
 * 基于通用上传系统，保留业务逻辑（创建模式/编辑模式、分类处理）
 */

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { useUpload } from "@/components/common/upload";
import { createL4MarketingMediaAction } from "../../actions";
import type { L4MarketingMedia, PhotoCategory } from "../../types";

export interface UploadProgress {
  filename: string;
  progress: number;
}

// 允许的图片格式
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

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
  uploadFiles: (files: FileList) => Promise<void>;
  setUploadingFiles: React.Dispatch<React.SetStateAction<UploadProgress[]>>;
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

  // 使用 ref 存储 photos 和 onPhotosChange，避免频繁变化导致 useCallback 重建
  const photosRef = useRef(photos);
  const onPhotosChangeRef = useRef(onPhotosChange);

  // 同步 ref 值
  photosRef.current = photos;
  onPhotosChangeRef.current = onPhotosChange;

  const { isUploading, uploadSingle } = useUpload({
    maxSize: MAX_FILE_SIZE,
    allowedTypes: ALLOWED_IMAGE_TYPES,
    multiple: true,
    onProgress: ({ filename, progress }) => {
      // 同步到组件的 uploadingFiles 状态（用于UI展示）
      setUploadingFiles((prev) => {
        const exists = prev.find((f) => f.filename === filename);
        if (exists) {
          return prev.map((f) => (f.filename === filename ? { ...f, progress } : f));
        }
        return [...prev, { filename, progress }];
      });
    },
    onSuccess: async (response, file) => {
      const fileUrl = response.url;
      if (!fileUrl) {
        toast.error(`${file.name}: 解析响应失败`);
        return;
      }

      // 上传成功后从进度列表移除
      setUploadingFiles((prev) => prev.filter((f) => f.filename !== file.name));

      // 使用 ref 获取最新值
      const currentPhotos = photosRef.current;
      const currentOnPhotosChange = onPhotosChangeRef.current;

      // 计算排序值（基于当前分类的照片数量）
      const categoryPhotos = currentPhotos.filter(
        (p) => p.photo_category === uploadCategory
      );
      const nextSortOrder = categoryPhotos.length;

      // 如果没有 projectId（创建模式），直接创建临时媒体记录
      if (!projectId) {
        const tempMedia: L4MarketingMedia = {
          id: Date.now() + Math.random(), // 临时ID
          file_url: fileUrl,
          media_type: "image",
          photo_category: uploadCategory,
          renovation_stage: uploadCategory === "renovation" ? uploadStage : null,
          sort_order: nextSortOrder,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as L4MarketingMedia;
        currentOnPhotosChange([...currentPhotos, tempMedia]);
        toast.success(`${file.name}: 上传成功`);
        return;
      }

      // 有 projectId（编辑模式），创建媒体记录
      try {
        const createResult = await createL4MarketingMediaAction(projectId, {
          file_url: fileUrl,
          media_type: "image",
          photo_category: uploadCategory as any,
          renovation_stage: uploadCategory === "renovation" ? uploadStage : null,
          sort_order: nextSortOrder,
        } as any);

        if (createResult.success && createResult.data) {
          currentOnPhotosChange([...currentPhotos, createResult.data as L4MarketingMedia]);
          toast.success(`${file.name}: 上传成功`);
        } else {
          toast.error(createResult.error || `${file.name}: 保存记录失败`);
        }
      } catch (error) {
        toast.error(`${file.name}: 保存记录失败`);
      }
    },
    onError: (error, file) => {
      // 上传失败时从列表中移除
      setUploadingFiles((prev) => prev.filter((f) => f.filename !== file.name));
    },
  });

  const uploadFiles = useCallback(
    async (files: FileList) => {
      const fileArray = Array.from(files);
      if (fileArray.length > 1) {
        toast.info(`开始上传 ${fileArray.length} 个文件...`);
      }

      // 清空之前的上传进度
      setUploadingFiles([]);

      const results = await Promise.all(fileArray.map((file) => uploadSingle(file)));
      const successCount = results.filter(Boolean).length;

      // 上传完成后清空进度列表
      setUploadingFiles([]);

      if (fileArray.length > 1) {
        toast.success(`上传完成`, {
          description: `成功 ${successCount} 个，共 ${fileArray.length} 个文件`,
        });
      }
    },
    [uploadSingle]
  );

  return {
    uploadingFiles,
    isUploading,
    uploadFiles,
    setUploadingFiles,
  };
}
