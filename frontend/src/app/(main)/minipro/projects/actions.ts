"use server";

import { fetchClient } from "@/lib/api-server";
import { revalidatePath } from "next/cache";
import type {
  MiniProjectUpdate,
  MiniProjectCreate,
  ConsultantCreate,
  ConsultantUpdate,
  MiniProjectPhoto
} from "./types";

// --- Projects ---

export async function getMiniProjectsAction(page = 1, pageSize = 20, isPublished?: boolean) {
  const client = await fetchClient();
  const { data, error } = await client.GET("/api/v1/admin/mini/projects", {
    params: {
      query: {
        page,
        page_size: pageSize,
        is_published: isPublished,
      },
    },
  });

  if (error) {
    console.error("Failed to fetch mini projects:", error);
    return { success: false, error: "获取项目列表失败" };
  }

  return { success: true, data };
}

export async function createMiniProjectAction(body: MiniProjectCreate) {
  const client = await fetchClient();
  const { data, error } = await client.POST("/api/v1/admin/mini/projects", {
    body,
  });

  if (error) {
    console.error("Failed to create mini project:", error);
    return { success: false, error: "创建项目失败" };
  }

  revalidatePath("/minipro/projects");
  return { success: true, data };
}

export async function getMiniProjectAction(id: string) {
  const client = await fetchClient();
  const { data, error } = await client.GET("/api/v1/admin/mini/projects/{id}", {
    params: { path: { id } },
  });

  if (error) {
    console.error("Failed to fetch mini project:", error);
    return { success: false, error: "获取项目详情失败" };
  }

  return { success: true, data };
}

export async function updateMiniProjectAction(id: string, body: MiniProjectUpdate) {
  const client = await fetchClient();
  const { data, error } = await client.PUT("/api/v1/admin/mini/projects/{id}", {
    params: { path: { id } },
    body,
  });

  if (error) {
    console.error("Failed to update mini project:", error);
    return { success: false, error: "更新项目失败" };
  }

  revalidatePath(`/minipro/projects/${id}`);
  revalidatePath("/minipro/projects");
  return { success: true, data };
}

export async function syncMiniProjectsAction() {
  const client = await fetchClient();
  const { data, error } = await client.POST("/api/v1/admin/mini/projects/sync");

  if (error) {
    console.error("Failed to sync mini projects:", error);
    return { success: false, error: "同步失败" };
  }

  revalidatePath("/minipro/projects");
  return { success: true, data };
}

export async function refreshMiniProjectAction(id: string) {
  const client = await fetchClient();
  const { data, error } = await client.PUT("/api/v1/admin/mini/projects/{id}/refresh", {
    params: { path: { id } },
  });

  if (error) {
    console.error("Failed to refresh mini project:", error);
    return { success: false, error: "刷新项目失败" };
  }

  revalidatePath(`/minipro/projects/${id}`);
  return { success: true, data };
}

// --- Photos ---

export async function getSourcePhotosAction(id: string) {
  const client = await fetchClient();
  const { data, error } = await client.GET("/api/v1/admin/mini/projects/{id}/source-photos", {
    params: { path: { id } },
  });

  if (error) {
    console.error("Failed to fetch source photos:", error);
    return { success: false, error: "获取源照片失败" };
  }

  return { success: true, data };
}

export async function getMiniPhotosAction(id: string) {
  const client = await fetchClient();
  const { data, error } = await client.GET("/api/v1/admin/mini/projects/{id}/photos", {
    params: { path: { id } },
  });

  if (error) {
    console.error("Failed to fetch mini photos:", error);
    return { success: false, error: "获取项目照片失败" };
  }

  return { success: true, data };
}

export async function addMiniPhotoAction(
  projectId: string,
  imageUrl: string,
  renovationStage = 'other',
  originPhotoId?: string
) {
  const client = await fetchClient();
  const { data, error } = await client.POST('/api/v1/admin/mini/projects/{id}/photos', {
    params: { path: { id: projectId } },
    body: {
      image_url: imageUrl || null,
      renovation_stage: renovationStage,
      sort_order: 0,
      origin_photo_id: originPhotoId || null,
    },
  });

  if (error) {
    console.error('Failed to add photo:', error);
    return { success: false, error: '添加照片失败' };
  }

  return { success: true, data };
}

export async function deleteMiniPhotoAction(photoId: string) {
  const client = await fetchClient();
  const { data, error } = await client.DELETE("/api/v1/admin/mini/photos/{photo_id}", {
    params: { path: { photo_id: photoId } },
  });

  if (error) {
    console.error("Failed to delete photo:", error);
    return { success: false, error: "删除照片失败" };
  }

  return { success: true, data };
}

export async function batchAddPhotosAction(projectId: string, photoIds: string[]) {
  const results: MiniProjectPhoto[] = [];
  const errors: string[] = [];

  for (const photoId of photoIds) {
    const result = await addMiniPhotoAction(projectId, '', 'other', photoId);
    if (result.success && result.data) {
      results.push(result.data as MiniProjectPhoto);
    } else {
      errors.push(`ID: ${photoId}`);
    }
  }

  if (errors.length > 0) {
    return { success: results.length > 0, data: results, error: `部分照片添加失败: ${errors.join(', ')}` };
  }

  return { success: true, data: results };
}

// --- Consultants ---

export async function getConsultantsAction(page = 1, pageSize = 20) {
  const client = await fetchClient();
  const { data, error } = await client.GET("/api/v1/admin/mini/consultants", {
    params: {
      query: {
        page,
        page_size: pageSize,
      },
    },
  });

  if (error) {
    console.error("Failed to fetch consultants:", error);
    return { success: false, error: "获取咨询师列表失败" };
  }

  return { success: true, data };
}

export async function createConsultantAction(body: ConsultantCreate) {
  const client = await fetchClient();
  const { data, error } = await client.POST("/api/v1/admin/mini/consultants", {
    body,
  });

  if (error) {
    console.error("Failed to create consultant:", error);
    return { success: false, error: "创建咨询师失败" };
  }

  return { success: true, data };
}

export async function updateConsultantAction(id: string, body: ConsultantUpdate) {
  const client = await fetchClient();
  const { data, error } = await client.PUT("/api/v1/admin/mini/consultants/{id}", {
    params: { path: { id } },
    body,
  });

  if (error) {
    console.error("Failed to update consultant:", error);
    return { success: false, error: "更新咨询师失败" };
  }

  return { success: true, data };
}

