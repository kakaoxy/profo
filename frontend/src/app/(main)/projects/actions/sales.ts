"use server";

import { fetchClient } from "@/lib/api-server";
import { revalidatePath } from "next/cache";

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
  payload: { soldPrice: number; soldDate: string }
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          soldPrice: payload.soldPrice as any,
          soldDate: payload.soldDate,
        },
      }
    );

    if (error) {
      console.error("成交操作失败:", error);
      return { success: false, message: "操作失败，请重试" };
    }

    revalidatePath("/projects");
    return { success: true, message: "恭喜！项目已成交", data };
  } catch (e) {
    console.error("成交操作异常:", e);
    return { success: false, message: "网络错误" };
  }
}
