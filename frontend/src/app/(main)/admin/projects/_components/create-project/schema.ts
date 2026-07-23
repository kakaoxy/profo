import { z } from "zod";
import { components } from "@/lib/api-types";

export type ProjectCreateReq = components["schemas"]["ProjectCreate"];
export type ProjectUpdateReq = components["schemas"]["ProjectUpdate"];

// 使用 z.union 明确允许 string (输入) 和 number (存储)
// 配合 use-create-project.ts 中的 resolver 断言，完美解决类型冲突
const optionalNumber = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((val) => {
    if (val === "" || val === undefined || val === null) {
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
  fileType: z.enum(["excel", "image", "pdf", "word", "video"]),
  size: z.number(),
  uploadedAt: z.string(),
});

export type AttachmentCategory = z.infer<typeof attachmentCategoryEnum>;
export type AttachmentType = z.infer<typeof attachmentSchema>["fileType"];

// 户型房间数验证（正整数）
const roomNumberSchema = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((val) => {
    if (val === "" || val === undefined || val === null) {
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

// 业务形式枚举（"" 表示未设置，对应后端 null）
export const BUSINESS_FORM_OPTIONS = [
  { value: "agent", label: "代理美化" },
  { value: "wholesale", label: "收购美化" },
] as const;

export const businessFormEnum = z.enum(["agent", "wholesale", ""]);

// 业主信息（多业主支持）
const ownerItemSchema = z.object({
  id: z.string().optional(), // 编辑模式：已有业主的 id；新建模式：无
  owner_name: z.string().max(100).optional(),
  owner_phone: z.string().max(20).optional(),
  owner_id_card: z.string().max(18).optional(),
  bank_name: z.string().max(100).optional(),
  bank_card_number: z.string().max(50).optional(),
  relation_type: z.string().max(20).default("业主"),
  owner_info: z.string().optional(),
});

export const ownerItemSchemaExport = ownerItemSchema; // 供 owner-tab 使用

export const formSchema = z
  .object({
    // 基础信息 - 重构后：移除 name, manager, tags 字段
    community_id: z.string().optional(),
    community_name: z.string().min(1, "小区名称不能为空").max(200),
    address: z.string().min(1, "物业地址不能为空").max(500),
    area: optionalNumber,
    project_manager_id: z.string().optional(),

    // 业务形式（agent / wholesale / ""=未设置）默认代理美化
    business_form: businessFormEnum.default("agent"),

    // 行政区（来自小区，前端展示用；新建项目时不写入 project）
    district: z.string().max(50).optional(),

    // 小区原始行政区（选择小区时快照，用于 onSubmit 比对是否被用户修改，隐藏不展示）
    original_community_district: z.string().optional(),

    // 商圈（来自小区，前端展示用；新建项目时不写入 project）
    business_circle: z.string().max(50).optional(),

    // 小区原始商圈（选择小区时快照，用于 onSubmit 比对是否被用户修改，隐藏不展示）
    original_community_business_circle: z.string().optional(),

    // 户型 - 三个独立输入框
    rooms: roomNumberSchema,
    halls: roomNumberSchema,
    bathrooms: roomNumberSchema,

    // 朝向 - 单选框
    orientation: orientationEnum.default("南北"),

    // 楼层信息（如：5/28层），与线索表单格式一致
    floor_info: z.string().max(50).optional(),

    // 公用事业户号
    electricity_account: z.string().max(50).optional(),
    water_account: z.string().max(50).optional(),
    gas_account: z.string().max(50).optional(),

    // 代理协议 - 合同信息
    contract_no: z.string().min(1, "合同编号不能为空").max(100),
    signing_price: optionalNumber,
    signing_date: z.date().nullable().optional(),
    signing_period: optionalNumber,
    extension_period: optionalNumber,
    extension_rent: optionalNumber,
    cost_assumption_type: z.enum(["meifangbao", "owner", "respective", "other"]).default("respective"),
    cost_assumption_other: z.string().max(50).optional(),
    planned_handover_date: z.date().nullable().optional(),
    // 委托期限日期范围
    commission_start_date: z.date().nullable().optional(),
    commission_end_date: z.date().nullable().optional(),
    other_agreements: z.string().optional(),

    // 业主信息（多业主，至少 1 位）
    owners: z
      .array(ownerItemSchema)
      .default([
        {
          owner_name: "",
          owner_phone: "",
          owner_id_card: "",
          bank_name: "",
          bank_card_number: "",
          relation_type: "业主",
          owner_info: "",
        },
      ]),

    // 备注
    notes: z.string().optional(),

    // 附件列表
    attachments: z.array(attachmentSchema).optional(),
  })
  .refine(
    (data) => data.owners && data.owners.length >= 1,
    { message: "至少需要一位业主", path: ["owners"] }
  );
// 移除户型必填验证 - layout 是可选字段，允许用户不填户型

// 这个类型现在被强制用于 useForm 泛型
export type FormValues = z.infer<typeof formSchema>;

export const DRAFT_KEY = "create_project_draft_v2";
