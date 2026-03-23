"use server";

import { fetchClient } from "@/lib/api-server";
import { revalidatePath } from "next/cache";
import { extractApiData } from "@/lib/api-helpers";
import { API_BASE_URL } from "@/lib/config";
import { cookies } from "next/headers";

interface UserSimple {
  id: string;
  nickname: string | null;
  username: string;
}

/**
 * 更新销售角色
 */
export async function updateSalesRolesAction(
  projectId: string,
  data: {
    channel_manager_id?: string | null;
    property_agent_id?: string | null;
    negotiator_id?: string | null;
  },
) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("access_token")?.value;

    // 字段映射：前端新字段名 -> 后端API字段名
    const apiData: Record<string, string | null | undefined> = {};
    if ("channel_manager_id" in data) {
      apiData.channel_manager = data.channel_manager_id;
    }
    if ("property_agent_id" in data) {
      apiData.presenter = data.property_agent_id;
    }
    if ("negotiator_id" in data) {
      apiData.negotiator = data.negotiator_id;
    }

    const response = await fetch(
      `${API_BASE_URL}/api/v1/projects/${projectId}/selling/roles`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(apiData),
      },
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        message: errorData.detail || `更新销售角色失败 (${response.status})`,
      };
    }

    revalidatePath("/projects");
    return { success: true, message: "保存成功" };
  } catch (e) {
    console.error("更新销售角色异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

/**
 * 获取简化用户列表（用于下拉选择）
 */
export async function getUsersSimpleAction(): Promise<{
  success: boolean;
  data?: UserSimple[];
  message?: string;
}> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("access_token")?.value;

    const response = await fetch(`${API_BASE_URL}/api/v1/users/simple`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: "no-store",
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        message: errorData.detail || `获取用户列表失败 (${response.status})`,
      };
    }

    const data = await response.json();

    if (data && typeof data === "object" && "items" in data) {
      return { success: true, data: (data.items as UserSimple[]) || [] };
    }

    return { success: true, data: [] };
  } catch (e) {
    console.error("获取用户列表异常:", e);
    return { success: false, message: "网络错误" };
  }
}

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
        },
      );
    } else if (payload.recordType === "offer") {
      result = await client.POST(
        "/api/v1/projects/{project_id}/selling/offers",
        {
          params: { path: { project_id: payload.projectId } },
          body: requestBody,
        },
      );
    } else if (payload.recordType === "negotiation") {
      result = await client.POST(
        "/api/v1/projects/{project_id}/selling/negotiations",
        {
          params: { path: { project_id: payload.projectId } },
          body: requestBody,
        },
      );
    } else {
      return { success: false, message: "未知的记录类型" };
    }

    const { error } = result;

    if (error) {
      const errorMsg = (error as { detail?: string }).detail || "添加记录失败";
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
  recordId: string,
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
      },
    );

    if (error) {
      const errorMsg = (error as { detail?: string }).detail || "删除记录失败";
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
 */
export async function completeProjectAction(
  projectId: string,
  payload: { soldPrice: number; soldDate: string },
) {
  try {
    const client = await fetchClient();
    const { data, error } = await client.POST(
      "/api/v1/projects/{project_id}/complete",
      {
        params: {
          path: { project_id: projectId },
        },
        body: {
          sold_price: payload.soldPrice,
          sold_date: payload.soldDate,
        },
      },
    );

    if (error) {
      console.error("成交操作失败:", error);
      return { success: false, message: "操作失败，请重试" };
    }

    revalidatePath("/projects");
    const resultData = extractApiData<unknown>(data);
    return { success: true, message: "恭喜！项目已成交", data: resultData };
  } catch (e) {
    console.error("成交操作异常:", e);
    return { success: false, message: "网络错误" };
  }
}
