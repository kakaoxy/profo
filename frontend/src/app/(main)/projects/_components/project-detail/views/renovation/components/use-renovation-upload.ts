"use client";

/**
 * 装修照片上传 Hook - 与 leads 模块保持一致
 * 
 * 核心逻辑：
 * 1. 上传文件到服务器获取 URL
 * 2. 保存到数据库
 * 3. 成功后回调给父组件，由父组件直接追加到本地状态
 * 
 * 【关键修复】不再调用 fetchPhotos 刷新整个列表，避免图片"消失"问题
 */

import { useCallback, useRef, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { useUpload } from "@/components/common/upload";
import { addRenovationPhotoAction } from "../../../../../actions/renovation";
import { RenovationPhoto } from "../../../../../types";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

interface UseRenovationUploadProps {
  projectId: string;
  stageValue: string;
  /**
   * 【关键】上传成功并保存到数据库后回调
   * 父组件应该直接将新照片追加到本地状态，而不是刷新整个列表
   * 这样可以避免服务器数据同步延迟导致的图片"消失"问题
   */
  onPhotoAdded: (photo: RenovationPhoto) => void;
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
  onPhotoAdded,
}: UseRenovationUploadProps) {
  // 使用 ref 存储 previewUrl 映射，避免重复创建 ObjectURL
  const previewUrlsRef = useRef<Map<string, string>>(new Map());
  // 使用 ref 存储正在上传的文件 ID，即使上传完成也短暂保留以显示100%进度
  const completedFilesRef = useRef<Set<string>>(new Set());

  // 清理不再需要的 ObjectURL
  useEffect(() => {
    return () => {
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

      // 【关键修复】先保存到数据库，成功后回调给父组件
      const dbRes = await addRenovationPhotoAction({
        projectId,
        stage: stageValue,
        url: response.url,
        filename: file.name,
      });

      if (dbRes.success) {
        toast.success(`${file.name} 上传成功`);
        
        // 【关键修复】构造 RenovationPhoto 对象，回调给父组件
        // 父组件应该直接将此照片追加到本地状态
        const newPhoto: RenovationPhoto = {
          id: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          project_id: projectId,
          stage: stageValue,
          url: response.url,
          filename: file.name,
          created_at: new Date().toISOString(),
        };
        onPhotoAdded(newPhoto);
      } else {
        toast.error(`保存照片记录失败: ${dbRes.message}`);
      }
    },
    onError: (error, file) => {
      toast.error(`${file.name}: ${error.message}`);
    },
  });

  // 转换上传队列为组件需要的格式
  const uploadQueue: UploadingPhoto[] = useMemo(() => {
    const relevantFiles = files.filter(
      (f) => f.status === "uploading" || f.status === "success"
    );

    return relevantFiles.map((f) => {
      let previewUrl = previewUrlsRef.current.get(f.id);
      if (!previewUrl && f.file) {
        previewUrl = URL.createObjectURL(f.file);
        previewUrlsRef.current.set(f.id, previewUrl);
      }

      // 上传完成后延迟清理
      if (f.status === "success" && !completedFilesRef.current.has(f.id)) {
        completedFilesRef.current.add(f.id);
        setTimeout(() => {
          remove(f.id);
          const url = previewUrlsRef.current.get(f.id);
          if (url) {
            URL.revokeObjectURL(url);
            previewUrlsRef.current.delete(f.id);
          }
          completedFilesRef.current.delete(f.id);
        }, 1500);
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
    clear,
    remove,
  };
}
