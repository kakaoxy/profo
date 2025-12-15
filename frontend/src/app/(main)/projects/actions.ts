"use server";

import { fetchClient } from "@/lib/api-server";
import { revalidatePath } from "next/cache";
import { components } from "@/lib/api-types";

// ==========================================
// 类型定义区
// ==========================================
type ProjectCreate = components["schemas"]["ProjectCreate"];
type ProjectUpdate = components["schemas"]["ProjectUpdate"];

// 定义后端标准响应结构
interface ApiResponse<T> {
  code: number;
  msg: string;
  data: T;
}

// ==========================================
// 基础项目操作 (Create / Update / Delete)
// ==========================================

export async function createProjectAction(data: ProjectCreate) {
  try {
    const client = await fetchClient();
    const { error } = await client.POST("/api/v1/projects", {
      body: data,
    });

    if (error) {
      const errorMsg = (error as { detail?: string }).detail || "创建项目失败";
      return { success: false, message: errorMsg };
    }

    revalidatePath("/projects");
    return { success: true, message: "项目创建成功" };
  } catch (e) {
    console.error("创建项目异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

export async function updateProjectAction(id: string, data: ProjectUpdate) {
  try {
    const client = await fetchClient();
    const { error } = await client.PUT("/api/v1/projects/{project_id}", {
      params: { path: { project_id: id } },
      body: data,
    });

    if (error) {
      const errorMsg = (error as { detail?: string }).detail || "更新项目失败";
      return { success: false, message: errorMsg };
    }

    revalidatePath("/projects");
    return { success: true, message: "项目更新成功" };
  } catch (e) {
    console.error("更新项目异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

export async function deleteProjectAction(id: string) {
  try {
    const client = await fetchClient();
    // [修复 1] 路径类型可能未同步，加回指令忽略 TS 检查
    // @ts-expect-error - delete endpoint types might be missing in current generation
    const { error } = await client.DELETE("/api/v1/projects/{project_id}", {
      params: { path: { project_id: id } },
    });

    if (error) {
      const errorMsg = (error as { detail?: string }).detail || "删除项目失败";
      return { success: false, message: errorMsg };
    }

    revalidatePath("/projects");
    return { success: true, message: "项目已删除" };
  } catch (e) {
    console.error("删除项目异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

// ==========================================
// 装修业务操作 (Renovation)
// ==========================================

/**
 * 获取装修照片列表
 */
export async function getRenovationPhotosAction(projectId: string) {
  try {
    const client = await fetchClient();

    const { data, error } = await client.GET(
      "/api/v1/projects/{project_id}/renovation/photos",
      {
        params: {
          path: { project_id: projectId },
        },
      }
    );

    if (error) {
      const errorMsg = (error as { detail?: string }).detail || "获取照片失败";
      return { success: false, message: errorMsg };
    }

    // [修复 2] 添加 eslint-disable 注释允许使用 any，因为 openapi 推断 data 为 unknown
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const responseData = data as unknown as ApiResponse<any[]>;

    return { success: true, data: responseData.data };
  } catch (e) {
    console.error("获取装修照片异常:", e);
    return { success: false, message: "网络错误" };
  }
}

/**
 * 添加装修照片
 */
export async function addRenovationPhotoAction(payload: {
  projectId: string;
  stage: string;
  url: string;
  filename?: string;
}) {
  try {
    const client = await fetchClient();

    const { error } = await client.POST(
      "/api/v1/projects/{project_id}/renovation/photos",
      {
        params: {
          path: { project_id: payload.projectId },
          query: {
            stage: payload.stage,
            url: payload.url,
            filename: payload.filename,
          },
        },
      }
    );

    if (error) {
      const errorMsg =
        (error as { detail?: string }).detail || "上传照片记录失败";
      return { success: false, message: errorMsg };
    }

    revalidatePath("/projects");
    return { success: true, message: "上传成功" };
  } catch (e) {
    console.error("上传照片异常:", e);
    return { success: false, message: "网络错误" };
  }
}

/**
 * 更新装修阶段 / 完成阶段
 */
export async function updateRenovationStageAction(payload: {
  projectId: string;
  renovation_stage: string;
  stage_completed_at?: string;
}) {
  try {
    const client = await fetchClient();

    const { error } = await client.PUT(
      "/api/v1/projects/{project_id}/renovation",
      {
        params: { path: { project_id: payload.projectId } },
        body: {
          // [修复 3] 添加 eslint-disable 注释，强制绕过后端中文枚举的类型检查
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          renovation_stage: payload.renovation_stage as any,

          stage_completed_at: payload.stage_completed_at,
        },
      }
    );

    if (error) {
      const errorMsg = (error as { detail?: string }).detail || "更新阶段失败";
      return { success: false, message: errorMsg };
    }

    revalidatePath("/projects");
    return { success: true, message: "阶段更新成功" };
  } catch (e) {
    console.error("更新阶段异常:", e);
    return { success: false, message: "网络错误" };
  }
}

export async function uploadFileAction(formData: FormData) {
  try {
    // 1. 获取基础 URL
    // FileUploader 使用的是 NEXT_PUBLIC_API_URL 或 http://127.0.0.1:8000
    // 我们保持一致，并去掉末尾的 /api/v1 (如果环境变量里包含的话)
    const envUrl = process.env.NEXT_PUBLIC_API_URL;
    const defaultUrl = "http://127.0.0.1:8000";
    const apiBase = (envUrl || defaultUrl).replace(/\/api\/v1\/?$/, "");

    // 2. 拼接正确的上传接口地址: /api/v1/files/upload (复数)
    const uploadUrl = `${apiBase}/api/v1/files/upload`;

    // console.log("正在上传文件到:", uploadUrl); // 调试用

    const res = await fetch(uploadUrl, {
      method: "POST",
      body: formData,
      // 注意：fetch 会自动处理 Content-Type header，不要手动设置
    });

    if (!res.ok) {
      // 尝试读取后端返回的错误详情
      const errorData = await res.json().catch(() => ({}));
      console.error("Upload failed:", errorData);
      return {
        success: false,
        message: errorData.detail || `上传失败: ${res.status}`,
      };
    }

    const json = await res.json();

    // 3. 校验业务状态码 (FileUploader 里判断的是 xhr.status，这里判断 json.code)
    // 根据您的后端代码，成功返回 { code: 200, data: { ... } }
    if (json.code !== 200) {
      return { success: false, message: json.msg || "上传被后端拒绝" };
    }

    // 4. 返回数据
    // 您的后端返回结构: { data: { url: "/static/...", filename: "..." } }
    return { success: true, data: json.data };
  } catch (e) {
    console.error("文件上传网络异常:", e);
    return { success: false, message: "网络连接错误，请检查后端服务是否启动" };
  }
}
