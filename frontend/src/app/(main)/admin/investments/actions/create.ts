"use server";

import { revalidatePath } from "next/cache";
import { fetchClient } from "@/lib/api-server";
import { extractApiData } from "@/lib/api-helpers";
import { logger } from "@/lib/logger";
import type {
  ActionResult,
  InvestmentCreate,
  InvestmentResponse,
  InvestmentUpdate,
  InvestorCreate,
  InvestorResponse,
  InvestorUpdate,
} from "./types";

/**
 * 创建跟投记录（成功后 revalidatePath 刷新列表）
 */
export async function createInvestment(
  data: InvestmentCreate,
): Promise<ActionResult<InvestmentResponse>> {
  try {
    const client = await fetchClient();
    const { data: resData, error } = await client.POST("/api/v1/admin/investments", {
      body: data,
    });

    if (error) {
      const msg = (error as { detail?: string }).detail || "创建跟投记录失败";
      return { success: false, message: msg };
    }

    revalidatePath("/admin/investments");
    return {
      success: true,
      data: extractApiData<InvestmentResponse>(resData),
    };
  } catch (e) {
    logger.error("创建跟投记录异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

/**
 * 更新跟投记录基础信息（投资总额 / 收益总额 / 备注）
 * 调用 PUT /api/v1/admin/investments/{id}。仅 unsettled 可改；改总额触发后端金额重算。
 */
export async function updateInvestment(
  id: string,
  data: InvestmentUpdate,
): Promise<ActionResult<InvestmentResponse>> {
  try {
    const client = await fetchClient();
    const { data: resData, error } = await client.PUT(
      "/api/v1/admin/investments/{investment_id}",
      { params: { path: { investment_id: id } }, body: data },
    );

    if (error) {
      const msg = (error as { detail?: string }).detail || "更新跟投记录失败";
      return { success: false, message: msg };
    }

    revalidatePath("/admin/investments/[projectId]", "page");
    revalidatePath("/admin/investments");
    return {
      success: true,
      data: extractApiData<InvestmentResponse>(resData),
    };
  } catch (e) {
    logger.error("更新跟投记录异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

/**
 * 软删除跟投记录
 * 调用 DELETE /api/v1/admin/investments/{id}。
 */
export async function deleteInvestment(
  investmentId: string,
): Promise<ActionResult<null>> {
  try {
    const client = await fetchClient();
    const { error } = await client.DELETE(
      "/api/v1/admin/investments/{investment_id}",
      { params: { path: { investment_id: investmentId } } },
    );

    if (error) {
      const msg = (error as { detail?: string }).detail || "删除跟投记录失败";
      return { success: false, message: msg };
    }

    revalidatePath("/admin/investments");
    return { success: true, data: null };
  } catch (e) {
    logger.error("删除跟投记录异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

/**
 * 添加投资方（含子投资人）
 * 调用 POST /api/v1/admin/investments/{id}/investors。
 */
export async function addInvestor(
  investmentId: string,
  data: InvestorCreate,
): Promise<ActionResult<InvestorResponse>> {
  try {
    const client = await fetchClient();
    const { data: resData, error } = await client.POST(
      "/api/v1/admin/investments/{investment_id}/investors",
      { params: { path: { investment_id: investmentId } }, body: data },
    );

    if (error) {
      const msg = (error as { detail?: string }).detail || "添加投资方失败";
      return { success: false, message: msg };
    }

    revalidatePath("/admin/investments/[projectId]", "page");
    return {
      success: true,
      data: extractApiData<InvestorResponse>(resData),
    };
  } catch (e) {
    logger.error("添加投资方异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

/**
 * 更新投资方（sub_investors 整体替换）
 * 调用 PUT /api/v1/admin/investments/{id}/investors/{investor_id}。
 */
export async function updateInvestor(
  investmentId: string,
  investorId: string,
  data: InvestorUpdate,
): Promise<ActionResult<InvestorResponse>> {
  try {
    const client = await fetchClient();
    const { data: resData, error } = await client.PUT(
      "/api/v1/admin/investments/{investment_id}/investors/{investor_id}",
      {
        params: {
          path: { investment_id: investmentId, investor_id: investorId },
        },
        body: data,
      },
    );

    if (error) {
      const msg = (error as { detail?: string }).detail || "更新投资方失败";
      return { success: false, message: msg };
    }

    revalidatePath("/admin/investments/[projectId]", "page");
    return {
      success: true,
      data: extractApiData<InvestorResponse>(resData),
    };
  } catch (e) {
    logger.error("更新投资方异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

/**
 * 删除投资方（级联删除子投资人）
 * 调用 DELETE /api/v1/admin/investments/{id}/investors/{investor_id}。
 */
export async function deleteInvestor(
  investmentId: string,
  investorId: string,
): Promise<ActionResult<null>> {
  try {
    const client = await fetchClient();
    const { error } = await client.DELETE(
      "/api/v1/admin/investments/{investment_id}/investors/{investor_id}",
      {
        params: {
          path: { investment_id: investmentId, investor_id: investorId },
        },
      },
    );

    if (error) {
      const msg = (error as { detail?: string }).detail || "删除投资方失败";
      return { success: false, message: msg };
    }

    revalidatePath("/admin/investments/[projectId]", "page");
    return { success: true, data: null };
  } catch (e) {
    logger.error("删除投资方异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}
