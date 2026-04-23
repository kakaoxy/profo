/**
 * 项目选择器模块 - Zod Schema定义
 * 提供运行时类型验证
 */
import { z } from "zod";

/** L3项目简要信息Schema */
export const L3ProjectBriefSchema = z.object({
  id: z.string(),
  name: z.string(),
  community_name: z.string(),
  address: z.string(),
  area: z.number().optional(),
  layout: z.string().optional(),
  orientation: z.string().optional(),
  status: z.string(),
});

/** L3项目列表响应Schema */
export const L3ProjectListResponseSchema = z.object({
  items: z.array(L3ProjectBriefSchema),
  total: z.number(),
  page: z.number(),
  page_size: z.number(),
});

/** 可导入媒体资源Schema */
export const ImportableMediaSchema = z.object({
  id: z.string(),
  file_url: z.string(),
  thumbnail_url: z.string().optional(),
  photo_category: z.string(),
  renovation_stage: z.string().optional(),
  description: z.string().optional(),
  sort_order: z.number(),
  media_type: z.enum(["image", "video"]).optional(),
});

/** 导入预览数据Schema */
export const ImportPreviewDataSchema = z.object({
  project_id: z.string(),
  community_id: z.string().optional(),
  community_name: z.string(),
  layout: z.string().optional(),
  orientation: z.string().optional(),
  floor_info: z.string().optional(),
  area: z.number().optional(),
  total_price: z.number().optional(),
  unit_price: z.number().optional(),
  title: z.string(),
  tags: z.string().optional(),
  decoration_style: z.string().optional(),
  status: z.string().optional(),
  available_media: z.array(ImportableMediaSchema),
});

/** 查询参数Schema */
export const ProjectQueryParamsSchema = z.object({
  community_name: z.string().optional(),
  status: z.string().optional(),
  page: z.number(),
  page_size: z.number(),
});

// 类型推断导出
type L3ProjectBrief = z.infer<typeof L3ProjectBriefSchema>;
type L3ProjectListResponse = z.infer<typeof L3ProjectListResponseSchema>;
type ImportableMedia = z.infer<typeof ImportableMediaSchema>;
type ImportPreviewData = z.infer<typeof ImportPreviewDataSchema>;
type ProjectQueryParams = z.infer<typeof ProjectQueryParamsSchema>;
