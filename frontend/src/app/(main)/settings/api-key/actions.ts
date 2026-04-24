"use server";

import { fetchClient } from "@/lib/api-server";
import { revalidatePath } from "next/cache";
import { components } from "@/lib/api-types";

export type ApiKeyCreateResponse = components["schemas"]["ApiKeyCreateResponse"];
export type ApiKeyInfoResponse = components["schemas"]["ApiKeyInfoResponse"];

export async function getApiKeyInfoAction() {
  try {
    const client = await fetchClient();
    const { data, error } = await client.GET("/api/v1/auth/api-key");

    if (error) {
      console.error("Get API key info error", error);
      return { success: false, message: "获取 API Key 信息失败" };
    }

    return { success: true, data };
  } catch (error) {
    console.error("Get API key info exception:", error);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

export async function generateApiKeyAction() {
  try {
    const client = await fetchClient();
    const { data, error } = await client.POST("/api/v1/auth/api-key");

    if (error) {
      const errorMsg = (error as { detail?: string }).detail || "生成 API Key 失败";
      return { success: false, message: errorMsg };
    }

    return { success: true, data };
  } catch (error) {
    console.error("Generate API key exception:", error);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

export async function deleteApiKeyAction() {
  try {
    const client = await fetchClient();
    const { error } = await client.DELETE("/api/v1/auth/api-key");

    if (error) {
      const errorMsg = (error as { detail?: string }).detail || "删除 API Key 失败";
      return { success: false, message: errorMsg };
    }

    revalidatePath("/settings/api-key");
    return { success: true, message: "API Key 已删除" };
  } catch (error) {
    console.error("Delete API key exception:", error);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}
