"use server";

import { fetchClient } from "@/lib/api-server";
import { revalidatePath } from "next/cache";

interface ApiResponse<T> {
  code: number;
  msg: string;
  data: T;
}

/**
 * 删除装修照片
 */
export async function deleteRenovationPhotoAction(
  projectId: string,
  photoId: string
) {
  try {
    const client = await fetchClient();
    const { error } = await client.DELETE(
      "/api/v1/projects/{project_id}/renovation/photos/{photo_id}",
      {
        params: {
          path: {
            project_id: projectId,
            photo_id: photoId,
          },
        },
      }
    );

    if (error) {
      const errorMsg = (error as { detail?: string })?.detail || "删除照片失败";
      return { success: false, message: errorMsg };
    }

    revalidatePath("/projects");
    return { success: true, message: "照片已删除" };
  } catch (e) {
    console.error("删除照片异常:", e);
    return { success: false, message: "网络错误" };
  }
}

/**
 * 获取装修照片列表
 */
export async function getRenovationPhotosAction(projectId: string) {
  try {
    const client = await fetchClient();
    const { data, error } = await client.GET(
      "/api/v1/projects/{project_id}/renovation/photos",
      {
        params: {
          path: { project_id: projectId },
        },
      }
    );

    if (error) {
      const errorMsg = (error as { detail?: string }).detail || "获取照片失败";
      return { success: false, message: errorMsg };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const responseData = data as unknown as ApiResponse<any[]>;
    return { success: true, data: responseData.data };
  } catch (e) {
    console.error("获取装修照片异常:", e);
    return { success: false, message: "网络错误" };
  }
}

/**
 * 添加装修照片
 */
export async function addRenovationPhotoAction(payload: {
  projectId: string;
  stage: string;
  url: string;
  filename?: string;
}) {
  try {
    const client = await fetchClient();
    const { error } = await client.POST(
      "/api/v1/projects/{project_id}/renovation/photos",
      {
        params: {
          path: { project_id: payload.projectId },
          query: {
            stage: payload.stage,
            url: payload.url,
            filename: payload.filename,
          },
        },
      }
    );

    if (error) {
      const errorMsg =
        (error as { detail?: string }).detail || "上传照片记录失败";
      return { success: false, message: errorMsg };
    }

    revalidatePath("/projects");
    return { success: true, message: "上传成功" };
  } catch (e) {
    console.error("上传照片异常:", e);
    return { success: false, message: "网络错误" };
  }
}

/**
 * 更新装修阶段 / 完成阶段
 */
export async function updateRenovationStageAction(payload: {
  projectId: string;
  renovation_stage: string;
  stage_completed_at?: string;
}) {
  try {
    const client = await fetchClient();
    const { error } = await client.PUT(
      "/api/v1/projects/{project_id}/renovation",
      {
        params: { path: { project_id: payload.projectId } },
        body: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          renovation_stage: payload.renovation_stage as any,
          stage_completed_at: payload.stage_completed_at,
        },
      }
    );

    if (error) {
      const errorMsg = (error as { detail?: string }).detail || "更新阶段失败";
      return { success: false, message: errorMsg };
    }

    revalidatePath("/projects");
    return { success: true, message: "阶段更新成功" };
  } catch (e) {
    console.error("更新阶段异常:", e);
    return { success: false, message: "网络错误" };
  }
}
