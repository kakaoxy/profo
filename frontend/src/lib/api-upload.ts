import { components } from "@/lib/api-types";
import { API_BASE_URL } from "@/lib/config";

export type UploadResult = components["schemas"]["UploadResult"];

export const uploadCSV = (
  file: File,
  token: string,
  onProgress: (percent: number) => void
): Promise<UploadResult> => {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);

    const xhr = new XMLHttpRequest();
    // 使用集中的 API 配置
    xhr.open("POST", `${API_BASE_URL}/api/v1/upload/csv`);

    // 2. 关键修复：允许发送 Cookie (解决 401 的核心)
    // 即使我们手动加了 Header，加上这个也能确保浏览器的 HttpOnly Cookie 被后端接收作为双重保障
    xhr.withCredentials = true;

    // 3. 设置认证头 (用于调试，打印一下 token 是否存在)
    if (token) {
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    } else {
      console.warn("⚠️ UploadCSV: 未接收到 Token，尝试使用 Cookie 上传");
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(percent);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const result = JSON.parse(xhr.responseText);
          resolve(result);
        } catch (e) {
          console.error(e)
          reject(new Error("解析响应失败"));
        }
      } else {
        try {
          const error = JSON.parse(xhr.responseText);
          // 4. 优化错误提示
          reject(new Error(error.detail || `上传失败 (状态码: ${xhr.status})`));
        } catch {
          reject(new Error(`上传失败: ${xhr.statusText}`));
        }
      }
    };

    xhr.onerror = () => reject(new Error("网络错误，请检查后端服务是否启动"));
    xhr.send(formData);
  });
};