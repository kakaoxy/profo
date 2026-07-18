"use server";

import { logger } from "@/lib/logger";
import { fetchClient } from "@/lib/api-server";
import { revalidatePath } from "next/cache";
import { components } from "@/lib/api-types";
import { z } from "zod";
import { PERMISSION_CODES } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/server/require-permission";

export type RoleResponse = components["schemas"]["RoleResponse"];
export type RoleCreate = components["schemas"]["RoleCreate"];
export type RoleUpdate = components["schemas"]["RoleUpdate"];
export type RoleListResponse = components["schemas"]["RoleListResponse"];

// 与 use-role-form.ts 中的 formSchema 对齐
const roleCreateSchema = z.object({
  name: z
    .string()
    .min(2, "名称至少2个字符")
    .max(100, "名称不能超过100个字符"),
  code: z
    .string()
    .min(2, "代码至少2个字符")
    .max(50, "代码不能超过50个字符")
    .regex(/^[a-zA-Z0-9_]+$/, "代码只能包含字母、数字和下划线"),
  description: z.string().optional(),
  permission_codes: z.array(z.string()).optional(),
  is_active: z.boolean(),
});

const roleUpdateSchema = z.object({
  name: z
    .string()
    .min(2, "名称至少2个字符")
    .max(100, "名称不能超过100个字符")
    .optional(),
  code: z
    .string()
    .min(2, "代码至少2个字符")
    .max(50, "代码不能超过50个字符")
    .regex(/^[a-zA-Z0-9_]+$/, "代码只能包含字母、数字和下划线")
    .optional(),
  description: z.string().optional(),
  permission_codes: z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
});

const roleIdSchema = z.string().min(1, "角色 ID 不能为空");

export async function getRolesAction(params: {
  page?: number;
  page_size?: number;
  name?: string;
  code?: string;
  is_active?: boolean;
}) {
  try {
    const client = await fetchClient();
    const { data, error } = await client.GET("/api/v1/roles", {
      params: { query: params },
    });

    if (error) {
      logger.error("Get roles error", error);
      return { success: false, message: "获取角色列表失败" };
    }

    return { success: true, data };
  } catch (error) {
    logger.error("Get roles exception:", error);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

export async function createRoleAction(data: RoleCreate) {
  const parsed = roleCreateSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "参数不合法",
    };
  }

  const permCheck = await requirePermission(PERMISSION_CODES.ROLE_CREATE);
  if (!permCheck.ok) {
    return { success: false, message: permCheck.message };
  }

  try {
    const client = await fetchClient();
    const { error } = await client.POST("/api/v1/roles", { body: data });

    if (error) {
      const errorMsg = (error as { message?: string }).message || "创建角色失败";
      return { success: false, message: errorMsg };
    }

    revalidatePath("/admin/users/roles");
    return { success: true, message: "角色创建成功" };
  } catch (error) {
    logger.error("Create role exception:", error);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

export async function updateRoleAction(roleId: string, data: RoleUpdate) {
  const idParsed = roleIdSchema.safeParse(roleId);
  if (!idParsed.success) {
    return {
      success: false,
      message: idParsed.error.issues[0]?.message ?? "参数不合法",
    };
  }

  const parsed = roleUpdateSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "参数不合法",
    };
  }

  const permCheck = await requirePermission(PERMISSION_CODES.ROLE_UPDATE);
  if (!permCheck.ok) {
    return { success: false, message: permCheck.message };
  }

  try {
    const client = await fetchClient();
    const { error } = await client.PUT("/api/v1/roles/{role_id}", {
      params: { path: { role_id: roleId } },
      body: data,
    });

    if (error) {
      const errorMsg = (error as { message?: string }).message || "更新角色失败";
      return { success: false, message: errorMsg };
    }

    revalidatePath("/admin/users/roles");
    return { success: true, message: "角色更新成功" };
  } catch (error) {
    logger.error("Update role exception:", error);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

export async function deleteRoleAction(roleId: string) {
  const idParsed = roleIdSchema.safeParse(roleId);
  if (!idParsed.success) {
    return {
      success: false,
      message: idParsed.error.issues[0]?.message ?? "参数不合法",
    };
  }

  const permCheck = await requirePermission(PERMISSION_CODES.ROLE_DELETE);
  if (!permCheck.ok) {
    return { success: false, message: permCheck.message };
  }

  try {
    const client = await fetchClient();
    const { error } = await client.DELETE("/api/v1/roles/{role_id}", {
      params: { path: { role_id: roleId } },
    });

    if (error) {
      const errorMsg = (error as { message?: string }).message || "删除角色失败";
      return { success: false, message: errorMsg };
    }

    revalidatePath("/admin/users/roles");
    return { success: true, message: "角色删除成功" };
  } catch (error) {
    logger.error("Delete role exception:", error);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}
