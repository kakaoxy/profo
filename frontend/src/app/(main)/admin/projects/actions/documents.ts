"use server";

import { logger } from "@/lib/logger";
import { fetchClient } from "@/lib/api-server";
import { extractApiData } from "@/lib/api-helpers";
import { components } from "@/lib/api-types";

export type DocumentResponse = components["schemas"]["DocumentResponse"];
export type DocumentCreate = components["schemas"]["DocumentCreate"];
export type DocumentUpdate = components["schemas"]["DocumentUpdate"];
export type DocumentInitializeResponse =
  components["schemas"]["DocumentInitializeResponse"];

/**
 * 获取项目文书签收列表
 */
export async function getProjectDocumentsAction(
  projectId: string,
): Promise<DocumentResponse[]> {
  try {
    const client = await fetchClient();
    const { data, error } = await client.GET(
      "/api/v1/projects/{project_id}/documents",
      {
        params: { path: { project_id: projectId } },
        cache: "no-store",
      },
    );
    if (error) {
      throw error;
    }
    return extractApiData<DocumentResponse[]>(data) ?? [];
  } catch (e) {
    logger.error("获取文书列表异常:", e);
    throw e instanceof Error ? e : new Error("获取文书列表失败");
  }
}

/**
 * 新增文书
 */
export async function createProjectDocumentAction(
  projectId: string,
  payload: DocumentCreate,
): Promise<DocumentResponse> {
  try {
    const client = await fetchClient();
    const { data, error } = await client.POST(
      "/api/v1/projects/{project_id}/documents",
      {
        params: { path: { project_id: projectId } },
        body: payload,
      },
    );
    if (error) {
      throw error;
    }
    return extractApiData<DocumentResponse>(data);
  } catch (e) {
    logger.error("新增文书异常:", e);
    throw e instanceof Error ? e : new Error("新增文书失败");
  }
}

/**
 * 更新文书签收状态/归档日期/名称
 */
export async function updateProjectDocumentAction(
  projectId: string,
  documentId: string,
  payload: DocumentUpdate,
): Promise<DocumentResponse> {
  try {
    const client = await fetchClient();
    const { data, error } = await client.PATCH(
      "/api/v1/projects/{project_id}/documents/{document_id}",
      {
        params: { path: { project_id: projectId, document_id: documentId } },
        body: payload,
      },
    );
    if (error) {
      throw error;
    }
    return extractApiData<DocumentResponse>(data);
  } catch (e) {
    logger.error("更新文书异常:", e);
    throw e instanceof Error ? e : new Error("更新文书失败");
  }
}

/**
 * 删除文书（逻辑删除）
 */
export async function deleteProjectDocumentAction(
  projectId: string,
  documentId: string,
): Promise<void> {
  try {
    const client = await fetchClient();
    const { error } = await client.DELETE(
      "/api/v1/projects/{project_id}/documents/{document_id}",
      {
        params: { path: { project_id: projectId, document_id: documentId } },
      },
    );
    if (error) {
      throw error;
    }
  } catch (e) {
    logger.error("删除文书异常:", e);
    throw e instanceof Error ? e : new Error("删除文书失败");
  }
}

/**
 * 初始化默认文书清单（幂等）
 */
export async function initializeDocumentsAction(
  projectId: string,
): Promise<DocumentInitializeResponse> {
  try {
    const client = await fetchClient();
    const { data, error } = await client.POST(
      "/api/v1/projects/{project_id}/documents/initialize",
      {
        params: { path: { project_id: projectId } },
      },
    );
    if (error) {
      throw error;
    }
    return extractApiData<DocumentInitializeResponse>(data);
  } catch (e) {
    logger.error("初始化文书异常:", e);
    throw e instanceof Error ? e : new Error("初始化文书失败");
  }
}
