"use server";

import { apiPaths, getApiUrl } from "@/lib/config";
import { getValidAccessToken } from "@/lib/token-refresh-server";

export interface FileUploadResponse {
  url: string;
  filename: string;
}

/**
 * 验证后端响应格式是否为有效的 FileUploadResponse
 */
function isValidFileUploadResponse(data: unknown): data is FileUploadResponse {
  if (typeof data !== "object" || data === null) {
    return false;
  }

  const { url } = data as Record<string, unknown>;

  return typeof url === "string" && url.length > 0;
}

/**
 * 通用文件上传 Action
 * 使用 httpOnly cookie 中的 token 进行认证，避免在客户端暴露 token
 */
export async function uploadFileAction(formData: FormData) {
  try {
    // 从服务端获取有效的 access_token（自动处理刷新）
    const token = await getValidAccessToken();

    if (!token) {
      return { success: false, message: "登录已过期，请重新登录" };
    }

    const uploadUrl = getApiUrl(apiPaths.files.upload);

    const res = await fetch(uploadUrl, {
      method: "POST",
      body: formData,
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      if (res.status === 401) {
        return { success: false, message: "登录已过期，请重新登录" };
      }
      if (res.status === 413) {
        return { success: false, message: "文件大小超过服务器限制 (10MB)" };
      }

      const errorText = await res.text();
      console.error("❌ [Upload Action] Failed:", res.status, errorText);

      try {
        const errorJson = JSON.parse(errorText);
        return {
          success: false,
          message: errorJson.detail || `上传失败 (${res.status})`,
        };
      } catch {
        return { success: false, message: `上传失败 (${res.status})` };
      }
    }

    // HTTP 2xx 表示成功，解析并验证响应体格式
    // 后端成功响应格式: { "url": "...", "filename": "..." }
    const json = await res.json();

    if (!isValidFileUploadResponse(json)) {
      console.error("❌ [Upload Action] Invalid response format:", json);
      return { success: false, message: "服务器返回的数据格式无效" };
    }

    return { success: true, data: json };
  } catch (e) {
    console.error("文件上传网络异常:", e);
    return { success: false, message: "网络连接错误，请检查后端服务是否启动" };
  }
}
