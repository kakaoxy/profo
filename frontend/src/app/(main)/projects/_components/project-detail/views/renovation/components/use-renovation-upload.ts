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
  // 【关键修复】只显示正在上传中的文件，不显示已完成的
  // 因为上传成功后已通过 onPhotoAdded 添加到本地状态显示
  const uploadQueue: UploadingPhoto[] = useMemo(() => {
    // 只保留正在上传中的文件，上传成功的立即移除（不再显示绿色勾选）
    const uploadingOnlyFiles = files.filter((f) => f.status === "uploading");

    return uploadingOnlyFiles.map((f) => {
      let previewUrl = previewUrlsRef.current.get(f.id);
      if (!previewUrl && f.file) {
        previewUrl = URL.createObjectURL(f.file);
        previewUrlsRef.current.set(f.id, previewUrl);
      }

      return {
        id: f.id,
        file: f.file,
        previewUrl: previewUrl || "",
        progress: f.progress,
        status: "uploading",
      };
    });
  }, [files]);

  // 清理已上传完成的文件（从 useUpload 的 files 中移除）
  useEffect(() => {
    const completedFiles = files.filter((f) => f.status === "success" || f.status === "error");
    completedFiles.forEach((f) => {
      // 释放 ObjectURL
      const url = previewUrlsRef.current.get(f.id);
      if (url) {
        URL.revokeObjectURL(url);
        previewUrlsRef.current.delete(f.id);
      }
      // 从 useUpload 中移除
      remove(f.id);
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
