import { z } from "zod";

/**
 * 资金账户 Zod 校验 schema，语义对齐后端 Pydantic（schemas/finance/fund_account.py）。
 *
 * ⚠️ 一致性约束：任何字段改动都要两边同步（AGENTS.md §2「表单 Zod schema 需与后端
 * Pydantic 语义对齐」）。后端上限：name 24 / account_no 40 / holder 50 / note 120。
 */

export const fundAccountTypeSchema = z.enum(["bank", "corp", "wechat", "alipay", "cash"]);
export const fundAccountStatusSchema = z.enum(["active", "off"]);

/**
 * 服务端「模块未解锁」的错误码。
 *
 * 来源：`backend/dependencies/auth.py::require_accounts_unlock` 抛
 * `PermissionDeniedError`（403），统一错误体 `{code:403,message}`。
 *
 * ⚠️ 为何放在本文件而不是 `../actions.ts`：actions.ts 是 `"use server"` 模块，
 * 只能导出 async 函数（导出常量会直接让 Next.js 构建/开发态报
 * "Only async functions are allowed to be exported in a \"use server\" file"）。
 */
export const UNLOCK_DENIED_CODE = "403";

/**
 * 判断错误码是否代表「模块未解锁」.
 *
 * 需要它而不直接 `=== "403"` 的原因（2026-10-22 缺陷修复）：403 在本模块有两种来源，
 * 语义完全不同，处理方式也相反——
 *  - ``require_accounts_unlock`` 抛的 403 = 解锁令牌失效 → 必须 ``invalidate()`` 回锁屏；
 *  - ``require_permission("account:write")`` 抛的 403 = **权限不足**（操作员没有写权限）。
 *    此时解锁令牌完全有效，若也回锁屏，用户会看到「密码正确却一直跳回锁屏」，
 *    且永远得不到「你没有编辑权限」这条真正有用的提示。
 * 因此按 message 区分：只有「未解锁」文案才回锁屏。
 */
export function isUnlockDenied(code?: string, message?: string): boolean {
  if (code !== UNLOCK_DENIED_CODE) return false;
  return (message ?? "").includes("未解锁");
}

export const ACCOUNT_NAME_MAX = 24;
export const ACCOUNT_NO_MAX = 40;
export const ACCOUNT_HOLDER_MAX = 50;
export const ACCOUNT_NOTE_MAX = 120;

/**
 * 金额精度守卫：最多 2 位小数（与后端 ``decimal_places=2`` 对齐）。
 *
 * 为什么前端也要拦（2026-10-22 缺陷修复）：后端落库列是 NUMERIC(15,2)，此前入参
 * 无精度约束时 PostgreSQL 会静默四舍五入（1000.005 → 差额存成 0.01），用户填的
 * 值与系统显示的值对不上。后端现已改为 422 拒绝，前端同步给出可读提示，
 * 避免把「422 参数错误」这种技术文案直接抛给用户。
 */
const moneySchema = z
  // 保留中文空值提示：调用方用 Number.NaN 表示「没填」，Zod 4 默认文案是英文
  .number({ message: "请填写金额" })
  .refine((v) => Number.isFinite(v), "请填写金额")
  .refine((v) => Math.round(v * 100) === Number((v * 100).toFixed(6)), "金额最多 2 位小数");

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
  opening_balance: moneySchema.min(0, "期初余额不能为负数"),
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
  opening_balance: moneySchema.min(0, "期初余额不能为负数").optional(),
  opening_date: z.string().min(1).optional(),
  status: fundAccountStatusSchema.optional(),
  note: z.string().trim().max(ACCOUNT_NOTE_MAX).nullable().optional(),
});

/** 对账调整：实际余额与原因必填（差额为 0 由后端拒绝，前端也做提示） */
export const adjustmentCreateSchema = z.object({
  adjust_date: z.string().min(1, "请选择调整日期"),
  actual_balance: moneySchema,
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
