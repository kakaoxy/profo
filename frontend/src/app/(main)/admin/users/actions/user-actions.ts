"use server";

import { logger } from "@/lib/logger";
import { fetchClient } from "@/lib/api-server";
import { revalidatePath } from "next/cache";
import { components } from "@/lib/api-types";
import { z } from "zod";
import { passwordSchema } from "../_components/password-schema";

export type UserResponse = components["schemas"]["UserResponse"];
export type UserCreate = components["schemas"]["UserCreate"];
export type UserUpdate = components["schemas"]["UserUpdate"];
export type UserListResponse = components["schemas"]["UserListResponse"];
export type UserSimpleResponse = components["schemas"]["UserSimpleResponse"];
export type UserSimpleListResponse = components["schemas"]["UserSimpleListResponse"];
export type PasswordResetRequest = components["schemas"]["PasswordResetRequest"];
export type PasswordChange = components["schemas"]["PasswordChange"];

// 与 use-user-form.ts 中的 createSchema/editSchema 对齐
const createSchema = z.object({
  username: z.string().min(3, "用户名至少3个字符").max(100),
  nickname: z.string().max(100).optional(),
  password: passwordSchema,
  role_id: z.string().min(1, "请选择角色"),
  phone: z.string().max(20).optional().or(z.literal("")),
});

const editSchema = z.object({
  username: z.string().optional(),
  password: z.string().optional(),
  nickname: z.string().max(100).optional(),
  role_id: z.string().min(1, "请选择角色"),
  phone: z.string().max(20).optional().or(z.literal("")),
  status: z.string().optional(),
});

const resetPasswordSchema = z.object({
  password: passwordSchema,
});

const userIdSchema = z.string().min(1, "用户 ID 不能为空");

export async function getUserByIdAction(userId: string) {
  try {
    const client = await fetchClient();
    const { data, error } = await client.GET("/api/v1/users/{user_id}", {
      params: { path: { user_id: userId } },
    });

    if (error) {
      logger.error("Get user by id error", error);
      return { success: false, message: "获取用户信息失败" };
    }

    return { success: true, data };
  } catch (error) {
    logger.error("Get user by id exception:", error);
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
    const { data, error } = await client.GET("/api/v1/users", {
      params: { query: params },
    });

    if (error) {
      logger.error("Get users error", error);
      return { success: false, message: "获取用户列表失败" };
    }

    return { success: true, data };
  } catch (error) {
    logger.error("Get users exception:", error);
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
      logger.error("Get users simple error", error);
      return { success: false, message: "获取用户列表失败" };
    }

    return { success: true, data };
  } catch (error) {
    logger.error("Get users simple exception:", error);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

export async function createUserAction(data: UserCreate) {
  const parsed = createSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "用户参数不合法",
    };
  }

  try {
    const client = await fetchClient();
    const { error } = await client.POST("/api/v1/users", { body: data });

    if (error) {
      const errorMsg = (error as { message?: string }).message || "创建用户失败";
      return { success: false, message: errorMsg };
    }

    revalidatePath("/admin/users");
    return { success: true, message: "用户创建成功" };
  } catch (error) {
    logger.error("Create user exception:", error);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

export async function updateUserAction(userId: string, data: UserUpdate) {
  const idParsed = userIdSchema.safeParse(userId);
  if (!idParsed.success) {
    return {
      success: false,
      message: idParsed.error.issues[0]?.message ?? "用户参数不合法",
    };
  }

  const parsed = editSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "用户参数不合法",
    };
  }

  try {
    const client = await fetchClient();
    const { error } = await client.PUT("/api/v1/users/{user_id}", {
      params: { path: { user_id: userId } },
      body: data,
    });

    if (error) {
      const errorMsg = (error as { message?: string }).message || "更新用户失败";
      return { success: false, message: errorMsg };
    }

    revalidatePath("/admin/users");
    return { success: true, message: "用户更新成功" };
  } catch (error) {
    logger.error("Update user exception:", error);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

export async function deleteUserAction(userId: string) {
  const idParsed = userIdSchema.safeParse(userId);
  if (!idParsed.success) {
    return {
      success: false,
      message: idParsed.error.issues[0]?.message ?? "用户参数不合法",
    };
  }

  try {
    const client = await fetchClient();
    const { error } = await client.DELETE("/api/v1/users/{user_id}", {
      params: { path: { user_id: userId } },
    });

    if (error) {
      const errorMsg = (error as { message?: string }).message || "删除用户失败";
      return { success: false, message: errorMsg };
    }

    revalidatePath("/admin/users");
    return { success: true, message: "用户删除成功" };
  } catch (error) {
    logger.error("Delete user exception:", error);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

export async function resetUserPasswordAction(userId: string, data: PasswordResetRequest) {
  const idParsed = userIdSchema.safeParse(userId);
  if (!idParsed.success) {
    return {
      success: false,
      message: idParsed.error.issues[0]?.message ?? "用户参数不合法",
    };
  }

  const parsed = resetPasswordSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "用户参数不合法",
    };
  }

  try {
    const client = await fetchClient();
    const { error } = await client.PUT("/api/v1/users/{user_id}/reset-password", {
      params: { path: { user_id: userId } },
      body: data,
    });

    if (error) {
      const errorMsg = (error as { message?: string }).message || "重置密码失败";
      return { success: false, message: errorMsg };
    }

    return { success: true, message: "密码重置成功" };
  } catch (error) {
    logger.error("Reset password exception:", error);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}
