"use client";

import * as z from "zod";

// 项目状态枚举
export const projectStatusSchema = z.enum(["在途", "在售", "已售"]);

// 发布状态枚举
export const publishStatusSchema = z.enum(["草稿", "发布"]);

// 前端表单使用的Schema - 所有字段都是必填的
export const formSchema = z.object({
  // 小区信息
  community_id: z.string().min(1, "请选择小区"),
  community_name: z.string().trim().optional(),

  // 户型信息
  layout: z.string().trim().min(1, "请输入户型").max(100),
  orientation: z.string().trim().min(1, "请输入朝向").max(50),
  floor_info: z.string().trim().min(1, "请输入楼层信息").max(100),

  // 面积与价格
  area: z.number().positive("面积必须大于0"),
  total_price: z.number().positive("总价必须大于0"),
  unit_price: z.number().optional(),

  // 营销信息
  title: z.string().trim().min(1, "请输入标题").max(255),
  images: z.array(z.string()),
  sort_order: z.number().int().min(0),
  tags: z.array(z.string()),
  decoration_style: z.string().trim().max(100).optional(),

  // 状态
  publish_status: publishStatusSchema,
  project_status: projectStatusSchema,

  // 关联 - consultant_id 为 UUID 字符串，对应 User 表的 id 字段
  consultant_id: z.string().trim().min(1).max(36).optional(),

  // 关联L3项目ID（软引用）- 后端期望字符串类型(UUID)
  project_id: z.string().trim().min(1).max(36).nullable().optional(),
});

export type FormValues = z.infer<typeof formSchema>;

// 创建表单 Schema - 与后端 L4MarketingProjectCreate 保持一致
// 后端已支持数组格式，前端直接发送数组
export const createSchema = z.object({
  // 必填字段 - 小区信息
  community_id: z.string().min(1, "请选择小区"),

  // 必填字段 - 户型信息
  layout: z.string().trim().min(1, "户型不能为空").max(100, "户型最多100个字符"),
  orientation: z.string().trim().min(1, "朝向不能为空").max(50, "朝向最多50个字符"),
  floor_info: z.string().trim().min(1, "楼层信息不能为空").max(100, "楼层信息最多100个字符"),

  // 必填字段 - 面积与价格
  area: z.number().positive("面积必须大于0"),
  total_price: z.number().positive("总价必须大于0"),

  // 必填字段 - 营销信息
  title: z.string().trim().min(1, "标题不能为空").max(255, "标题最多255个字符"),
  images: z.array(z.string()).optional().default([]),
  sort_order: z.number().int().min(0, "排序权重不能小于0").default(0),
  tags: z.array(z.string()).optional().default([]),
  decoration_style: z.string().trim().max(100, "装修风格最多100个字符").nullable().optional(),

  // 状态字段
  publish_status: publishStatusSchema.default("草稿"),
  project_status: projectStatusSchema.default("在途"),

  // 关联字段 - project_id 为字符串类型(UUID)
  project_id: z.string().trim().min(1).max(36).nullable().optional(),
  // consultant_id 为 UUID 字符串，对应 User 表的 id 字段
  consultant_id: z.string().trim().min(1).max(36).nullable().optional(),
});

// 更新表单 Schema - 与后端 L4MarketingProjectUpdate 保持一致
// 后端已支持数组格式，前端直接发送数组
export const updateSchema = z.object({
  community_id: z.string().min(1, "请选择小区").optional(),
  community_name: z.string().trim().max(200, "小区名称最多200个字符").nullable().optional(),
  layout: z.string().trim().min(1, "户型不能为空").max(100, "户型最多100个字符").optional(),
  orientation: z.string().trim().min(1, "朝向不能为空").max(50, "朝向最多50个字符").optional(),
  floor_info: z.string().trim().min(1, "楼层信息不能为空").max(100, "楼层信息最多100个字符").optional(),
  area: z.number().positive("面积必须大于0").optional(),
  total_price: z.number().positive("总价必须大于0").optional(),
  title: z.string().trim().min(1, "标题不能为空").max(255, "标题最多255个字符").optional(),
  images: z.array(z.string()).optional(),
  sort_order: z.number().int().min(0, "排序权重不能小于0").optional(),
  tags: z.array(z.string()).optional(),
  decoration_style: z.string().trim().max(100, "装修风格最多100个字符").nullable().optional(),
  publish_status: publishStatusSchema.optional(),
  project_status: projectStatusSchema.optional(),
  // 关联字段 - project_id 为字符串类型(UUID)
  project_id: z.string().trim().min(1).max(36).nullable().optional(),
  // consultant_id 为 UUID 字符串，对应 User 表的 id 字段
  consultant_id: z.string().trim().min(1).max(36).nullable().optional(),
});

export type CreateValues = z.infer<typeof createSchema>;
export type UpdateValues = z.infer<typeof updateSchema>;

// 媒体文件类型
export interface MediaFile {
  file_url: string;
  thumbnail_url?: string;
  media_type: "image" | "video";
  photo_category: "marketing" | "renovation";
  renovation_stage?: string | null;
  description?: string;
  sort_order?: number;
}

// 将表单值转换为API创建请求
// 后端已支持数组格式，直接传递数组
export function formValuesToCreateRequest(
  values: FormValues,
  mediaFiles?: MediaFile[]
): Record<string, unknown> {
  // 计算单价（万元/㎡），与后端计算逻辑保持一致
  // 后端逻辑：unit_price = total_price / area
  const unitPrice = values.area > 0
    ? Number((values.total_price / values.area).toFixed(2))
    : 0;

  const result: Record<string, unknown> = {
    community_id: values.community_id,
    community_name: values.community_name || null,
    layout: values.layout,
    orientation: values.orientation,
    floor_info: values.floor_info,
    area: values.area,
    total_price: values.total_price,
    unit_price: unitPrice,
    title: values.title,
    images: values.images,
    sort_order: values.sort_order,
    tags: values.tags,
    decoration_style: values.decoration_style || null,
    publish_status: values.publish_status,
    project_status: values.project_status,
    consultant_id: values.consultant_id,
  };

  // 关联L3项目ID - 后端期望字符串类型(UUID)
  if (values.project_id !== undefined) {
    result.project_id = values.project_id;
  }

  // 如果有媒体文件，添加到请求中
  if (mediaFiles && mediaFiles.length > 0) {
    result.media_files = mediaFiles;
  }

  return result;
}

// 将表单值转换为API更新请求
// 后端已支持数组格式，直接传递数组
export function formValuesToUpdateRequest(values: Partial<FormValues>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  if (values.community_id !== undefined) result.community_id = values.community_id;
  if (values.community_name !== undefined) result.community_name = values.community_name || null;
  if (values.layout !== undefined) result.layout = values.layout;
  if (values.orientation !== undefined) result.orientation = values.orientation;
  if (values.floor_info !== undefined) result.floor_info = values.floor_info;
  if (values.area !== undefined) result.area = values.area;
  if (values.total_price !== undefined) result.total_price = values.total_price;
  if (values.title !== undefined) result.title = values.title;
  if (values.images !== undefined) result.images = values.images;
  if (values.sort_order !== undefined) result.sort_order = values.sort_order;
  if (values.tags !== undefined) result.tags = values.tags;
  if (values.decoration_style !== undefined) result.decoration_style = values.decoration_style || null;
  if (values.publish_status !== undefined) result.publish_status = values.publish_status;
  if (values.project_status !== undefined) result.project_status = values.project_status;
  if (values.consultant_id !== undefined) result.consultant_id = values.consultant_id;
  if (values.project_id !== undefined) result.project_id = values.project_id;

  // 如果总价或面积发生变化，重新计算单价（万元/㎡）
  // 与后端计算逻辑保持一致：unit_price = total_price / area
  if (values.total_price !== undefined || values.area !== undefined) {
    const area = values.area ?? 0;
    const totalPrice = values.total_price ?? 0;
    if (area > 0) {
      result.unit_price = Number((totalPrice / area).toFixed(2));
    }
  }

  return result;
}

// 将API响应转换为表单值
// 注意：后端现在直接返回数组格式，无需再进行 split 转换
export function projectToFormValues(project: Record<string, unknown>): FormValues {
  return {
    community_id: (project.community_id as string) || "",
    community_name: (project.community_name as string) || undefined,
    layout: (project.layout as string) || "",
    orientation: (project.orientation as string) || "",
    floor_info: (project.floor_info as string) || "",
    area: typeof project.area === "string" ? parseFloat(project.area) : (project.area as number) || 0,
    total_price: typeof project.total_price === "string" ? parseFloat(project.total_price) : (project.total_price as number) || 0,
    unit_price: typeof project.unit_price === "string" ? parseFloat(project.unit_price) : (project.unit_price as number) || undefined,
    title: (project.title as string) || "",
    // 后端直接返回数组，直接使用
    images: Array.isArray(project.images) ? project.images as string[] : [],
    sort_order: (project.sort_order as number) || 0,
    // 后端直接返回数组，直接使用
    tags: Array.isArray(project.tags) ? project.tags as string[] : [],
    decoration_style: (project.decoration_style as string) || undefined,
    publish_status: (project.publish_status as "草稿" | "发布") || "草稿",
    project_status: (project.project_status as "在途" | "在售" | "已售") || "在途",
    consultant_id: (project.consultant_id as string) || undefined,
    project_id: (project.project_id as string) || undefined,
  };
}

/**
 * 将L3项目状态映射为L4项目状态
 * L3状态: signing(签约中/在途), for_sale/on_sale(在售), sold(已售), renovating(装修中)等
 * L4状态: 在途, 在售, 已售
 */
function mapL3StatusToL4(status?: string): "在途" | "在售" | "已售" {
  if (!status) return "在途";

  const statusMap: Record<string, "在途" | "在售" | "已售"> = {
    signing: "在途",
    for_sale: "在售",
    on_sale: "在售",
    available: "在售",
    sold: "已售",
    completed: "已售",
    renovating: "在途",
    renovation: "在途",
    pending: "在途",
  };

  return statusMap[status.toLowerCase()] || "在途";
}

// 将导入数据转换为表单值
// 注意：后端现在直接返回数组格式，无需再进行 split 转换
export function importDataToFormValues(data: Record<string, unknown>): Partial<FormValues> {
  // project_id 保持字符串类型（后端返回的是UUID字符串）
  const projectId = (data.project_id as string) || undefined;

  return {
    project_id: projectId,
    community_id: (data.community_id as string) || "",
    community_name: (data.community_name as string) || "",
    layout: (data.layout as string) || "",
    orientation: (data.orientation as string) || "",
    floor_info: (data.floor_info as string) || "",
    area: typeof data.area === "string" ? parseFloat(data.area) : (data.area as number) || 0,
    total_price: typeof data.total_price === "string" ? parseFloat(data.total_price) : (data.total_price as number) || 0,
    unit_price: typeof data.unit_price === "string" ? parseFloat(data.unit_price) : (data.unit_price as number) || undefined,
    title: (data.title as string) || "",
    // 后端直接返回数组，直接使用
    tags: Array.isArray(data.tags) ? data.tags as string[] : [],
    decoration_style: (data.decoration_style as string) || "",
    project_status: mapL3StatusToL4(data.status as string),
  };
}
