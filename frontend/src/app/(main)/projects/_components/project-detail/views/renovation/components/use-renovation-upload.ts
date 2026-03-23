"use client";

import { useState } from "react";
import { toast } from "sonner";
import { addRenovationPhotoAction } from "../../../../../actions/renovation";
import { UploadingPhoto } from "./photo-grid";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

// 尝试刷新 token
// 注意：调用 Next.js API 路由 /api/auth/refresh，它会从 httpOnly cookie 中读取 refresh_token
async function tryRefreshToken(): Promise<string | null> {
  try {
    // 调用 Next.js API 路由（不是直接调用后端）
    // 因为 refresh_token 存储在 httpOnly cookie 中，前端无法直接读取
    const response = await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    // 返回新的 access_token
    return data.access_token || null;
  } catch {
    return null;
  }
}

// 检查 token 是否过期
function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    const exp = payload.exp;
    const now = Math.floor(Date.now() / 1000);
    return exp < now;
  } catch {
    return true;
  }
}

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

    // 获取并检查 token
    let token = localStorage.getItem("access_token") || localStorage.getItem("token");

    // 检查 token 是否存在或过期
    const tokenExpired = token ? isTokenExpired(token) : true;
    if (!token || tokenExpired) {
      const newToken = await tryRefreshToken();
      if (newToken) {
        // 刷新成功，使用新 token
        token = newToken;
      } else {
        toast.error("登录已过期，请重新登录");
        handleUploadError(item.id);
        return;
      }
    }

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
            if (json.url) {
              const realUrl = json.url;
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
      xhr.withCredentials = true;

      // 添加认证头
      if (token) {
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      }

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
