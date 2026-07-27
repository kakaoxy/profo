import { z } from "zod";

import { isValidUrl } from "@/lib/validators";

import { LeadStatus } from "../types";

/**
 * Lead 字段约束，对齐后端 Lead Pydantic 模型
 *
 * 参考：
 * - (c)/valuation/actions.ts::createLeadSchema
 * - ../types.ts::Lead
 *
 * 仅覆盖 lead-actions.ts::toCreatePayload / toUpdatePayload 中转发的可写字段；
 * creatorName/auditorId/auditTime/updatedAt/lastFollowUpAt 等由后端注入，不在此校验。
 */
const leadStatusEnum = z.nativeEnum(LeadStatus);

export const createLeadSchema = z.object({
  communityName: z.string().min(1, "小区名称不能为空").max(200),
  communityId: z.string().min(1).optional(),
  layout: z.string().min(1, "户型不能为空").max(50),
  orientation: z.string().min(1, "朝向不能为空").max(20),
  floorInfo: z.string().min(1, "楼层信息不能为空").max(50),
  area: z.number().positive("面积必须大于 0").max(100000),
  totalPrice: z.number().nonnegative("总价不能为负").max(1000000),
  unitPrice: z.number().nonnegative("单价不能为负").max(1000000),
  district: z.string().min(1, "区域不能为空").max(100),
  businessArea: z.string().min(1, "商圈不能为空").max(100),
  remarks: z.string().max(2000),
  images: z
    .array(z.string().refine(isValidUrl, { message: "图片 URL 不合法" }))
    .max(6, "最多 6 张图片"),
  status: leadStatusEnum,
  auditReason: z.string().max(500).nullable().optional(),
});

export const updateLeadSchema = createLeadSchema.partial();

export const leadIdSchema = z.string().min(1, "线索 ID 不能为空");
