"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";
import { useUpload, compressImage } from "@/components/common/upload";
import { addRenovationPhotoAction } from "../../../../../actions/renovation";
import { UploadingPhoto } from "./photo-grid";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

interface UseRenovationUploadProps {
  projectId: string;
  stageValue: string;
  onPhotoUploaded: () => void;
}

export function useRenovationUpload({
  projectId,
  stageValue,
  onPhotoUploaded,
}: UseRenovationUploadProps) {
  const [uploadQueue, setUploadQueue] = useState<UploadingPhoto[]>([]);
  const onPhotoUploadedRef = useRef(onPhotoUploaded);

  useEffect(() => {
    onPhotoUploadedRef.current = onPhotoUploaded;
  }, [onPhotoUploaded]);

  const { upload: baseUpload } = useUpload({
    maxSize: MAX_FILE_SIZE,
    onSuccess: async (response, file) => {
      const dbRes = await addRenovationPhotoAction({
        projectId,
        stage: stageValue,
        url: response.url,
        thumbnail_url: response.thumbnail_url,
        filename: file.name,
      });

      if (dbRes.success) {
        setUploadQueue((prev) => {
          const idx = prev.findIndex((p) => p.file === file);
          if (idx !== -1) {
            const item = prev[idx];
            URL.revokeObjectURL(item.previewUrl);
            return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
          }
          return prev;
        });
        toast.success(`${file.name} 上传成功`);
        onPhotoUploadedRef.current();
      } else {
        setUploadQueue((prev) =>
          prev.map((p) =>
            p.file === file ? { ...p, status: "error" as const, progress: 0 } : p
          )
        );
        toast.error(`保存照片记录失败: ${dbRes.message}`);
      }
    },
    onError: (error, file) => {
      setUploadQueue((prev) =>
        prev.map((p) =>
          p.file === file ? { ...p, status: "error" as const, progress: 0 } : p
        )
      );
      toast.error(error.message || "部分图片上传失败");
    },
    onProgress: (progress) => {
      setUploadQueue((prev) =>
        prev.map((p) =>
          p.file === progress.file ? { ...p, progress: progress.progress } : p
        )
      );
    },
  });

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      // 必须在重置 input.value 之前将 FileList 转为数组快照，
      // 否则 e.target.value = "" 会清空 FileList，files 引用也变为空，
      // 导致后续 Array.from(files) 返回空数组，上传流程静默中止
      const fileArray = Array.from(files);

      // 提前重置 input.value，避免 await 压缩期间用户无法再次选择同名文件
      e.target.value = "";

      // 预先压缩（并行）：让 uploadQueue 存储的 file 引用与 useUpload 回调里收到的引用一致，
      // 否则 compressImage 返回新 File 对象后，回调按 p.file === file 匹配会失败，
      // 导致上传成功的队列项无法被移除（残留"上传中"占位）
      const processedResults = await Promise.all(
        fileArray.map(async (file) => {
          if (file.size > MAX_FILE_SIZE) {
            toast.error(`${file.name} 过大，已跳过`);
            return null;
          }
          const processedFile = await compressImage(file);
          const previewUrl = URL.createObjectURL(processedFile);
          return {
            processedFile,
            previewUrl,
            id: Math.random().toString(36).substring(7),
          };
        }),
      );

      const validFiles: File[] = [];
      const newUploads: UploadingPhoto[] = [];
      for (const result of processedResults) {
        if (!result) continue;
        validFiles.push(result.processedFile);
        newUploads.push({
          id: result.id,
          file: result.processedFile,
          previewUrl: result.previewUrl,
          progress: 0,
          status: "uploading",
        });
      }

      if (newUploads.length === 0) {
        return;
      }

      setUploadQueue((prev) => [...prev, ...newUploads]);
      baseUpload(validFiles);
    },
    [baseUpload]
  );

  return {
    uploadQueue,
    handleUpload,
    setUploadQueue,
  };
}
