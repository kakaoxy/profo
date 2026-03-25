"use client";

import * as z from "zod";

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

export const createSchema = z.object({
  title: z.string().trim().min(1, "标题必填"),
  cover_image: imagePathSchema.nullable(),
  style: z.string().trim().min(1, "风格不能为空").nullable(),
  description: z.string().trim().min(1, "描述不能为空").nullable(),
  marketing_tags: tagsSchema,
  share_title: z.string().trim().min(1, "分享标题不能为空").nullable(),
  share_image: imagePathSchema.nullable(),
  consultant_id: z.string().trim().min(1, "顾问不能为空").nullable(),
  sort_order: z.number().int().min(0, "排序权重不能小于 0"),
  is_published: z.boolean(),
});

export const updateSchema = z.object({
  title: z.string().trim().min(1, "标题必填").optional(),
  cover_image: imagePathSchema.nullable().optional(),
  style: z.string().trim().min(1, "风格不能为空").nullable().optional(),
  description: z.string().trim().min(1, "描述不能为空").nullable().optional(),
  marketing_tags: tagsSchema.optional(),
  share_title: z
    .string()
    .trim()
    .min(1, "分享标题不能为空")
    .nullable()
    .optional(),
  share_image: imagePathSchema.nullable().optional(),
  consultant_id: z.string().trim().min(1, "顾问不能为空").nullable().optional(),
  sort_order: z.number().int().min(0, "排序权重不能小于 0").optional(),
  is_published: z.boolean().optional(),
});

export type CreateValues = z.infer<typeof createSchema>;
export type UpdateValues = z.infer<typeof updateSchema>;
