"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";
import { useUpload } from "@/components/common/upload";
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
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      const validFiles: File[] = [];
      const newUploads: UploadingPhoto[] = [];

      Array.from(files).forEach((file) => {
        if (file.size > MAX_FILE_SIZE) {
          toast.error(`${file.name} 过大，已跳过`);
          return;
        }
        validFiles.push(file);
        const previewUrl = URL.createObjectURL(file);
        newUploads.push({
          id: Math.random().toString(36).substring(7),
          file,
          previewUrl,
          progress: 0,
          status: "uploading",
        });
      });

      if (newUploads.length === 0) {
        e.target.value = "";
        return;
      }

      setUploadQueue((prev) => [...prev, ...newUploads]);
      e.target.value = "";
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
