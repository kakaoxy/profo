"use server";

import { logger } from "@/lib/logger";
import { fetchClient } from "@/lib/api-server";
import { revalidatePath } from "next/cache";
import { components } from "@/lib/api-types";
import type { operations } from "@/lib/api-types";
import { extractApiData } from "@/lib/api-helpers";
import { z } from "zod";
import { PERMISSION_CODES } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/server/require-permission";

type ProjectCreate = components["schemas"]["ProjectCreate"];
type ProjectUpdate = components["schemas"]["ProjectUpdate"];
type ProjectResponse = components["schemas"]["ProjectResponse"];
type GetProjectQuery =
  operations["get_project_api_v1_projects__project_id__get"]["parameters"]["query"];

export type ProjectDetailResult = {
  success: boolean;
  message?: string;
  data?: ProjectResponse;
};

// ===== Zod 校验 schema（与后端 ProjectCreate/ProjectUpdate/ProjectStatus 语义对齐）=====
// 未直接复用 create-project/schema.ts::formSchema，因后者为表单专用：
//  - 日期使用 z.date()（API 为 YYYY-MM-DD 字符串）
//  - 含表单专用字段 rooms/halls/bathrooms/district/original_community_* 等
//  - 附件字段名 attachments 与 API signing_materials 不一致
// 此处按 API 类型独立定义；safeParse 仅作入参门禁，通过后仍转发原始 data（避免 strip 字段）。
const projectIdSchema = z.string().min(1, "项目 ID 不能为空");

// 后端允许 number | string | null（数值类字段做字符串到数值的隐式转换）
const nullableNumber = z.union([z.number(), z.string(), z.null()]);

const businessFormSchema = z.enum(["agent", "wholesale"]);

const costAssumptionTypeSchema = z.enum([
  "meifangbao",
  "owner",
  "respective",
  "other",
]);

const ownerInlineCreateSchema = z.object({
  owner_name: z.string().nullable().optional(),
  owner_phone: z.string().nullable().optional(),
  owner_id_card: z.string().nullable().optional(),
  bank_name: z.string().nullable().optional(),
  bank_card_number: z.string().nullable().optional(),
  relation_type: z.string().nullable().optional(),
  owner_info: z.string().nullable().optional(),
});

// 更新时业主含可选 id（提供则更新，否则新增）
const ownerInlineUpdateSchema = ownerInlineCreateSchema.extend({
  id: z.string().nullable().optional(),
});

const signingMaterialSchema = z.object({
  filename: z.string().min(1),
  url: z.string().min(1),
  category: z.string(),
  fileType: z.string(),
  size: z.number(),
});

// 创建项目 - 与 ProjectCreate 对齐
const createProjectSchema = z.object({
  community_id: z.string().nullable().optional(),
  community_name: z.string().min(1, "小区名称不能为空"),
  address: z.string().min(1, "物业地址不能为空"),
  area: nullableNumber.optional(),
  layout: z.string().nullable().optional(),
  orientation: z.string().nullable().optional(),
  floor_info: z.string().nullable().optional(),
  electricity_account: z.string().nullable().optional(),
  water_account: z.string().nullable().optional(),
  gas_account: z.string().nullable().optional(),
  project_manager_id: z.string().nullable().optional(),
  business_form: businessFormSchema.nullable().optional(),
  contract_no: z.string().min(1, "合同编号不能为空"),
  signing_price: nullableNumber.optional(),
  signing_date: z.string().nullable().optional(),
  signing_period: z.number().nullable().optional(),
  extension_period: z.number().nullable().optional(),
  extension_rent: nullableNumber.optional(),
  cost_assumption_type: costAssumptionTypeSchema.nullable().optional(),
  cost_assumption_other: z.string().nullable().optional(),
  planned_handover_date: z.string().nullable().optional(),
  other_agreements: z.string().nullable().optional(),
  signing_materials: z.array(signingMaterialSchema).nullable().optional(),
  owner_name: z.string().nullable().optional(),
  owner_phone: z.string().nullable().optional(),
  owner_id_card: z.string().nullable().optional(),
  owner_info: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  owners: z.array(ownerInlineCreateSchema).nullable().optional(),
  list_price: nullableNumber.optional(),
  listing_date: z.string().nullable().optional(),
  commission_start_date: z.string().nullable().optional(),
  commission_end_date: z.string().nullable().optional(),
});

// 更新项目 - 全部 optional（PATCH 语义），owners 改用 OwnerInlineUpdate
const updateProjectSchema = createProjectSchema
  .partial()
  .extend({ owners: z.array(ownerInlineUpdateSchema).nullable().optional() });

// 项目状态枚举 - 对齐后端 ProjectStatus: signing/renovating/selling/sold/deleted
const projectStatusSchema = z.enum(
  ["signing", "renovating", "selling", "sold", "deleted"],
  "项目状态不合法",
);

/**
 * 创建项目
 */
export async function createProjectAction(data: ProjectCreate) {
  const parsed = createProjectSchema.safeParse(data);
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
    const { error } = await client.POST("/api/v1/projects", {
      body: data,
    });

    if (error) {
      const errorMsg = (error as { message?: string }).message || "创建项目失败";
      return { success: false, message: errorMsg };
    }

    revalidatePath("/admin/projects");
    return { success: true, message: "项目创建成功" };
  } catch (e) {
    logger.error("创建项目异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

/**
 * 更新项目信息
 */
export async function updateProjectAction(id: string, data: ProjectUpdate) {
  const idParsed = projectIdSchema.safeParse(id);
  if (!idParsed.success) {
    return {
      success: false,
      message: idParsed.error.issues[0]?.message || "输入校验失败",
    };
  }
  const parsed = updateProjectSchema.safeParse(data);
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
    const { error } = await client.PUT("/api/v1/projects/{project_id}", {
      params: { path: { project_id: id } },
      body: data,
    });

    if (error) {
      const errorMsg = (error as { message?: string }).message || "更新项目失败";
      return { success: false, message: errorMsg };
    }

    revalidatePath("/admin/projects");
    return { success: true, message: "项目更新成功" };
  } catch (e) {
    logger.error("更新项目异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

/**
 * 删除项目
 */
export async function deleteProjectAction(id: string) {
  const idParsed = projectIdSchema.safeParse(id);
  if (!idParsed.success) {
    return {
      success: false,
      message: idParsed.error.issues[0]?.message || "输入校验失败",
    };
  }
  const permCheck = await requirePermission(PERMISSION_CODES.PROJECT_DELETE);
  if (!permCheck.ok) {
    return { success: false, message: permCheck.message };
  }
  try {
    const client = await fetchClient();
    const { error } = await client.DELETE("/api/v1/projects/{project_id}", {
      params: { path: { project_id: id } },
    });

    if (error) {
      const errorMsg = (error as { message?: string }).message || "删除项目失败";
      return { success: false, message: errorMsg };
    }

    revalidatePath("/admin/projects");
    return { success: true, message: "项目已删除" };
  } catch (e) {
    logger.error("删除项目异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

/**
 * 更新项目主状态 (例如: signing -> renovating)
 */
export async function updateProjectStatusAction(
  projectId: string,
  status: string,
  listingDate?: string,
  listPrice?: number,
) {
  const idParsed = projectIdSchema.safeParse(projectId);
  if (!idParsed.success) {
    return {
      success: false,
      message: idParsed.error.issues[0]?.message || "输入校验失败",
    };
  }
  const statusParsed = projectStatusSchema.safeParse(status);
  if (!statusParsed.success) {
    return {
      success: false,
      message: statusParsed.error.issues[0]?.message || "项目状态不合法",
    };
  }
  const permCheck = await requirePermission(PERMISSION_CODES.PROJECT_WRITE);
  if (!permCheck.ok) {
    return { success: false, message: permCheck.message };
  }
  try {
    const client = await fetchClient();

    const { error } = await client.PUT("/api/v1/projects/{project_id}/status", {
      params: { path: { project_id: projectId } },
      body: {
        status: status as components["schemas"]["ProjectStatus"],
        listing_date: listingDate,
        list_price: listPrice,
      },
    });

    if (error) {
      const errorMsg = (error as { message?: string }).message || "状态更新失败";
      return { success: false, message: errorMsg };
    }

    revalidatePath("/admin/projects");
    return { success: true, message: "状态已更新" };
  } catch (e) {
    logger.error("更新状态异常:", e);
    return { success: false, message: "网络错误" };
  }
}

/**
 * 获取项目详情 (Server Action)
 */
export async function getProjectDetailAction(
  projectId: string,
  isFull: boolean = false,
): Promise<ProjectDetailResult> {
  try {
    const client = await fetchClient();

    const { data, error } = await client.GET("/api/v1/projects/{project_id}", {
      params: {
        path: { project_id: projectId },
        query: { full: isFull } satisfies GetProjectQuery,
      },
      cache: "no-store",
      next: { revalidate: 0 },
    });

    if (error) {
      return { success: false, message: "获取详情失败" };
    }

    const projectData = extractApiData<ProjectResponse>(data);
    return { success: true, data: projectData };
  } catch (e) {
    logger.error("获取详情异常:", e);
    return { success: false, message: "网络错误" };
  }
}

/**
 * 获取下一个合同编号 (Server Action)
 * @param businessForm 业务形式: agent(代理美化) / wholesale(收购美化)
 */
export async function getNextContractNoAction(
  businessForm: "agent" | "wholesale",
): Promise<{ success: boolean; data?: string; message?: string }> {
  try {
    const client = await fetchClient();
    const { data, error } = await client.GET("/api/v1/projects/contract-no/next", {
      params: { query: { business_form: businessForm } },
    });

    if (error) {
      return { success: false, message: "获取合同编号失败" };
    }

    return { success: true, data: data as string };
  } catch (e) {
    logger.error("获取合同编号异常:", e);
    return { success: false, message: "网络错误" };
  }
}

/**
 * 获取业主未脱敏银行卡号 (Server Action)
 * @param ownerId 业主ID（UUID 格式）
 */
export async function getOwnerBankCardAction(
  ownerId: string,
): Promise<{ success: boolean; data?: string; message?: string }> {
  // 入参格式校验：ownerId 必须为 UUID 格式，提前拒绝非法请求
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(ownerId)) {
    return { success: false, message: "无效的业主ID" };
  }
  try {
    const client = await fetchClient();
    const { data, error } = await client.GET(
      "/api/v1/projects/owners/{owner_id}/bank-card",
      { params: { path: { owner_id: ownerId } } },
    );

    if (error) {
      return { success: false, message: "获取银行卡号失败" };
    }

    return { success: true, data: data.bank_card_number ?? undefined };
  } catch (e) {
    logger.error("获取银行卡号异常:", e);
    return { success: false, message: "网络错误" };
  }
}
