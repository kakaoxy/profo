"use client";

import { useState } from "react";
import { toast } from "sonner";
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

  const handleUploadError = (itemId: string) => {
    setUploadQueue((prev) =>
      prev.map((p) =>
        p.id === itemId ? { ...p, status: "error", progress: 0 } : p
      )
    );
    toast.error("部分图片上传失败");
  };

  const uploadSingleFile = async (item: UploadingPhoto) => {
    const formData = new FormData();
    formData.append("file", item.file);

    const envUrl = process.env.NEXT_PUBLIC_API_URL;
    const apiBase = (envUrl || "http://localhost:8000").replace(
      /\/api\/v1\/?$/,
      ""
    );
    const uploadUrl = `${apiBase}/api/v1/files/upload`;

    return new Promise<void>((resolve) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          setUploadQueue((prev) =>
            prev.map((p) => (p.id === item.id ? { ...p, progress: percent } : p))
          );
        }
      };

      xhr.onload = async () => {
        if (xhr.status === 200) {
          try {
            const json = JSON.parse(xhr.responseText);
            if (json.code === 200 && json.data?.url) {
              const realUrl = json.data.url;
              const dbRes = await addRenovationPhotoAction({
                projectId,
                stage: stageValue,
                url: realUrl,
                filename: item.file.name,
              });

              if (dbRes.success) {
                setUploadQueue((prev) => prev.filter((p) => p.id !== item.id));
                URL.revokeObjectURL(item.previewUrl);
                onPhotoUploaded();
                resolve();
                return;
              }
            }
          } catch (e) {
            console.error("解析响应失败", e);
          }
        }
        handleUploadError(item.id);
        resolve();
      };

      xhr.onerror = () => {
        handleUploadError(item.id);
        resolve();
      };

      xhr.open("POST", uploadUrl);
      xhr.send(formData);
    });
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newUploads: UploadingPhoto[] = [];
    Array.from(files).forEach((file) => {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name} 过大，已跳过`);
        return;
      }
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
    newUploads.forEach((item) => uploadSingleFile(item));
  };

  return {
    uploadQueue,
    handleUpload,
    setUploadQueue,
  };
}
