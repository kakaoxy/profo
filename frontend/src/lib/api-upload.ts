import { components } from "@/lib/api-types";
import { getClientApiUrl } from "@/lib/config";

/**
 * CSV上传结果（同步上传接口已弃用，类型手动定义）
 */
export interface UploadResult {
  total: number;
  success: number;
  failed: number;
  failed_file_url?: string;
}

export type ImportTaskCreateResponse = components["schemas"]["ImportTaskCreateResponse"];
export type ImportTaskStatusResponse = components["schemas"]["ImportTaskStatusResponse"];

/**
 * 同步上传 CSV 文件（已弃用，仅用于小文件）
 */
export const uploadCSV = (
  file: File,
  onProgress: (percent: number) => void
): Promise<UploadResult> => {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", getClientApiUrl("/api/v1/upload/csv-sync"));

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

/**
 * 创建异步导入任务
 * 返回任务ID，之后需要轮询查询任务状态
 */
export const createImportTask = async (file: File): Promise<ImportTaskCreateResponse> => {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(getClientApiUrl("/api/v1/upload/csv"), {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `创建导入任务失败 (状态码: ${response.status})`);
  }

  return response.json();
};

/**
 * 查询导入任务状态
 */
export const getImportTaskStatus = async (taskId: string): Promise<ImportTaskStatusResponse> => {
  const response = await fetch(getClientApiUrl(`/api/v1/upload/tasks/${taskId}`), {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `查询任务状态失败 (状态码: ${response.status})`);
  }

  return response.json();
};

/**
 * 获取用户的导入任务列表
 */
export const listImportTasks = async (limit: number = 10): Promise<ImportTaskStatusResponse[]> => {
  const response = await fetch(getClientApiUrl(`/api/v1/upload/tasks?limit=${limit}`), {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `获取任务列表失败 (状态码: ${response.status})`);
  }

  return response.json();
};

/**
 * 取消导入任务
 */
export const cancelImportTask = async (taskId: string): Promise<void> => {
  const response = await fetch(getClientApiUrl(`/api/v1/upload/tasks/${taskId}/cancel`), {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `取消任务失败 (状态码: ${response.status})`);
  }
};

/**
 * 轮询任务状态直到完成
 * @param taskId 任务ID
 * @param onProgress 进度回调
 * @param options 轮询选项
 * @returns 最终任务状态
 */
export const pollTaskStatus = async (
  taskId: string,
  onProgress: (status: ImportTaskStatusResponse) => void,
  options: {
    interval?: number;      // 轮询间隔（毫秒），默认 2000ms
    timeout?: number;       // 超时时间（毫秒），默认 10 分钟
    onCancel?: () => boolean; // 取消检查函数，返回 true 则停止轮询
  } = {}
): Promise<ImportTaskStatusResponse> => {
  const { interval = 2000, timeout = 10 * 60 * 1000, onCancel } = options;
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const checkStatus = async () => {
      try {
        // 检查是否被取消
        if (onCancel && onCancel()) {
          reject(new Error("任务轮询已取消"));
          return;
        }

        // 检查是否超时
        if (Date.now() - startTime > timeout) {
          reject(new Error("任务处理超时，请稍后查询任务状态"));
          return;
        }

        // 查询任务状态
        const status = await getImportTaskStatus(taskId);
        onProgress(status);

        // 检查任务是否完成
        if (status.status === "completed" || status.status === "failed" || status.status === "cancelled") {
          resolve(status);
          return;
        }

        // 继续轮询
        setTimeout(checkStatus, interval);
      } catch (error) {
        reject(error);
      }
    };

    // 开始轮询
    checkStatus();
  });
};
