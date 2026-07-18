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
import { z } from "zod";
import { PERMISSION_CODES } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/server/require-permission";

// ===== Zod 校验 schema（与后端 InvestmentCreate/Update、InvestorCreate/Update 语义对齐）=====
// safeParse 仅作入参门禁，通过后仍转发原始 data（避免 strip 字段）。
// ID 校验与既有 actions 一致使用 .min(1)（非 uuid）。
const investmentIdSchema = z.string().min(1, "投资 ID 不能为空");
const investorIdSchema = z.string().min(1, "投资人 ID 不能为空");

// 后端允许 number | string | null（数值类字段做字符串到数值的隐式转换）
const nullableNumber = z.union([z.number(), z.string(), z.null()]);

// 投资方类型枚举 - 对齐后端 InvestorType: enterprise/individual
const investorTypeSchema = z.enum(["enterprise", "individual"], "投资方类型不合法");

// 子投资人 - 对齐 SubInvestorCreate
const subInvestorCreateSchema = z.object({
  name: z.string().min(1, "子投资人姓名不能为空"),
  share_ratio: nullableNumber,
  remark: z.string().nullable().optional(),
});

// InvestmentCreate - 与后端 InvestmentCreate 对齐
const createInvestmentSchema = z.object({
  project_id: z.string().min(1, "项目 ID 不能为空"),
  total_investment: nullableNumber,
  total_return: nullableNumber.optional(),
  remark: z.string().nullable().optional(),
});

// InvestmentUpdate - 全 optional（PUT 语义）
const updateInvestmentSchema = createInvestmentSchema.partial();

// InvestorCreate - 与后端 InvestorCreate 对齐
const createInvestorSchema = z.object({
  name: z.string().min(1, "投资方名称不能为空"),
  type: investorTypeSchema,
  share_ratio: nullableNumber,
  remark: z.string().nullable().optional(),
  sub_investors: z.array(subInvestorCreateSchema).nullable().optional(),
});

// InvestorUpdate - 全 optional
const updateInvestorSchema = createInvestorSchema.partial();

/**
 * 创建跟投记录（成功后 revalidatePath 刷新列表）
 */
export async function createInvestment(
  data: InvestmentCreate,
): Promise<ActionResult<InvestmentResponse>> {
  const parsed = createInvestmentSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "投资参数不合法",
    };
  }
  const permCheck = await requirePermission(PERMISSION_CODES.INVESTMENT_WRITE);
  if (!permCheck.ok) {
    return { success: false, message: permCheck.message };
  }
  try {
    const client = await fetchClient();
    const { data: resData, error } = await client.POST("/api/v1/admin/investments", {
      body: data,
    });

    if (error) {
      const msg = (error as { message?: string }).message || "创建跟投记录失败";
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
  const idParsed = investmentIdSchema.safeParse(id);
  if (!idParsed.success) {
    return {
      success: false,
      message: idParsed.error.issues[0]?.message ?? "投资参数不合法",
    };
  }
  const parsed = updateInvestmentSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "投资参数不合法",
    };
  }
  const permCheck = await requirePermission(PERMISSION_CODES.INVESTMENT_WRITE);
  if (!permCheck.ok) {
    return { success: false, message: permCheck.message };
  }
  try {
    const client = await fetchClient();
    const { data: resData, error } = await client.PUT(
      "/api/v1/admin/investments/{investment_id}",
      { params: { path: { investment_id: id } }, body: data },
    );

    if (error) {
      const msg = (error as { message?: string }).message || "更新跟投记录失败";
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
  const idParsed = investmentIdSchema.safeParse(investmentId);
  if (!idParsed.success) {
    return {
      success: false,
      message: idParsed.error.issues[0]?.message ?? "投资参数不合法",
    };
  }
  const permCheck = await requirePermission(PERMISSION_CODES.INVESTMENT_WRITE);
  if (!permCheck.ok) {
    return { success: false, message: permCheck.message };
  }
  try {
    const client = await fetchClient();
    const { error } = await client.DELETE(
      "/api/v1/admin/investments/{investment_id}",
      { params: { path: { investment_id: investmentId } } },
    );

    if (error) {
      const msg = (error as { message?: string }).message || "删除跟投记录失败";
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
  const idParsed = investmentIdSchema.safeParse(investmentId);
  if (!idParsed.success) {
    return {
      success: false,
      message: idParsed.error.issues[0]?.message ?? "投资参数不合法",
    };
  }
  const parsed = createInvestorSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "投资参数不合法",
    };
  }
  const permCheck = await requirePermission(PERMISSION_CODES.INVESTMENT_WRITE);
  if (!permCheck.ok) {
    return { success: false, message: permCheck.message };
  }
  try {
    const client = await fetchClient();
    const { data: resData, error } = await client.POST(
      "/api/v1/admin/investments/{investment_id}/investors",
      { params: { path: { investment_id: investmentId } }, body: data },
    );

    if (error) {
      const msg = (error as { message?: string }).message || "添加投资方失败";
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
  const investmentIdParsed = investmentIdSchema.safeParse(investmentId);
  if (!investmentIdParsed.success) {
    return {
      success: false,
      message: investmentIdParsed.error.issues[0]?.message ?? "投资参数不合法",
    };
  }
  const investorIdParsed = investorIdSchema.safeParse(investorId);
  if (!investorIdParsed.success) {
    return {
      success: false,
      message: investorIdParsed.error.issues[0]?.message ?? "投资参数不合法",
    };
  }
  const parsed = updateInvestorSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "投资参数不合法",
    };
  }
  const permCheck = await requirePermission(PERMISSION_CODES.INVESTMENT_WRITE);
  if (!permCheck.ok) {
    return { success: false, message: permCheck.message };
  }
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
      const msg = (error as { message?: string }).message || "更新投资方失败";
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
  const investmentIdParsed = investmentIdSchema.safeParse(investmentId);
  if (!investmentIdParsed.success) {
    return {
      success: false,
      message: investmentIdParsed.error.issues[0]?.message ?? "投资参数不合法",
    };
  }
  const investorIdParsed = investorIdSchema.safeParse(investorId);
  if (!investorIdParsed.success) {
    return {
      success: false,
      message: investorIdParsed.error.issues[0]?.message ?? "投资参数不合法",
    };
  }
  const permCheck = await requirePermission(PERMISSION_CODES.INVESTMENT_WRITE);
  if (!permCheck.ok) {
    return { success: false, message: permCheck.message };
  }
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
      const msg = (error as { message?: string }).message || "删除投资方失败";
      return { success: false, message: msg };
    }

    revalidatePath("/admin/investments/[projectId]", "page");
    return { success: true, data: null };
  } catch (e) {
    logger.error("删除投资方异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}
