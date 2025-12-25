"use server";

import { fetchClient } from "@/lib/api-server";
import { revalidatePath } from "next/cache";
import { components } from "@/lib/api-types";

// User Types
export type UserResponse = components["schemas"]["UserResponse"];
export type UserCreate = components["schemas"]["UserCreate"];
export type UserUpdate = components["schemas"]["UserUpdate"];
export type UserListResponse = components["schemas"]["UserListResponse"];
export type PasswordResetRequest = components["schemas"]["PasswordResetRequest"];
export type PasswordChange = components["schemas"]["PasswordChange"];

// Role Types
export type RoleResponse = components["schemas"]["RoleResponse"];
export type RoleCreate = components["schemas"]["RoleCreate"];
export type RoleUpdate = components["schemas"]["RoleUpdate"];
export type RoleListResponse = components["schemas"]["RoleListResponse"];

// ==================== User Actions ====================

/**
 * Get Users List
 */
export async function getUsersAction(params: {
  page?: number;
  page_size?: number;
  username?: string;
  nickname?: string;
  role_id?: string;
  status?: string;
}) {
  try {
    const client = await fetchClient();
    const { data, error } = await client.GET("/api/users/users", {
      params: {
        query: params,
      },
    });

    if (error) {
      console.error("Get users error", error);
      return { success: false, message: "获取用户列表失败" };
    }

    return { success: true, data };
  } catch (e) {
    console.error("Get users exception:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

/**
 * Create User
 */
export async function createUserAction(data: UserCreate) {
  try {
    const client = await fetchClient();
    const { error } = await client.POST("/api/users/users", {
      body: data,
    });

    if (error) {
      const errorMsg = (error as { detail?: string }).detail || "创建用户失败";
      return { success: false, message: errorMsg };
    }

    revalidatePath("/users");
    return { success: true, message: "用户创建成功" };
  } catch (e) {
    console.error("Create user exception:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

/**
 * Update User
 */
export async function updateUserAction(userId: string, data: UserUpdate) {
  try {
    const client = await fetchClient();
    const { error } = await client.PUT("/api/users/users/{user_id}", {
      params: { path: { user_id: userId } },
      body: data,
    });

    if (error) {
      const errorMsg = (error as { detail?: string }).detail || "更新用户失败";
      return { success: false, message: errorMsg };
    }

    revalidatePath("/users");
    return { success: true, message: "用户更新成功" };
  } catch (e) {
    console.error("Update user exception:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

/**
 * Delete User
 */
export async function deleteUserAction(userId: string) {
  try {
    const client = await fetchClient();
    const { error } = await client.DELETE("/api/users/users/{user_id}", {
      params: { path: { user_id: userId } },
    });

    if (error) {
      const errorMsg = (error as { detail?: string }).detail || "删除用户失败";
      return { success: false, message: errorMsg };
    }

    revalidatePath("/users");
    return { success: true, message: "用户删除成功" };
  } catch (e) {
    console.error("Delete user exception:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

/**
 * Reset User Password (Admin)
 */
export async function resetUserPasswordAction(userId: string, data: PasswordResetRequest) {
  try {
    const client = await fetchClient();
    const { error } = await client.PUT("/api/users/users/{user_id}/reset-password", {
      params: { path: { user_id: userId } },
      body: data,
    });

    if (error) {
      const errorMsg = (error as { detail?: string }).detail || "重置密码失败";
      return { success: false, message: errorMsg };
    }

    return { success: true, message: "密码重置成功" };
  } catch (e) {
    console.error("Reset password exception:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

// ==================== Role Actions ====================

/**
 * Get Roles List
 */
export async function getRolesAction(params: {
  page?: number;
  page_size?: number;
  name?: string;
  code?: string;
  is_active?: boolean;
}) {
  try {
    const client = await fetchClient();
    const { data, error } = await client.GET("/api/users/roles", {
      params: {
        query: params,
      },
    });

    if (error) {
      console.error("Get roles error", error);
      return { success: false, message: "获取角色列表失败" };
    }

    return { success: true, data };
  } catch (e) {
    console.error("Get roles exception:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

/**
 * Create Role
 */
export async function createRoleAction(data: RoleCreate) {
  try {
    const client = await fetchClient();
    const { error } = await client.POST("/api/users/roles", {
      body: data,
    });

    if (error) {
      const errorMsg = (error as { detail?: string }).detail || "创建角色失败";
      return { success: false, message: errorMsg };
    }

    revalidatePath("/users/roles");
    return { success: true, message: "角色创建成功" };
  } catch (e) {
    console.error("Create role exception:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

/**
 * Update Role
 */
export async function updateRoleAction(roleId: string, data: RoleUpdate) {
  try {
    const client = await fetchClient();
    const { error } = await client.PUT("/api/users/roles/{role_id}", {
      params: { path: { role_id: roleId } },
      body: data,
    });

    if (error) {
      const errorMsg = (error as { detail?: string }).detail || "更新角色失败";
      return { success: false, message: errorMsg };
    }

    revalidatePath("/users/roles");
    return { success: true, message: "角色更新成功" };
  } catch (e) {
    console.error("Update role exception:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

/**
 * Delete Role
 */
export async function deleteRoleAction(roleId: string) {
  try {
    const client = await fetchClient();
    const { error } = await client.DELETE("/api/users/roles/{role_id}", {
      params: { path: { role_id: roleId } },
    });

    if (error) {
      const errorMsg = (error as { detail?: string }).detail || "删除角色失败";
      return { success: false, message: errorMsg };
    }

    revalidatePath("/users/roles");
    return { success: true, message: "角色删除成功" };
  } catch (e) {
    console.error("Delete role exception:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}
