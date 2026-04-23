import { components } from "@/lib/api-types";
import { getClientApiUrl } from "@/lib/config";

export type UploadResult = components["schemas"]["UploadResult"];

export const uploadCSV = (
  file: File,
  onProgress: (percent: number) => void
): Promise<UploadResult> => {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", getClientApiUrl("/api/v1/upload/csv"));

    // 允许发送 Cookie，让浏览器自动携带 httpOnly cookie 进行认证
    xhr.withCredentials = true;

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
          console.error(e);
          reject(new Error("解析响应失败"));
        }
      } else {
        try {
          const error = JSON.parse(xhr.responseText);
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