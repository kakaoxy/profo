"use server";

import { fetchClient } from "@/lib/api-server";
import { revalidatePath } from "next/cache";
import { components } from "@/lib/api-types";

type ProjectCreate = components["schemas"]["ProjectCreate"];
type ProjectUpdate = components["schemas"]["ProjectUpdate"];

/**
 * 创建项目
 */
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

/**
 * 更新项目信息
 */
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

/**
 * 删除项目
 */
export async function deleteProjectAction(id: string) {
  try {
    const client = await fetchClient();
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

/**
 * 更新项目主状态 (例如: signing -> renovating)
 */
export async function updateProjectStatusAction(
  projectId: string,
  status: string,
  listingDate?: string
) {
  try {
    const client = await fetchClient();

    const { error } = await client.PUT("/api/v1/projects/{project_id}/status", {
      params: { path: { project_id: projectId } },
      body: { 
        status: status as components["schemas"]["ProjectStatus"],
        listing_date: listingDate
      },
    });

    if (error) {
      const errorMsg = (error as { detail?: string }).detail || "状态更新失败";
      return { success: false, message: errorMsg };
    }

    revalidatePath("/projects");
    return { success: true, message: "状态已更新" };
  } catch (e) {
    console.error("更新状态异常:", e);
    return { success: false, message: "网络错误" };
  }
}

/**
 * 获取项目详情 (Server Action)
 */
export async function getProjectDetailAction(
  projectId: string,
  isFull: boolean = false
) {
  try {
    const client = await fetchClient();

    const { data, error } = await client.GET("/api/v1/projects/{project_id}", {
      params: {
        path: { project_id: projectId },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        query: { full: isFull } as any,
      },
      cache: "no-store",
      next: { revalidate: 0 },
    });

    if (error) {
      return { success: false, message: "获取详情失败" };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { success: true, data: (data as any).data };
  } catch (e) {
    console.error("获取详情异常:", e);
    return { success: false, message: "网络错误" };
  }
}
