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
    community_name: z.string().min(1, "小区名称不能为空").max(200),
    address: z.string().min(1, "物业地址不能为空").max(500),
    area: optionalNumber,

    // 户型 - 三个独立输入框
    rooms: roomNumberSchema,
    halls: roomNumberSchema,
    bathrooms: roomNumberSchema,

    // 朝向 - 单选框
    orientation: orientationEnum.default("南北"),

    // 代理协议 - 合同信息
    contract_no: z.string().min(1, "合同编号不能为空").max(100),
    signing_price: optionalNumber,
    signing_date: z.date().optional(),
    signing_period: optionalNumber,
    extension_period: optionalNumber,
    extension_rent: optionalNumber,
    cost_assumption: z.string().max(50).optional(),
    planned_handover_date: z.date().optional(),
    other_agreements: z.string().optional(),

    // 业主信息
    owner_name: z.string().max(100).optional(),
    owner_phone: z.string().max(20).optional(),
    owner_id_card: z.string().max(18).optional(),

    // 备注
    notes: z.string().optional(),

    // 附件列表
    attachments: z.array(attachmentSchema).optional(),
  })
  .refine(
    (data) => {
      // 至少有一个户型数值有定义（允许为0）
      const hasRooms = data.rooms !== undefined;
      const hasHalls = data.halls !== undefined;
      const hasBathrooms = data.bathrooms !== undefined;
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
