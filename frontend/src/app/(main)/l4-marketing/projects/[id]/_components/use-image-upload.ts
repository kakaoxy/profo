"use client";

import { useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { API_BASE_URL } from "@/lib/config";
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
  onPhotosChange: (photos: L4MarketingMedia[]) => void;
}

interface UseImageUploadReturn {
  uploadingFiles: UploadProgress[];
  isUploading: boolean;
  uploadFiles: (files: FileList) => Promise<void>;
  setUploadingFiles: React.Dispatch<React.SetStateAction<UploadProgress[]>>;
}

// 获取有效的 access token
async function getValidToken(): Promise<string | null> {
  let token = localStorage.getItem("access_token") || localStorage.getItem("token");

  if (!token) {
    try {
      const response = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        token = data.access_token;
      }
    } catch {
      // ignore
    }
  }

  return token;
}

export function useImageUpload({
  projectId,
  uploadCategory,
  uploadStage,
  photos,
  onPhotosChange,
}: UseImageUploadOptions): UseImageUploadReturn {
  const [uploadingFiles, setUploadingFiles] = useState<UploadProgress[]>([]);
  const isUploading = uploadingFiles.length > 0;

  // 使用 ref 存储 photos 和 onPhotosChange，避免频繁变化导致 useCallback 重建
  const photosRef = useRef(photos);
  const onPhotosChangeRef = useRef(onPhotosChange);

  // 同步 ref 值
  photosRef.current = photos;
  onPhotosChangeRef.current = onPhotosChange;

  const uploadFile = useCallback(
    async (file: File): Promise<boolean> => {
      // 验证文件类型
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        toast.error(`${file.name}: 不支持的文件格式，仅支持 JPG, PNG, GIF, WebP`);
        return false;
      }

      // 验证文件大小
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name}: 文件过大，最大支持 10MB`);
        return false;
      }

      // 添加到上传队列
      setUploadingFiles((prev) => [...prev, { filename: file.name, progress: 0 }]);

      // 获取有效 token
      const token = await getValidToken();
      if (!token) {
        setUploadingFiles((prev) => prev.filter((f) => f.filename !== file.name));
        toast.error("登录已过期，请重新登录");
        return false;
      }

      return new Promise((resolve) => {
        const formData = new FormData();
        formData.append("file", file);

        const xhr = new XMLHttpRequest();
        const uploadUrl = `${API_BASE_URL}/api/v1/files/upload`;

        xhr.open("POST", uploadUrl);
        xhr.withCredentials = true;

        if (token) {
          xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        }

        // 进度监听
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            setUploadingFiles((prev) =>
              prev.map((f) =>
                f.filename === file.name ? { ...f, progress: percent } : f
              )
            );
          }
        };

        // 完成处理
        xhr.onload = () => {
          setUploadingFiles((prev) => prev.filter((f) => f.filename !== file.name));

          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const result = JSON.parse(xhr.responseText);
              const fileUrl = result.url || result.file_url || result.data?.url;

              if (!fileUrl) {
                toast.error(`${file.name}: 解析响应失败`);
                resolve(false);
                return;
              }

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
                resolve(true);
                return;
              }

              // 有 projectId（编辑模式），创建媒体记录
              createL4MarketingMediaAction(projectId, {
                file_url: fileUrl,
                media_type: "image",
                photo_category: uploadCategory as any,
                renovation_stage: uploadCategory === "renovation" ? uploadStage : null,
                sort_order: nextSortOrder,
              } as any).then((createResult) => {
                if (createResult.success && createResult.data) {
                  currentOnPhotosChange([...currentPhotos, createResult.data as L4MarketingMedia]);
                  toast.success(`${file.name}: 上传成功`);
                  resolve(true);
                } else {
                  toast.error(createResult.error || `${file.name}: 保存记录失败`);
                  resolve(false);
                }
              });
            } catch {
              toast.error(`${file.name}: 解析响应失败`);
              resolve(false);
            }
          } else {
            if (xhr.status === 401) {
              toast.error(`${file.name}: 上传失败`, {
                description: "登录已过期，请刷新页面后重试",
              });
            } else {
              try {
                const error = JSON.parse(xhr.responseText);
                toast.error(`${file.name}: 上传失败`, {
                  description: error.detail || `状态码: ${xhr.status}`,
                });
              } catch {
                toast.error(`${file.name}: 上传失败`);
              }
            }
            resolve(false);
          }
        };

        xhr.onerror = () => {
          setUploadingFiles((prev) => prev.filter((f) => f.filename !== file.name));
          toast.error(`${file.name}: 网络错误`);
          resolve(false);
        };

        xhr.send(formData);
      });
    },
    // 只保留稳定的依赖：projectId, uploadStage, uploadSortOrder
    [projectId, uploadCategory, uploadStage]
  );

  const uploadFiles = useCallback(
    async (files: FileList) => {
      const fileArray = Array.from(files);
      if (fileArray.length > 1) {
        toast.info(`开始上传 ${fileArray.length} 个文件...`);
      }

      const results = await Promise.all(fileArray.map((file) => uploadFile(file)));
      const successCount = results.filter(Boolean).length;

      if (fileArray.length > 1) {
        toast.success(`上传完成`, {
          description: `成功 ${successCount} 个，共 ${fileArray.length} 个文件`,
        });
      }
    },
    [uploadFile]
  );

  return {
    uploadingFiles,
    isUploading,
    uploadFiles,
    setUploadingFiles,
  };
}
