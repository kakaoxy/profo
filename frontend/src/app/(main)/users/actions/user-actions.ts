"use server";

import { fetchClient } from "@/lib/api-server";
import { revalidatePath } from "next/cache";
import { components } from "@/lib/api-types";

export type UserResponse = components["schemas"]["UserResponse"];
export type UserCreate = components["schemas"]["UserCreate"];
export type UserUpdate = components["schemas"]["UserUpdate"];
export type UserListResponse = components["schemas"]["UserListResponse"];
export type UserSimpleResponse = components["schemas"]["UserSimpleResponse"];
export type UserSimpleListResponse = components["schemas"]["UserSimpleListResponse"];
export type PasswordResetRequest = components["schemas"]["PasswordResetRequest"];
export type PasswordChange = components["schemas"]["PasswordChange"];

export async function getUserByIdAction(userId: string) {
  try {
    const client = await fetchClient();
    const { data, error } = await client.GET("/api/v1/users/users/{user_id}", {
      params: { path: { user_id: userId } },
    });

    if (error) {
      console.error("Get user by id error", error);
      return { success: false, message: "获取用户信息失败" };
    }

    return { success: true, data };
  } catch (error) {
    console.error("Get user by id exception:", error);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

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
    const { data, error } = await client.GET("/api/v1/users/users", {
      params: { query: params },
    });

    if (error) {
      console.error("Get users error", error);
      return { success: false, message: "获取用户列表失败" };
    }

    return { success: true, data };
  } catch (error) {
    console.error("Get users exception:", error);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

export async function getUsersSimpleAction(params?: {
  nickname?: string;
  status?: string;
}) {
  try {
    const client = await fetchClient();
    const { data, error } = await client.GET("/api/v1/users/simple", {
      params: { query: params },
    });

    if (error) {
      console.error("Get users simple error", error);
      return { success: false, message: "获取用户列表失败" };
    }

    return { success: true, data };
  } catch (error) {
    console.error("Get users simple exception:", error);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

export async function createUserAction(data: UserCreate) {
  try {
    const client = await fetchClient();
    const { error } = await client.POST("/api/v1/users/users", { body: data });

    if (error) {
      const errorMsg = (error as { detail?: string }).detail || "创建用户失败";
      return { success: false, message: errorMsg };
    }

    revalidatePath("/users");
    return { success: true, message: "用户创建成功" };
  } catch (error) {
    console.error("Create user exception:", error);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

export async function updateUserAction(userId: string, data: UserUpdate) {
  try {
    const client = await fetchClient();
    const { error } = await client.PUT("/api/v1/users/users/{user_id}", {
      params: { path: { user_id: userId } },
      body: data,
    });

    if (error) {
      const errorMsg = (error as { detail?: string }).detail || "更新用户失败";
      return { success: false, message: errorMsg };
    }

    revalidatePath("/users");
    return { success: true, message: "用户更新成功" };
  } catch (error) {
    console.error("Update user exception:", error);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

export async function deleteUserAction(userId: string) {
  try {
    const client = await fetchClient();
    const { error } = await client.DELETE("/api/v1/users/users/{user_id}", {
      params: { path: { user_id: userId } },
    });

    if (error) {
      const errorMsg = (error as { detail?: string }).detail || "删除用户失败";
      return { success: false, message: errorMsg };
    }

    revalidatePath("/users");
    return { success: true, message: "用户删除成功" };
  } catch (error) {
    console.error("Delete user exception:", error);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

export async function resetUserPasswordAction(userId: string, data: PasswordResetRequest) {
  try {
    const client = await fetchClient();
    const { error } = await client.PUT("/api/v1/users/users/{user_id}/reset-password", {
      params: { path: { user_id: userId } },
      body: data,
    });

    if (error) {
      const errorMsg = (error as { detail?: string }).detail || "重置密码失败";
      return { success: false, message: errorMsg };
    }

    return { success: true, message: "密码重置成功" };
  } catch (error) {
    console.error("Reset password exception:", error);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}
