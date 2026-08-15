"use server";

import { logger } from "@/lib/logger";
import { fetchClient } from "@/lib/api-server";
import { extractApiData } from "@/lib/api-helpers";
import { components } from "@/lib/api-types";
import { z } from "zod";
import { PERMISSION_CODES } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/server/require-permission";

export type DocumentResponse = components["schemas"]["DocumentResponse"];
export type DocumentCreate = components["schemas"]["DocumentCreate"];
export type DocumentUpdate = components["schemas"]["DocumentUpdate"];
export type DocumentInitializeResponse = components["schemas"]["DocumentInitializeResponse"];

// ===== Zod 校验 schema（与后端 DocumentCreate/DocumentUpdate 语义对齐）=====
const projectIdSchema = z.string().min(1, "项目 ID 不能为空");
const documentIdSchema = z.string().min(1, "文档 ID 不能为空");

// 创建文书 - 与 DocumentCreate (api-types:3291) 对齐
const documentCreateSchema = z.object({
  document_name: z.string().min(1, "文档名称不能为空"),
  display_order: z.number().int().nullable().optional(),
  category: z
    .enum([
      "contract_agreement",
      "property_rights",
      "identity_account",
      "finance_tax",
      "handover",
      "other",
    ])
    .default("other"),
});

// 更新文书 - 与 DocumentUpdate (api-types:3364) 对齐
// signoff_status 枚举: unsigned/signed/archived
const documentUpdateSchema = z.object({
  document_name: z.string().nullable().optional(),
  signoff_status: z.enum(["unsigned", "signed", "archived"]).nullable().optional(),
  archive_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "归档日期格式应为 YYYY-MM-DD")
    .nullable()
    .optional(),
});

/**
 * 获取项目文书签收列表
 */
export async function getProjectDocumentsAction(projectId: string): Promise<DocumentResponse[]> {
  try {
    const client = await fetchClient();
    const { data, error } = await client.GET("/api/v1/projects/{project_id}/documents", {
      params: { path: { project_id: projectId } },
      cache: "no-store",
    });
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
  const idParsed = projectIdSchema.safeParse(projectId);
  if (!idParsed.success) {
    throw new Error(idParsed.error.issues[0]?.message || "输入校验失败");
  }
  const parsed = documentCreateSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || "输入校验失败");
  }
  const permCheck = await requirePermission(PERMISSION_CODES.PROJECT_WRITE);
  if (!permCheck.ok) {
    throw new Error(permCheck.message);
  }
  try {
    const client = await fetchClient();
    const { data, error } = await client.POST("/api/v1/projects/{project_id}/documents", {
      params: { path: { project_id: projectId } },
      body: payload,
    });
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
  const idParsed = projectIdSchema.safeParse(projectId);
  if (!idParsed.success) {
    throw new Error(idParsed.error.issues[0]?.message || "输入校验失败");
  }
  const docIdParsed = documentIdSchema.safeParse(documentId);
  if (!docIdParsed.success) {
    throw new Error(docIdParsed.error.issues[0]?.message || "输入校验失败");
  }
  const parsed = documentUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || "输入校验失败");
  }
  const permCheck = await requirePermission(PERMISSION_CODES.PROJECT_WRITE);
  if (!permCheck.ok) {
    throw new Error(permCheck.message);
  }
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
  const idParsed = projectIdSchema.safeParse(projectId);
  if (!idParsed.success) {
    throw new Error(idParsed.error.issues[0]?.message || "输入校验失败");
  }
  const docIdParsed = documentIdSchema.safeParse(documentId);
  if (!docIdParsed.success) {
    throw new Error(docIdParsed.error.issues[0]?.message || "输入校验失败");
  }
  const permCheck = await requirePermission(PERMISSION_CODES.PROJECT_WRITE);
  if (!permCheck.ok) {
    throw new Error(permCheck.message);
  }
  try {
    const client = await fetchClient();
    const { error } = await client.DELETE("/api/v1/projects/{project_id}/documents/{document_id}", {
      params: { path: { project_id: projectId, document_id: documentId } },
    });
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
  const idParsed = projectIdSchema.safeParse(projectId);
  if (!idParsed.success) {
    throw new Error(idParsed.error.issues[0]?.message || "输入校验失败");
  }
  const permCheck = await requirePermission(PERMISSION_CODES.PROJECT_WRITE);
  if (!permCheck.ok) {
    throw new Error(permCheck.message);
  }
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
