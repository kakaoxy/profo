import { z } from "zod";

/**
 * 资金账本 Zod 校验 schema，对齐后端 Pydantic 模型
 *
 * 参考：
 * - api-types.ts::LedgerRecordCreate / LedgerRecordUpdate
 * - api-types.ts::FinanceSettlementChangeRequest / FinanceUnsettleRequest
 *
 * Task 8 重构：subject_id（必填）+ outflow/inflow（互斥）+ payer/payee
 *
 * 从 ledger/actions.ts 抽离以遵守单文件 <=500 行约束（参考 leads/_components/lead-schema.ts）。
 */

export const cashFlowTypeSchema = z.enum(["income", "expense"]);
export const counterpartyTypeSchema = z.enum(["company", "individual"]);

export const recordIdSchema = z.string().min(1, "记录 ID 不能为空");
export const projectIdSchema = z.string().min(1, "项目 ID 不能为空");

// 参考 LedgerRecordCreate（Task 5 后端重构：subject_id + outflow/inflow 互斥）
export const createRecordSchema = z
  .object({
    project_id: z.string().min(1, "项目 ID 不能为空"),
    date: z.string().min(1, "发生日期不能为空"),
    description: z.string().nullable().optional(),
    receipt_urls: z.array(z.string()).nullable().optional(),
    counterparty_type: counterpartyTypeSchema.nullable().optional(),

    // 新字段（主字段）
    subject_id: z.string().min(1, "科目不能为空"),
    outflow: z.number().min(0).default(0),
    inflow: z.number().min(0).default(0),
    payer: z.string().max(100).nullable().optional(),
    payee: z.string().max(100).nullable().optional(),

    // 兼容字段（旧客户端可选，新字段优先；Service 层会用新字段回填这些旧字段）
    type: cashFlowTypeSchema.nullable().optional(),
    category: z.string().nullable().optional(),
    amount: z.union([z.number(), z.string()]).nullable().optional(),
    related_stage: z.string().nullable().optional(),
    counterparty: z.string().nullable().optional(),
  })
  .refine((data) => !(data.outflow > 0 && data.inflow > 0), {
    message: "流出和流入不能同时大于0",
    path: ["outflow"],
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
