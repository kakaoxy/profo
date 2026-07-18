"use server";

import { logger } from "@/lib/logger";
import { fetchClient } from "@/lib/api-server";
import { revalidatePath } from "next/cache";
import { components } from "@/lib/api-types";
import { PERMISSION_CODES } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/server/require-permission";

export type ApiKeyCreateResponse = components["schemas"]["ApiKeyCreateResponse"];
export type ApiKeyInfoResponse = components["schemas"]["ApiKeyInfoResponse"];

export async function getApiKeyInfoAction() {
  try {
    const client = await fetchClient();
    const { data, error } = await client.GET("/api/v1/auth/api-key");

    if (error) {
      logger.error("Get API key info error", error);
      return { success: false, message: "获取 API Key 信息失败" };
    }

    return { success: true, data };
  } catch (error) {
    logger.error("Get API key info exception:", error);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

export async function generateApiKeyAction() {
  const permCheck = await requirePermission(PERMISSION_CODES.API_KEY_MANAGE);
  if (!permCheck.ok) {
    return { success: false, message: permCheck.message };
  }
  try {
    const client = await fetchClient();
    const { data, error } = await client.POST("/api/v1/auth/api-key");

    if (error) {
      const errorMsg = (error as { message?: string }).message || "生成 API Key 失败";
      return { success: false, message: errorMsg };
    }

    return { success: true, data };
  } catch (error) {
    logger.error("Generate API key exception:", error);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

export async function deleteApiKeyAction() {
  const permCheck = await requirePermission(PERMISSION_CODES.API_KEY_MANAGE);
  if (!permCheck.ok) {
    return { success: false, message: permCheck.message };
  }
  try {
    const client = await fetchClient();
    const { error } = await client.DELETE("/api/v1/auth/api-key");

    if (error) {
      const errorMsg = (error as { message?: string }).message || "删除 API Key 失败";
      return { success: false, message: errorMsg };
    }

    revalidatePath("/admin/settings/api-key");
    return { success: true, message: "API Key 已删除" };
  } catch (error) {
    logger.error("Delete API key exception:", error);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}
