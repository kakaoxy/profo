/**
 * 项目选择器 API 客户端
 * 使用 Server Actions 进行 API 调用，支持自动认证
 */
import {
  getAvailableL3ProjectsAction,
  importFromL3ProjectAction,
  getL3ProjectDetailAction,
} from "../../actions/projects";
import { detectMediaType } from "@/lib/media-utils";
import {
  L3ProjectBriefSchema,
  L3ProjectListResponseSchema,
  ImportPreviewDataSchema,
} from "./schemas";
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

  // 使用Zod进行运行时类型验证
  const parseResult = L3ProjectListResponseSchema.safeParse(result.data);
  if (!parseResult.success) {
    console.error("项目列表数据格式错误:", parseResult.error);
    throw new Error("获取项目列表失败：数据格式错误");
  }

  return parseResult.data;
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

  // 转换后端返回的数据格式
  const rawData = result.data as Record<string, unknown>;
  const rawMedia = (rawData.available_media || []) as Array<Record<string, unknown>>;

  const transformedData = {
    project_id: String(rawData.project_id || ""),
    community_id: rawData.community_id ? Number(rawData.community_id) : undefined,
    community_name: String(rawData.community_name || ""),
    layout: rawData.layout ? String(rawData.layout) : undefined,
    orientation: rawData.orientation ? String(rawData.orientation) : undefined,
    floor_info: rawData.floor_info ? String(rawData.floor_info) : undefined,
    area: rawData.area ? Number(rawData.area) : undefined,
    total_price: rawData.total_price ? Number(rawData.total_price) : undefined,
    unit_price: rawData.unit_price ? Number(rawData.unit_price) : undefined,
    title: String(rawData.title || ""),
    tags: rawData.tags ? String(rawData.tags) : undefined,
    decoration_style: rawData.decoration_style
      ? String(rawData.decoration_style)
      : undefined,
    available_media: rawMedia.map((media) => ({
      id: String(media.id || ""),
      file_url: String(media.file_url || ""),
      thumbnail_url: media.thumbnail_url
        ? String(media.thumbnail_url)
        : undefined,
      photo_category: String(media.photo_category || "renovation"),
      renovation_stage: media.renovation_stage
        ? String(media.renovation_stage)
        : undefined,
      description: media.description ? String(media.description) : undefined,
      sort_order: Number(media.sort_order || 0),
      media_type: detectMediaType(String(media.file_url || "")),
    })),
  };

  // 使用Zod进行运行时类型验证
  const parseResult = ImportPreviewDataSchema.safeParse(transformedData);
  if (!parseResult.success) {
    console.error("导入数据格式错误:", parseResult.error);
    throw new Error("导入数据失败：数据格式错误");
  }

  return parseResult.data;
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

  // 使用Zod进行运行时类型验证
  const parseResult = L3ProjectBriefSchema.safeParse(result.data);
  if (!parseResult.success) {
    console.error("项目详情数据格式错误:", parseResult.error);
    throw new Error("获取项目详情失败：数据格式错误");
  }

  return parseResult.data;
}
