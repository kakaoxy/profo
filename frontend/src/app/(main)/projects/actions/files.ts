"use server";

import { API_BASE_URL } from "@/lib/config";
import { getValidAccessToken } from "@/lib/token-refresh-server";

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

    const apiBase = API_BASE_URL.replace(/\/api\/v1\/?$/, "");
    const uploadUrl = `${apiBase}/api/v1/files/upload`;

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

    // HTTP 2xx 表示成功，直接解析响应体
    // 后端成功响应格式: { "url": "...", "filename": "..." }
    const json = await res.json();
    return { success: true, data: json };
  } catch (e) {
    console.error("文件上传网络异常:", e);
    return { success: false, message: "网络连接错误，请检查后端服务是否启动" };
  }
}
