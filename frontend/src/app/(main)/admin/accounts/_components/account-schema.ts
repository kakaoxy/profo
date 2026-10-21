import { z } from "zod";

/**
 * 资金账户 Zod 校验 schema，语义对齐后端 Pydantic（schemas/finance/fund_account.py）。
 *
 * ⚠️ 一致性约束：任何字段改动都要两边同步（AGENTS.md §2「表单 Zod schema 需与后端
 * Pydantic 语义对齐」）。后端上限：name 24 / account_no 40 / holder 50 / note 120。
 */

export const fundAccountTypeSchema = z.enum(["bank", "corp", "wechat", "alipay", "cash"]);
export const fundAccountStatusSchema = z.enum(["active", "off"]);

export const ACCOUNT_NAME_MAX = 24;
export const ACCOUNT_NO_MAX = 40;
export const ACCOUNT_HOLDER_MAX = 50;
export const ACCOUNT_NOTE_MAX = 120;

/** 新建账户：名称必填、期初余额必填（可为 0）、起算日期必填 */
export const accountCreateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "请填写账户名称")
    .max(ACCOUNT_NAME_MAX, `账户名称最多 ${ACCOUNT_NAME_MAX} 字`),
  type: fundAccountTypeSchema,
  account_no: z.string().trim().max(ACCOUNT_NO_MAX, "卡号过长").nullable().optional(),
  holder: z.string().trim().max(ACCOUNT_HOLDER_MAX, "开户人过长").nullable().optional(),
  opening_balance: z
    .number({ message: "请填写期初余额（可为 0）" })
    .min(0, "期初余额不能为负数"),
  opening_date: z.string().min(1, "请选择期初余额起算日期"),
  status: fundAccountStatusSchema.default("active"),
  note: z.string().trim().max(ACCOUNT_NOTE_MAX, "备注最多 120 字").nullable().optional(),
});

/** 更新账户：所有字段可选（PATCH 语义） */
export const accountUpdateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "请填写账户名称")
    .max(ACCOUNT_NAME_MAX, `账户名称最多 ${ACCOUNT_NAME_MAX} 字`)
    .optional(),
  type: fundAccountTypeSchema.optional(),
  account_no: z.string().trim().max(ACCOUNT_NO_MAX).nullable().optional(),
  holder: z.string().trim().max(ACCOUNT_HOLDER_MAX).nullable().optional(),
  opening_balance: z.number().min(0, "期初余额不能为负数").optional(),
  opening_date: z.string().min(1).optional(),
  status: fundAccountStatusSchema.optional(),
  note: z.string().trim().max(ACCOUNT_NOTE_MAX).nullable().optional(),
});

/** 对账调整：实际余额与原因必填（差额为 0 由后端拒绝，前端也做提示） */
export const adjustmentCreateSchema = z.object({
  adjust_date: z.string().min(1, "请选择调整日期"),
  actual_balance: z.number({ message: "请填写对账后的实际余额" }),
  reason: z.string().trim().min(1, "请写明差额原因").max(500, "原因最多 500 字"),
  receipt_urls: z.array(z.string()).nullable().optional(),
});

/** 模块密码：6 位数字，且不是 6 位相同数字 */
const sixDigitsSchema = z
  .string()
  .regex(/^\d{6}$/, "密码需为 6 位数字")
  .refine((v) => new Set(v).size > 1, "不要使用 6 位相同数字");

export const unlockSchema = z.object({ password: sixDigitsSchema });

export const modulePasswordSchema = z.object({
  new_password: sixDigitsSchema,
  old_password: z.string().nullable().optional(),
});

export type AccountCreateInput = z.infer<typeof accountCreateSchema>;
export type AccountUpdateInput = z.infer<typeof accountUpdateSchema>;
export type AdjustmentCreateInput = z.infer<typeof adjustmentCreateSchema>;
