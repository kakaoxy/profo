"use server";

import { fetchClient } from "@/lib/api-server";
import { revalidatePath } from "next/cache";
import { components } from "@/lib/api-types";

type ProjectCreate = components["schemas"]["ProjectCreate"];

export async function createProjectAction(data: ProjectCreate) {
  try {
    const client = await fetchClient();
    const { error } = await client.POST("/api/v1/projects", {
      body: data,
    });

    if (error) {
      const errorMsg = (error as { detail?: string }).detail || "创建项目失败";
      return { success: false, message: errorMsg };
    }

    revalidatePath("/projects");
    return { success: true, message: "项目创建成功" };
  } catch (e) {
    console.error("创建项目异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}