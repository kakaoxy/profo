"use client";

/**
 * 装修照片上传 Hook - 重构版
 * 基于通用 useUpload hook，与 leads 模块保持一致
 */

import { useCallback, useRef, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { useUpload } from "@/components/common/upload";
import { addRenovationPhotoAction } from "../../../../../actions/renovation";

const MAX_FILE_SIZE = 10; // MB

interface UseRenovationUploadProps {
  projectId: string;
  stageValue: string;
  onPhotoUploaded: () => void;
}

export interface UploadingPhoto {
  id: string;
  file: File;
  previewUrl: string;
  progress: number;
  status: "uploading" | "error";
}

export function useRenovationUpload({
  projectId,
  stageValue,
  onPhotoUploaded,
}: UseRenovationUploadProps) {
  // 使用 ref 存储 previewUrl 映射，避免重复创建 ObjectURL
  const previewUrlsRef = useRef<Map<string, string>>(new Map());

  // 清理不再需要的 ObjectURL
  useEffect(() => {
    return () => {
      // 组件卸载时清理所有 ObjectURL
      previewUrlsRef.current.forEach((url) => {
        URL.revokeObjectURL(url);
      });
      previewUrlsRef.current.clear();
    };
  }, []);

  const {
    isUploading,
    uploadingFiles,
    upload,
    files,
    remove,
    clear,
  } = useUpload({
    maxSize: MAX_FILE_SIZE * 1024 * 1024,
    allowedTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    multiple: true,
    onSuccess: async (response, file) => {
      if (!response.url) {
        toast.error(`${file.name}: 上传响应无效`);
        return;
      }

      // 上传到服务器成功后，保存到数据库
      const dbRes = await addRenovationPhotoAction({
        projectId,
        stage: stageValue,
        url: response.url,
        filename: file.name,
      });

      if (dbRes.success) {
        onPhotoUploaded();
      } else {
        toast.error(`保存照片记录失败: ${dbRes.message}`);
      }
    },
    onError: (error, file) => {
      toast.error(`${file.name}: ${error.message}`);
    },
  });

  // 转换上传队列为组件需要的格式，使用 useMemo 缓存
  const uploadQueue: UploadingPhoto[] = useMemo(() => {
    return uploadingFiles.map((f) => {
      const fileItem = files.find((file) => file.id === f.id);
      if (!fileItem) {
        return {
          id: f.id,
          file: new File([], f.filename),
          previewUrl: "",
          progress: f.progress,
          status: "error" as const,
        };
      }

      // 复用已创建的 ObjectURL 或创建新的
      let previewUrl = previewUrlsRef.current.get(f.id);
      if (!previewUrl) {
        previewUrl = URL.createObjectURL(fileItem.file);
        previewUrlsRef.current.set(f.id, previewUrl);
      }

      return {
        id: f.id,
        file: fileItem.file,
        previewUrl,
        progress: f.progress,
        status: fileItem.status === "error" ? "error" : "uploading",
      };
    });
  }, [uploadingFiles, files]);

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files;
      if (!fileList || fileList.length === 0) return;

      await upload(Array.from(fileList));

      // 清空 input 以允许重复上传同一文件
      e.target.value = "";
    },
    [upload]
  );

  return {
    uploadQueue,
    isUploading,
    handleUpload,
    setUploadQueue: () => {}, // 保持兼容，实际由 useUpload 管理
    clear,
    remove,
  };
}
