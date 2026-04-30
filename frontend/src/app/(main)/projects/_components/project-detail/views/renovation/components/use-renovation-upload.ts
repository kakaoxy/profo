"use client";

/**
 * 装修照片上传 Hook - 重构版
 * 基于通用 useUpload hook，与 leads 模块保持一致
 */

import { useCallback, useRef, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { useUpload } from "@/components/common/upload";
import { addRenovationPhotoAction } from "../../../../../actions/renovation";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

interface UseRenovationUploadProps {
  projectId: string;
  stageValue: string;
  onPhotoUploaded: () => void;
  /** 上传成功后立即回调，用于本地状态更新（解决图片消失问题） */
  onPhotoAdded?: (photo: { url: string; filename: string }) => void;
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
  onPhotoAdded,
}: UseRenovationUploadProps) {
  // 使用 ref 存储 previewUrl 映射，避免重复创建 ObjectURL
  const previewUrlsRef = useRef<Map<string, string>>(new Map());
  // 使用 ref 存储正在上传的文件 ID，即使上传完成也短暂保留以显示100%进度
  const completedFilesRef = useRef<Set<string>>(new Set());

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
    maxSize: MAX_FILE_SIZE,
    allowedTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    multiple: true,
    onSuccess: async (response, file) => {
      if (!response.url) {
        toast.error(`${file.name}: 上传响应无效`);
        return;
      }

      // 【关键修复】上传成功后，立即回调给父组件添加本地状态
      // 这样即使服务器数据同步有延迟，用户也能立即看到图片
      onPhotoAdded?.({ url: response.url, filename: file.name });

      // 上传到服务器成功后，保存到数据库
      const dbRes = await addRenovationPhotoAction({
        projectId,
        stage: stageValue,
        url: response.url,
        filename: file.name,
      });

      if (dbRes.success) {
        toast.success(`${file.name} 上传成功`);
        // 延迟刷新列表，同步服务器数据
        setTimeout(() => {
          onPhotoUploaded();
        }, 1500);
      } else {
        toast.error(`保存照片记录失败: ${dbRes.message}`);
      }
    },
    onError: (error, file) => {
      toast.error(`${file.name}: ${error.message}`);
    },
  });

  // 转换上传队列为组件需要的格式，使用 useMemo 缓存
  // 包含上传中和刚完成的文件（让用户看到100%进度）
  const uploadQueue: UploadingPhoto[] = useMemo(() => {
    // 合并上传中文件和刚完成的文件
    const relevantFiles = files.filter(
      (f) => f.status === "uploading" || f.status === "success"
    );

    return relevantFiles.map((f) => {
      // 复用已创建的 ObjectURL 或创建新的
      let previewUrl = previewUrlsRef.current.get(f.id);
      if (!previewUrl && f.file) {
        previewUrl = URL.createObjectURL(f.file);
        previewUrlsRef.current.set(f.id, previewUrl);
      }

      // 上传完成且新成功的文件，标记为已完成
      if (f.status === "success" && !completedFilesRef.current.has(f.id)) {
        completedFilesRef.current.add(f.id);
        // 延迟清理，等列表刷新完成后再清理上传状态
        // 给用户时间看到"完成"状态，同时确保列表已刷新
        setTimeout(() => {
          remove(f.id);
          // 清理 ObjectURL
          const url = previewUrlsRef.current.get(f.id);
          if (url) {
            URL.revokeObjectURL(url);
            previewUrlsRef.current.delete(f.id);
          }
          completedFilesRef.current.delete(f.id);
        }, 1500); // 1.5s 延迟，确保列表刷新完成后再清理
      }

      return {
        id: f.id,
        file: f.file,
        previewUrl: previewUrl || "",
        progress: f.status === "success" ? 100 : f.progress,
        status: f.status === "error" ? "error" : "uploading",
      };
    });
  }, [files, remove]);

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
