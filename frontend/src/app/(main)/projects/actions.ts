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
// 1. 基础项目操作 (CRUD)
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

// [Restored] This was missing in your provided code
export async function deleteProjectAction(id: string) {
  try {
    const client = await fetchClient();
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
// 2. 装修业务操作 (Renovation)
// ==========================================

/**
 * 删除装修照片
 */
export async function deleteRenovationPhotoAction(
  projectId: string,
  photoId: string
) {
  try {
    const client = await fetchClient();

    // 直接调用 client.DELETE，TypeScript 现在能正确推断参数了
    const { error } = await client.DELETE(
      "/api/v1/projects/{project_id}/renovation/photos/{photo_id}",
      {
        params: {
          path: {
            project_id: projectId,
            photo_id: photoId,
          },
        },
      }
    );

    if (error) {
      // error 类型通常为 { detail?: string } 或 unknown
      const errorMsg = (error as { detail?: string })?.detail || "删除照片失败";
      return { success: false, message: errorMsg };
    }

    revalidatePath("/projects");
    return { success: true, message: "照片已删除" };
  } catch (e) {
    console.error("删除照片异常:", e);
    return { success: false, message: "网络错误" };
  }
}

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

// ==========================================
// 3. 通用文件上传 Action
// ==========================================

export async function uploadFileAction(formData: FormData) {
  try {
    // 1. 获取基础 URL
    const envUrl = process.env.NEXT_PUBLIC_API_URL;
    const defaultUrl = "http://127.0.0.1:8000";
    const apiBase = (envUrl || defaultUrl).replace(/\/api\/v1\/?$/, "");

    // 2. 拼接正确的上传接口地址: /api/v1/files/upload (复数)
    const uploadUrl = `${apiBase}/api/v1/files/upload`;

    const res = await fetch(uploadUrl, {
      method: "POST",
      body: formData,
      // 注意：fetch 会自动处理 Content-Type header，不要手动设置
    });

    if (!res.ok) {
      // [新增] 专门处理 413 Payload Too Large
      if (res.status === 413) {
        return { success: false, message: "文件大小超过服务器限制 (10MB)" };
      }

      const errorText = await res.text();
      console.error("❌ [Upload Action] Failed:", res.status, errorText);

      // 尝试解析 JSON 错误，如果解析失败则返回状态码
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

    const json = await res.json();

    // 3. 校验业务状态码
    if (json.code !== 200) {
      return { success: false, message: json.msg || "上传被后端拒绝" };
    }

    // 4. 返回数据
    return { success: true, data: json.data };
  } catch (e) {
    console.error("文件上传网络异常:", e);
    return { success: false, message: "网络连接错误，请检查后端服务是否启动" };
  }
}

/**
 * 更新项目主状态 (例如: signing -> renovating)
 */
export async function updateProjectStatusAction(
  projectId: string,
  status: string
) {
  try {
    const client = await fetchClient();

    const { error } = await client.PUT("/api/v1/projects/{project_id}/status", {
      params: { path: { project_id: projectId } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      body: { status: status as any },
    });

    if (error) {
      const errorMsg = (error as { detail?: string }).detail || "状态更新失败";
      return { success: false, message: errorMsg };
    }

    revalidatePath("/projects");
    return { success: true, message: "状态已更新" };
  } catch (e) {
    console.error("更新状态异常:", e);
    return { success: false, message: "网络错误" };
  }
}

/**
 * [新增] 获取项目详情 (Server Action)
 * 供 Client Component 调用以刷新数据，避免直接引入 api-server 导致崩溃
 */
export async function getProjectDetailAction(projectId: string) {
  try {
    const client = await fetchClient();
    const { data, error } = await client.GET("/api/v1/projects/{project_id}", {
      params: { path: { project_id: projectId } },
    });

    if (error) {
      return { success: false, message: "获取详情失败" };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { success: true, data: (data as any).data };
  } catch (e) {
    console.error("获取详情异常:", e);
    return { success: false, message: "网络错误" };
  }
}

// ==========================================
// 4. 销售业务操作 (Sales/Selling)
// ==========================================

/**
 * 创建销售记录 (带看/出价/面谈)
 */
export async function createSalesRecordAction(payload: {
  projectId: string;
  recordType: "viewing" | "offer" | "negotiation";
  customerName?: string;
  price?: number;
  recordDate: string;
  notes?: string;
}) {
  try {
    const client = await fetchClient();

    // 1. 类型映射：前端 "offer" -> 后端 "offer"
    const backendRecordType =
      payload.recordType === "offer" ? "offer" : payload.recordType;

    // 2. 构造请求 Body
    const requestBody = {
      record_type: backendRecordType as "viewing" | "offer" | "negotiation",
      customer_name: payload.customerName,
      price: payload.price,
      record_date: payload.recordDate,
      notes: payload.notes,
      result: null,
      feedback: null,
    };

    let result;

    // 3. 动态分发请求
    if (payload.recordType === "viewing") {
      result = await client.POST(
        "/api/v1/projects/{project_id}/selling/viewings",
        {
          params: { path: { project_id: payload.projectId } },
          body: requestBody,
        }
      );
    } else if (payload.recordType === "offer") {
      result = await client.POST(
        "/api/v1/projects/{project_id}/selling/offers",
        {
          params: { path: { project_id: payload.projectId } },
          body: requestBody,
        }
      );
    } else if (payload.recordType === "negotiation") {
      result = await client.POST(
        "/api/v1/projects/{project_id}/selling/negotiations",
        {
          params: { path: { project_id: payload.projectId } },
          body: requestBody,
        }
      );
    } else {
      return { success: false, message: "未知的记录类型" };
    }

    const { error } = result;

    if (error) {
      const errorMsg = error.detail || "添加记录失败";
      return { success: false, message: errorMsg };
    }

    revalidatePath("/projects");
    return { success: true, message: "记录已添加" };
  } catch (e) {
    console.error("添加销售记录异常:", e);
    return { success: false, message: "网络错误" };
  }
}

/**
 * 删除销售记录
 */
export async function deleteSalesRecordAction(
  projectId: string,
  recordId: string
) {
  try {
    const client = await fetchClient();

    const { error } = await client.DELETE(
      "/api/v1/projects/{project_id}/selling/records/{record_id}",
      {
        params: {
          path: {
            project_id: projectId,
            record_id: recordId,
          },
        },
      }
    );

    if (error) {
      const errorMsg = error.detail || "删除记录失败";
      return { success: false, message: errorMsg };
    }

    revalidatePath("/projects");
    return { success: true, message: "记录已删除" };
  } catch (e) {
    console.error("删除销售记录异常:", e);
    return { success: false, message: "网络错误" };
  }
}

/**
 * 完成项目 (成交)
 * 同时更新状态为 SOLD 并保存成交信息
 */
export async function completeProjectAction(
  projectId: string,
  payload: { soldPrice: number; soldDate: string }
) {
  const client = await fetchClient();

  // 调用后端专门的完成接口
  const { data, error } = await client.POST(
    "/api/v1/projects/{project_id}/complete",
    {
      params: {
        path: { project_id: projectId },
      },
      body: {
        // 这里的字段名要对应后端 ProjectCompleteRequest 模型
        sold_price: payload.soldPrice,
        sold_date: payload.soldDate,
      },
    }
  );

  if (error) {
    console.error("成交操作失败:", error);
    return { success: false, message: "操作失败，请重试" };
  }

  revalidatePath("/projects");

  return { success: true, message: "恭喜！项目已成交", data };
}
