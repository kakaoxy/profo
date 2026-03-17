import { z } from "zod";
import { components } from "@/lib/api-types";

export type ProjectCreateReq = components["schemas"]["ProjectCreate"];
export type ProjectUpdateReq = components["schemas"]["ProjectUpdate"];

// 使用 z.union 明确允许 string (输入) 和 number (存储)
// 配合 use-create-project.ts 中的 resolver 断言，完美解决类型冲突
const optionalNumber = z
  .union([z.string(), z.number(), z.undefined()])
  .transform((val) => {
    if (val === "" || val === undefined) {
      return undefined;
    }
    const num = Number(val);
    return isNaN(num) ? undefined : num;
  });

// 附件分类枚举
const attachmentCategoryEnum = z.enum([
  "signing_contract",
  "property_certificate",
  "property_survey",
  "owner_id_card",
  "owner_bank_card",
  "renovation_contract",
  "handover_document",
  "receipt",
  "cooperation_confirmation",
  "store_investment_agreement",
  "value_added_service",
  "other",
]);

// 附件验证 schema
const attachmentSchema = z.object({
  id: z.string(),
  filename: z.string(),
  url: z.string(),
  category: attachmentCategoryEnum,
  fileType: z.enum(["excel", "image", "pdf", "word"]),
  size: z.number(),
  uploadedAt: z.string(),
});

export type AttachmentCategory = z.infer<typeof attachmentCategoryEnum>;
export type AttachmentType = z.infer<typeof attachmentSchema>["fileType"];

// 户型房间数验证（正整数）
const roomNumberSchema = z
  .union([z.string(), z.number(), z.undefined()])
  .transform((val) => {
    if (val === "" || val === undefined) {
      return undefined;
    }
    const num = Number(val);
    return isNaN(num) ? undefined : num;
  })
  .refine((val) => val === undefined || (Number.isInteger(val) && val >= 0), {
    message: "请输入非负整数",
  });

// 朝向选项
export const ORIENTATION_OPTIONS = [
  { value: "南北", label: "南北" },
  { value: "南", label: "南" },
  { value: "东", label: "东" },
  { value: "西", label: "西" },
  { value: "北", label: "北" },
] as const;

export const orientationEnum = z.enum(["南北", "南", "东", "西", "北"]);

export const formSchema = z
  .object({
    // 基础信息 - 重构后：移除 name, manager, tags 字段
    community_name: z.string().max(200).optional(),
    address: z.string().max(500).optional(),
    area: optionalNumber,

    // 户型 - 三个独立输入框
    rooms: roomNumberSchema,
    halls: roomNumberSchema,
    bathrooms: roomNumberSchema,

    // 朝向 - 单选框
    orientation: orientationEnum.default("南北"),

    // 交易数据
    signing_price: optionalNumber,
    signing_period: optionalNumber,
    extension_period: optionalNumber,
    extension_rent: optionalNumber,

    // 业主信息
    owner_name: z.string().max(100).optional(),
    owner_phone: z.string().max(20).optional(),
    owner_id_card: z.string().max(18).optional(),

    // 日期
    signing_date: z.date().optional(),
    planned_handover_date: z.date().optional(),

    // 协议与备注 - 使用下划线命名与后端保持一致
    cost_assumption: z.string().max(50).optional(),
    other_agreements: z.string().optional(),
    notes: z.string().optional(),

    // 附件列表
    attachments: z.array(attachmentSchema).optional(),
  })
  .refine(
    (data) => {
      // 至少有一个户型数值不为零
      const hasRooms = data.rooms !== undefined && data.rooms > 0;
      const hasHalls = data.halls !== undefined && data.halls > 0;
      const hasBathrooms = data.bathrooms !== undefined && data.bathrooms > 0;
      return hasRooms || hasHalls || hasBathrooms;
    },
    {
      message: "户型至少需要一个数值（室、厅、卫至少填一个）",
      path: ["rooms"],
    }
  );

// 这个类型现在被强制用于 useForm 泛型
export type FormValues = z.infer<typeof formSchema>;

export const DRAFT_KEY = "create_project_draft_v2";
