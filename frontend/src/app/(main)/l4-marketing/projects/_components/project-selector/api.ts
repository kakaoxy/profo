/**
 * 项目选择器 API 客户端
 * 使用 Server Actions 进行 API 调用，支持自动认证
 */
import {
  getAvailableL3ProjectsAction,
  importFromL3ProjectAction,
  getL3ProjectDetailAction,
} from "../../actions/projects";
import type {
  L3ProjectBrief,
  L3ProjectListResponse,
  ImportPreviewData,
  ProjectQueryParams,
} from "./types";

/**
 * 获取可关联的L3项目列表
 */
export async function fetchAvailableProjects(
  params: ProjectQueryParams
): Promise<L3ProjectListResponse> {
  const result = await getAvailableL3ProjectsAction(params);

  if (!result.success) {
    throw new Error(result.error || "获取项目列表失败");
  }

  if (!result.data) {
    throw new Error("获取项目列表失败：无数据返回");
  }

  return result.data as L3ProjectListResponse;
}

/**
 * 从L3项目导入数据
 */
export async function fetchImportData(
  projectId: string
): Promise<ImportPreviewData> {
  const result = await importFromL3ProjectAction(projectId);

  if (!result.success) {
    throw new Error(result.error || "导入数据失败");
  }

  if (!result.data) {
    throw new Error("导入数据失败：无数据返回");
  }

  return result.data as ImportPreviewData;
}

/**
 * 搜索项目（防抖搜索）
 */
export async function searchProjects(
  keyword: string,
  page: number = 1,
  pageSize: number = 20
): Promise<L3ProjectListResponse> {
  return fetchAvailableProjects({
    community_name: keyword,
    page,
    page_size: pageSize,
  });
}

/**
 * 获取项目详情（用于预览）
 */
export async function fetchProjectDetail(
  projectId: string
): Promise<L3ProjectBrief> {
  const result = await getL3ProjectDetailAction(projectId);

  if (!result.success) {
    throw new Error(result.error || "获取项目详情失败");
  }

  if (!result.data) {
    throw new Error("获取项目详情失败：无数据返回");
  }

  return result.data as L3ProjectBrief;
}
