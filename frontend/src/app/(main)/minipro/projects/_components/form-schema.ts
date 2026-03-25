"use client";

import * as z from "zod";

// 图片路径验证
export const imagePathSchema = z
  .string()
  .trim()
  .min(1, "图片地址不能为空")
  .refine(
    (val) =>
      val.startsWith("http://") ||
      val.startsWith("https://") ||
      val.startsWith("/"),
    "请输入 http(s) URL 或以 / 开头的路径",
  );

// 标签数组验证（前端表单使用数组，提交时转换为逗号分隔字符串）
export const tagsSchema = z
  .array(z.string().trim().min(1, "标签不能为空"))
  .max(20, "最多 20 个标签")
  .superRefine((tags, ctx) => {
    const seen = new Set<string>();
    for (const tag of tags) {
      const key = tag.toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({ code: "custom", message: "标签不能重复" });
        break;
      }
      seen.add(key);
    }
  });

// 项目状态枚举
export const projectStatusSchema = z.enum(["在途", "在售", "已售"]);

// 创建表单 Schema - 与后端 L4MarketingProjectCreate 保持一致
export const createSchema = z.object({
  // 必填字段
  title: z.string().trim().min(1, "营销标题不能为空").max(200, "标题最多 200 个字符"),

  // 可选字段（与后端保持一致，不强制要求最小长度）
  cover_image: z.string().trim().nullable().default(null),
  style: z.string().trim().max(50, "风格最多 50 个字符").nullable().default(null),
  description: z.string().trim().nullable().default(null),
  share_title: z.string().trim().max(100, "分享标题最多 100 个字符").nullable().default(null),
  share_image: z.string().trim().nullable().default(null),

  // 标签（前端使用数组，提交时转换为逗号分隔字符串）
  marketing_tags: tagsSchema.default([]),

  // 关联字段
  consultant_id: z.string().trim().nullable().default(null),

  // 状态字段
  project_status: projectStatusSchema.default("在途"),
  sort_order: z.number().int().min(0, "排序权重不能小于 0").default(0),
  is_published: z.boolean().default(false),
});

// 更新表单 Schema - 与后端 L4MarketingProjectUpdate 保持一致
export const updateSchema = z.object({
  title: z.string().trim().min(1, "营销标题不能为空").max(200, "标题最多 200 个字符").optional(),
  cover_image: z.string().trim().nullable().optional(),
  style: z.string().trim().max(50, "风格最多 50 个字符").nullable().optional(),
  description: z.string().trim().nullable().optional(),
  share_title: z.string().trim().max(100, "分享标题最多 100 个字符").nullable().optional(),
  share_image: z.string().trim().nullable().optional(),
  marketing_tags: tagsSchema.optional(),
  consultant_id: z.string().trim().nullable().optional(),
  project_status: projectStatusSchema.optional(),
  sort_order: z.number().int().min(0, "排序权重不能小于 0").optional(),
  is_published: z.boolean().optional(),
});

export type CreateValues = z.infer<typeof createSchema>;
export type UpdateValues = z.infer<typeof updateSchema>;
