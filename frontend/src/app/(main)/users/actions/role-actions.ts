"use server";

import { fetchClient } from "@/lib/api-server";
import { revalidatePath } from "next/cache";
import { components } from "@/lib/api-types";

export type RoleResponse = components["schemas"]["RoleResponse"];
export type RoleCreate = components["schemas"]["RoleCreate"];
export type RoleUpdate = components["schemas"]["RoleUpdate"];
export type RoleListResponse = components["schemas"]["RoleListResponse"];

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
      console.error("Get roles error", error);
      return { success: false, message: "获取角色列表失败" };
    }

    return { success: true, data };
  } catch (error) {
    console.error("Get roles exception:", error);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

export async function createRoleAction(data: RoleCreate) {
  try {
    const client = await fetchClient();
    const { error } = await client.POST("/api/v1/roles", { body: data });

    if (error) {
      const errorMsg = (error as { detail?: string }).detail || "创建角色失败";
      return { success: false, message: errorMsg };
    }

    revalidatePath("/users/roles");
    return { success: true, message: "角色创建成功" };
  } catch (error) {
    console.error("Create role exception:", error);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

export async function updateRoleAction(roleId: string, data: RoleUpdate) {
  try {
    const client = await fetchClient();
    const { error } = await client.PUT("/api/v1/roles/{role_id}", {
      params: { path: { role_id: roleId } },
      body: data,
    });

    if (error) {
      const errorMsg = (error as { detail?: string }).detail || "更新角色失败";
      return { success: false, message: errorMsg };
    }

    revalidatePath("/users/roles");
    return { success: true, message: "角色更新成功" };
  } catch (error) {
    console.error("Update role exception:", error);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

export async function deleteRoleAction(roleId: string) {
  try {
    const client = await fetchClient();
    const { error } = await client.DELETE("/api/v1/roles/{role_id}", {
      params: { path: { role_id: roleId } },
    });

    if (error) {
      const errorMsg = (error as { detail?: string }).detail || "删除角色失败";
      return { success: false, message: errorMsg };
    }

    revalidatePath("/users/roles");
    return { success: true, message: "角色删除成功" };
  } catch (error) {
    console.error("Delete role exception:", error);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}
