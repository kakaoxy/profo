"use client";

/**
 * 装修照片上传 Hook
 * 流程特殊（上传→入库→刷新），保留原有结构，仅复用通用工具函数
 */

import { useState } from "react";
import { toast } from "sonner";
import { apiPaths, getClientApiUrl } from "@/lib/config";
import { tryRefreshToken, isTokenExpired } from "@/components/common/upload";
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

  const handleUploadError = (itemId: string, message?: string) => {
    setUploadQueue((prev) =>
      prev.map((p) =>
        p.id === itemId ? { ...p, status: "error", progress: 0 } : p
      )
    );
    toast.error(message || "部分图片上传失败");
  };

  const uploadSingleFile = async (item: UploadingPhoto) => {
    const formData = new FormData();
    formData.append("file", item.file);

    const uploadUrl = getClientApiUrl(apiPaths.files.upload);

    // 获取并检查 token
    let token = localStorage.getItem("access_token") || localStorage.getItem("token");

    // 检查 token 是否存在或过期
    const tokenExpired = token ? isTokenExpired(token) : true;
    if (!token || tokenExpired) {
      const newToken = await tryRefreshToken();
      if (newToken) {
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
        // 检查 2xx 状态码（修复：原代码只检查 200）
        if (xhr.status >= 200 && xhr.status < 300) {
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
              } else {
                handleUploadError(item.id, `保存照片记录失败: ${dbRes.message}`);
              }
            } else {
              console.error("[Renovation Upload] 响应中没有 url 字段:", json);
              handleUploadError(item.id, "服务器返回的数据格式无效");
            }
          } catch (e) {
            console.error("[Renovation Upload] 解析响应失败", e);
            handleUploadError(item.id, "解析服务器响应失败");
          }
        } else {
          // 处理非 2xx 状态码
          try {
            const errorJson = JSON.parse(xhr.responseText);
            const errorMsg = errorJson.detail || `上传失败 (${xhr.status})`;
            handleUploadError(item.id, errorMsg);
          } catch {
            handleUploadError(item.id, `上传失败 (${xhr.status})`);
          }
        }
        resolve();
      };

      xhr.onerror = () => {
        handleUploadError(item.id, "网络错误，请检查网络连接");
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
