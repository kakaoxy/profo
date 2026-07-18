"use server";

import { logger } from "@/lib/logger";
import { fetchClient } from "@/lib/api-server";
import { revalidatePath } from "next/cache";
import { extractApiData } from "@/lib/api-helpers";
import { z } from "zod";
import { PERMISSION_CODES } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/server/require-permission";

interface UserSimple {
  id: string;
  nickname: string | null;
  username: string;
}

// ===== Zod 校验 schema（与后端 SalesRolesUpdate/SalesRecordCreate/ProjectCompleteRequest 语义对齐）=====
const projectIdSchema = z.string().min(1, "项目 ID 不能为空");
const recordIdSchema = z.string().min(1, "记录 ID 不能为空");

// 与 SalesRolesUpdate api-types:8332 对齐
const salesRolesUpdateSchema = z.object({
  channel_manager_id: z.string().nullable().optional(),
  property_agent_id: z.string().nullable().optional(),
  negotiator_id: z.string().nullable().optional(),
});

// 与 SalesRecordCreate api-types:7734 对齐（前端 payload 字段名 camelCase）
const salesRecordCreateSchema = z.object({
  recordType: z.enum(["viewing", "offer", "negotiation"], {
    error: "记录类型不合法",
  }),
  recordDate: z.string().min(1, "记录日期不能为空"),
  customerName: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  price: z.union([z.number(), z.string()]).nullable().optional(),
});

// 与 ProjectCompleteRequest api-types:5757 对齐（前端 payload 字段名 camelCase）
const projectCompleteSchema = z.object({
  soldPrice: z.union([z.number(), z.string()], {
    error: "成交价格必须为数字",
  }),
  soldDate: z.string().min(1, "成交日期不能为空"),
});

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
  const idParsed = projectIdSchema.safeParse(projectId);
  if (!idParsed.success) {
    return {
      success: false,
      message: idParsed.error.issues[0]?.message || "输入校验失败",
    };
  }
  const parsed = salesRolesUpdateSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message || "输入校验失败",
    };
  }
  const permCheck = await requirePermission(PERMISSION_CODES.PROJECT_WRITE);
  if (!permCheck.ok) {
    return { success: false, message: permCheck.message };
  }
  try {
    const client = await fetchClient();

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

    const { error, response } = await client.PUT(
      "/api/v1/projects/{project_id}/selling/roles",
      {
        params: { path: { project_id: projectId } },
        body: apiData,
      },
    );

    if (error) {
      const errorMsg = (error as { message?: string }).message || `更新销售角色失败 (${response.status})`;
      return { success: false, message: errorMsg };
    }

    revalidatePath("/admin/projects");
    return { success: true, message: "保存成功" };
  } catch (e) {
    logger.error("更新销售角色异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

/**
 * 获取简化用户列表（用于下拉选择）
 */
export async function getSalesUsersSimpleAction(): Promise<{
  success: boolean;
  data?: UserSimple[];
  message?: string;
}> {
  try {
    const client = await fetchClient();

    const { data, error, response } = await client.GET("/api/v1/users/simple");

    if (error) {
      const errorMsg = (error as { message?: string }).message || `获取用户列表失败 (${response.status})`;
      return { success: false, message: errorMsg };
    }

    if (data && typeof data === "object" && "items" in data) {
      return { success: true, data: (data.items as UserSimple[]) || [] };
    }

    return { success: true, data: [] };
  } catch (e) {
    logger.error("获取用户列表异常:", e);
    return { success: false, message: "网络错误" };
  }
}

/**
 * 获取当前登录用户（用于项目负责人默认值）
 */
export async function getCurrentUserAction(): Promise<{
  success: boolean;
  data?: UserSimple;
  message?: string;
}> {
  try {
    const client = await fetchClient();
    const { data, error, response } = await client.GET("/api/v1/auth/me");

    if (error) {
      const status = (response as Response | undefined)?.status;
      const errorMsg = (error as { message?: string }).message || `获取当前用户失败${status ? ` (${status})` : ""}`;
      return { success: false, message: errorMsg };
    }

    if (data && typeof data === "object" && "id" in data) {
      return {
        success: true,
        data: {
          id: (data as UserSimple).id,
          nickname: (data as UserSimple).nickname ?? null,
          username: (data as UserSimple).username,
        },
      };
    }

    return { success: false, message: "当前用户数据格式异常" };
  } catch (e) {
    logger.error("获取当前用户异常:", e);
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
  const parsed = salesRecordCreateSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message || "输入校验失败",
    };
  }
  const permCheck = await requirePermission(PERMISSION_CODES.PROJECT_WRITE);
  if (!permCheck.ok) {
    return { success: false, message: permCheck.message };
  }
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
      const errorMsg = (error as { message?: string }).message || "添加记录失败";
      return { success: false, message: errorMsg };
    }

    revalidatePath("/admin/projects");
    return { success: true, message: "记录已添加" };
  } catch (e) {
    logger.error("添加销售记录异常:", e);
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
  const idParsed = projectIdSchema.safeParse(projectId);
  if (!idParsed.success) {
    return {
      success: false,
      message: idParsed.error.issues[0]?.message || "输入校验失败",
    };
  }
  const recordParsed = recordIdSchema.safeParse(recordId);
  if (!recordParsed.success) {
    return {
      success: false,
      message: recordParsed.error.issues[0]?.message || "输入校验失败",
    };
  }
  const permCheck = await requirePermission(PERMISSION_CODES.PROJECT_WRITE);
  if (!permCheck.ok) {
    return { success: false, message: permCheck.message };
  }
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
      const errorMsg = (error as { message?: string }).message || "删除记录失败";
      return { success: false, message: errorMsg };
    }

    revalidatePath("/admin/projects");
    return { success: true, message: "记录已删除" };
  } catch (e) {
    logger.error("删除销售记录异常:", e);
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
  const idParsed = projectIdSchema.safeParse(projectId);
  if (!idParsed.success) {
    return {
      success: false,
      message: idParsed.error.issues[0]?.message || "输入校验失败",
    };
  }
  const parsed = projectCompleteSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message || "输入校验失败",
    };
  }
  const permCheck = await requirePermission(PERMISSION_CODES.PROJECT_WRITE);
  if (!permCheck.ok) {
    return { success: false, message: permCheck.message };
  }
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
      logger.error("成交操作失败:", error);
      return { success: false, message: "操作失败，请重试" };
    }

    revalidatePath("/admin/projects");
    const resultData = extractApiData<unknown>(data);
    return { success: true, message: "恭喜！项目已成交", data: resultData };
  } catch (e) {
    logger.error("成交操作异常:", e);
    return { success: false, message: "网络错误" };
  }
}
