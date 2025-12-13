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

type ProjectUpdate = components["schemas"]["ProjectUpdate"];

export async function updateProjectAction(id: string, data: ProjectUpdate) {
  try {
    const client = await fetchClient();
    const { error } = await client.PUT("/api/v1/projects/{project_id}", {
      params: { path: { project_id: id } },
      body: data,
    });

    if (error) {
      const errorMsg = (error as { detail?: string }).detail || "更新项目失败";
      return { success: false, message: errorMsg };
    }

    revalidatePath("/projects");
    return { success: true, message: "项目更新成功" };
  } catch (e) {
    console.error("更新项目异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

export async function deleteProjectAction(id: string) {
  try {
    const client = await fetchClient();
    // @ts-expect-error - path types not yet generated for DELETE endpoint
    const { error } = await client.DELETE("/api/v1/projects/{project_id}", {
      params: { path: { project_id: id } },
    });

    if (error) {
      const errorMsg = (error as { detail?: string }).detail || "删除项目失败";
      return { success: false, message: errorMsg };
    }

    revalidatePath("/projects");
    return { success: true, message: "项目已删除" };
  } catch (e) {
    console.error("删除项目异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}