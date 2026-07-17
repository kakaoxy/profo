import { z } from "zod";

/**
 * 资金账本 Zod 校验 schema，对齐后端 Pydantic 模型
 *
 * 参考：
 * - api-types.ts::LedgerRecordCreate / LedgerRecordUpdate
 * - api-types.ts::FinanceSettlementChangeRequest / FinanceUnsettleRequest
 *
 * 从 ledger/actions.ts 抽离以遵守单文件 ≤500 行约束（参考 leads/_components/lead-schema.ts）。
 */

export const cashFlowTypeSchema = z.enum(["income", "expense"]);
export const counterpartyTypeSchema = z.enum(["company", "individual"]);

export const recordIdSchema = z.string().min(1, "记录 ID 不能为空");
export const projectIdSchema = z.string().min(1, "项目 ID 不能为空");

// 参考 LedgerRecordCreate
export const createRecordSchema = z.object({
  project_id: z.string().min(1, "项目 ID 不能为空"),
  type: cashFlowTypeSchema,
  category: z.string().min(1, "收支分类不能为空"),
  amount: z.union([z.number(), z.string()]),
  date: z.string().min(1, "发生日期不能为空"),
  description: z.string().nullable().optional(),
  related_stage: z.string().nullable().optional(),
  counterparty: z.string().min(1, "交易方不能为空"),
  counterparty_type: counterpartyTypeSchema.nullable().optional(),
  receipt_urls: z.array(z.string()).nullable().optional(),
});

// 参考 LedgerRecordUpdate (PATCH 语义，仅允许补充凭证和支付方类型)
export const updateRecordSchema = z.object({
  receipt_urls: z.array(z.string()).nullable().optional(),
  counterparty_type: counterpartyTypeSchema.nullable().optional(),
});

// 参考 FinanceSettlementChangeRequest
export const settleLedgerSchema = z.object({
  settled_date: z.string().min(1, "结算日期不能为空"),
  settled_note: z.string().nullable().optional(),
});

// 参考 FinanceUnsettleRequest
export const unsettleLedgerSchema = z.object({
  reason: z.string().min(1, "反结算原因不能为空"),
});
