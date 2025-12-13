import { z } from "zod";
import { components } from "@/lib/api-types";

// 后端 API 类型
export type ProjectCreateReq = components["schemas"]["ProjectCreate"];

// --- 核心修复 ---
// 1. union: 显式允许 string (输入), number (数值), undefined (默认值), null (可能的空值)
// 2. transform: 统一清洗数据，空值全部转为 undefined
// 3. pipe: 确保最终输出类型严格为 number | undefined
const optionalNumber = z
  .union([z.string(), z.number(), z.undefined(), z.null()])
  .transform((val) => {
    if (val === "" || val === null || val === undefined) {
      return undefined;
    }
    const parsed = Number(val);
    return isNaN(parsed) ? undefined : parsed;
  })
  .pipe(z.number().optional());

export const formSchema = z.object({
  // --- 必填项 ---
  name: z.string().min(1, "项目名称不能为空").max(200),

  // --- 基础信息 ---
  community_name: z.string().max(200).optional(),
  address: z.string().max(500).optional(),
  manager: z.string().max(100).optional(),
  tags: z.string().optional(),

  // --- 交易数据 ---
  signing_price: optionalNumber,
  area: optionalNumber,
  signing_period: optionalNumber,
  extensionPeriod: optionalNumber,
  extensionRent: optionalNumber,

  // --- 业主信息 ---
  owner_name: z.string().max(100).optional(),
  owner_phone: z.string().max(20).optional(),
  owner_id_card: z.string().max(18).optional(),

  // --- 日期 ---
  signing_date: z.date().optional(),
  planned_handover_date: z.date().optional(),

  // --- 协议与备注 ---
  costAssumption: z.string().max(50).optional(),
  otherAgreements: z.string().optional(),
  notes: z.string().optional(),
  remarks: z.string().optional(),
});

export type FormValues = z.infer<typeof formSchema>;

export const DRAFT_KEY = "create_project_draft_v2";
