import { z } from "zod";
import { components } from "@/lib/api-types";

export type ProjectCreateReq = components["schemas"]["ProjectCreate"];

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

export const formSchema = z.object({
  name: z.string().min(1, "项目名称不能为空").max(200),
  community_name: z.string().max(200).optional(),
  address: z.string().max(500).optional(),
  manager: z.string().max(100).optional(),
  tags: z.string().optional(),

  // 交易数据
  signing_price: optionalNumber,
  area: optionalNumber,
  signing_period: optionalNumber,
  extensionPeriod: optionalNumber,
  extensionRent: optionalNumber,

  // 业主信息
  owner_name: z.string().max(100).optional(),
  owner_phone: z.string().max(20).optional(),
  owner_id_card: z.string().max(18).optional(),

  // 日期
  signing_date: z.date().optional(),
  planned_handover_date: z.date().optional(),

  // 协议与备注
  costAssumption: z.string().max(50).optional(),
  otherAgreements: z.string().optional(),
  notes: z.string().optional(),
  remarks: z.string().optional(),

  // 附件列表
  attachments: z.array(attachmentSchema).optional(),
});

// 这个类型现在被强制用于 useForm 泛型
export type FormValues = z.infer<typeof formSchema>;

export const DRAFT_KEY = "create_project_draft_v2";
