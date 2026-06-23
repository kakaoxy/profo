import { z } from "zod";

export const renovationContractSchema = z.object({
  // 装修公司
  renovation_company: z.string().max(200).optional(),

  // 合同时间
  contract_start_date: z.date().optional(),
  contract_end_date: z.date().optional(),

  // 实际时间
  actual_start_date: z.date().optional(),
  actual_end_date: z.date().optional(),

  // 硬装费用
  hard_contract_amount: z.number().optional(),

  // 支付节点
  payment_node_1: z.string().max(100).optional(),
  payment_ratio_1: z.number().min(0).max(100).optional(),
  payment_node_2: z.string().max(100).optional(),
  payment_ratio_2: z.number().min(0).max(100).optional(),
  payment_node_3: z.string().max(100).optional(),
  payment_ratio_3: z.number().min(0).max(100).optional(),
  payment_node_4: z.string().max(100).optional(),
  payment_ratio_4: z.number().min(0).max(100).optional(),

  // 软装费用
  soft_budget: z.number().optional(),
  soft_actual_cost: z.number().optional(),
  soft_detail_attachment: z.string().max(500).optional(),

  // 其他费用
  design_fee: z.number().optional(),
  demolition_fee: z.number().optional(),
  garbage_fee: z.number().optional(),
  other_extra_fee: z.number().optional(),
  other_fee_reason: z.string().optional(),
});

export type RenovationContractFormValues = z.infer<typeof renovationContractSchema>;
