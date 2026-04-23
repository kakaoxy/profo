/**
 * 项目选择器 API 客户端
 * 使用 Server Actions 进行 API 调用，支持自动认证
 *
 * 空值检查说明：
 * 使用 `value != null ? Type(value) : undefined` 而非 `value ? Type(value) : undefined`，
 * 原因是：
 * 1. 空字符串 `""` 和数字 `0` 是合法值，不应被转换为 undefined
 * 2. 只有 `null` 和 `undefined` 才应被视为"无值"状态
 * 3. `!= null` 同时检查 null 和 undefined（== null 也同理）
 */
import {
  getAvailableL3ProjectsAction,
  importFromL3ProjectAction,
  getL3ProjectDetailAction,
} from "../../actions/l3-projects";
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
 * 将值转换为可选字符串
 * 仅在值为 null/undefined 时返回 undefined，保留空字符串等合法值
 */
function toOptionalString(value: unknown): string | undefined {
  return value != null ? String(value) : undefined;
}

/**
 * 将值转换为可选数字
 * 仅在值为 null/undefined 时返回 undefined，保留 0 等合法值
 */
function toOptionalNumber(value: unknown): number | undefined {
  return value != null ? Number(value) : undefined;
}

/**
 * 转换并验证原始项目数据为L3ProjectBrief格式
 * 处理后端返回的类型不匹配问题（如area字段为字符串而非数字）
 * 使用Zod Schema进行运行时验证，确保数据完整性
 */
function transformProjectData(rawData: Record<string, unknown>): L3ProjectBrief {
  // 先进行数据转换，处理类型不匹配问题
  const transformed = {
    id: String(rawData.id || ""),
    name: String(rawData.name || ""),
    community_name: String(rawData.community_name || ""),
    address: String(rawData.address || ""),
    area: toOptionalNumber(rawData.area),
    layout: toOptionalString(rawData.layout),
    orientation: toOptionalString(rawData.orientation),
    status: String(rawData.status || ""),
  };

  // 使用Zod Schema进行运行时验证
  const parseResult = L3ProjectBriefSchema.safeParse(transformed);
  if (!parseResult.success) {
    console.error("项目数据转换失败:", parseResult.error);
    throw new Error(`项目数据格式错误: ${parseResult.error.message}`);
  }

  return parseResult.data;
}

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

  // 转换后端返回的数据格式（处理类型不匹配问题）
  const rawData = result.data as { items: Array<Record<string, unknown>>; total: number; page: number; page_size: number };
  const transformedData = {
    items: rawData.items.map(transformProjectData),
    total: Number(rawData.total || 0),
    page: Number(rawData.page || 1),
    page_size: Number(rawData.page_size || 20),
  };

  // 使用Zod进行运行时类型验证
  const parseResult = L3ProjectListResponseSchema.safeParse(transformedData);
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
    community_id: toOptionalString(rawData.community_id),
    community_name: String(rawData.community_name || ""),
    layout: toOptionalString(rawData.layout),
    orientation: toOptionalString(rawData.orientation),
    floor_info: toOptionalString(rawData.floor_info),
    area: toOptionalNumber(rawData.area),
    total_price: toOptionalNumber(rawData.total_price),
    unit_price: toOptionalNumber(rawData.unit_price),
    title: String(rawData.title || ""),
    tags: toOptionalString(rawData.tags),
    decoration_style: toOptionalString(rawData.decoration_style),
    status: toOptionalString(rawData.status),
    available_media: rawMedia.map((media) => ({
      id: String(media.id || ""),
      file_url: String(media.file_url || ""),
      thumbnail_url: toOptionalString(media.thumbnail_url),
      photo_category: String(media.photo_category || "renovation"),
      renovation_stage: toOptionalString(media.renovation_stage),
      description: toOptionalString(media.description),
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

  // 转换并验证后端返回的数据格式（transformProjectData内部已包含Zod验证）
  return transformProjectData(result.data as Record<string, unknown>);
}
