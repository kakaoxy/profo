import { describe, expect, it } from "vitest";
import { renovationContractSchema } from "./schema";

// ── 辅助：构造合法的表单值 ──
const validFormValues = {
  renovation_company: "装修公司A",
  contract_start_date: new Date("2025-01-01"),
  contract_end_date: new Date("2025-06-30"),
  actual_start_date: new Date("2025-01-15"),
  actual_end_date: new Date("2025-07-01"),
  hard_contract_amount: 100000,
  payment_node_1: "首期款",
  payment_ratio_1: 30,
  payment_node_2: "二期款",
  payment_ratio_2: 40,
  payment_node_3: "尾款",
  payment_ratio_3: 30,
  payment_node_4: undefined,
  payment_ratio_4: undefined,
  soft_budget: 50000,
  soft_actual_cost: 48000,
  soft_detail_attachment: "https://example.com/soft-detail.pdf",
  design_fee: 8000,
  demolition_fee: 5000,
  garbage_fee: 2000,
  other_extra_fee: 1000,
  other_fee_reason: "额外费用说明",
};

// ════════════════════════════════════════════════════════════════
// renovationContractSchema
// ════════════════════════════════════════════════════════════════
describe("renovationContractSchema", () => {
  it("合法值应该通过校验", () => {
    const result = renovationContractSchema.safeParse(validFormValues);
    expect(result.success).toBe(true);
  });

  it("空对象应该通过校验（所有字段可选）", () => {
    const result = renovationContractSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("部分字段应该通过校验", () => {
    const result = renovationContractSchema.safeParse({
      renovation_company: "装修公司B",
      hard_contract_amount: 200000,
    });
    expect(result.success).toBe(true);
  });

  // ── renovation_company ──
  it("renovation_company 超过200字符应该校验失败", () => {
    const result = renovationContractSchema.safeParse({
      renovation_company: "x".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("renovation_company 为空字符串应该通过校验", () => {
    const result = renovationContractSchema.safeParse({
      renovation_company: "",
    });
    expect(result.success).toBe(true);
  });

  // ── 日期字段 ──
  it("contract_start_date 为 Date 对象应该通过校验", () => {
    const result = renovationContractSchema.safeParse({
      contract_start_date: new Date("2025-03-01"),
    });
    expect(result.success).toBe(true);
  });

  it("contract_start_date 为字符串应该校验失败", () => {
    const result = renovationContractSchema.safeParse({
      contract_start_date: "2025-03-01",
    });
    expect(result.success).toBe(false);
  });

  it("所有日期字段为 undefined 应该通过校验", () => {
    const result = renovationContractSchema.safeParse({
      contract_start_date: undefined,
      contract_end_date: undefined,
      actual_start_date: undefined,
      actual_end_date: undefined,
    });
    expect(result.success).toBe(true);
  });

  // ── 费用字段边界 ──
  it("hard_contract_amount 为 0 应该通过校验", () => {
    const result = renovationContractSchema.safeParse({
      hard_contract_amount: 0,
    });
    expect(result.success).toBe(true);
  });

  it("hard_contract_amount 为负数应该通过校验（schema 未限制最小值）", () => {
    const result = renovationContractSchema.safeParse({
      hard_contract_amount: -100,
    });
    expect(result.success).toBe(true);
  });

  it("soft_budget 为 0 应该通过校验", () => {
    const result = renovationContractSchema.safeParse({
      soft_budget: 0,
    });
    expect(result.success).toBe(true);
  });

  it("soft_actual_cost 为 0 应该通过校验", () => {
    const result = renovationContractSchema.safeParse({
      soft_actual_cost: 0,
    });
    expect(result.success).toBe(true);
  });

  it("design_fee 为 0 应该通过校验", () => {
    const result = renovationContractSchema.safeParse({
      design_fee: 0,
    });
    expect(result.success).toBe(true);
  });

  it("费用字段为字符串应该校验失败", () => {
    const result = renovationContractSchema.safeParse({
      hard_contract_amount: "100000",
    });
    expect(result.success).toBe(false);
  });

  // ── 支付节点验证 ──
  it("payment_ratio 为 0 应该通过校验", () => {
    const result = renovationContractSchema.safeParse({
      payment_ratio_1: 0,
    });
    expect(result.success).toBe(true);
  });

  it("payment_ratio 为 100 应该通过校验", () => {
    const result = renovationContractSchema.safeParse({
      payment_ratio_1: 100,
    });
    expect(result.success).toBe(true);
  });

  it("payment_ratio 为负数应该校验失败", () => {
    const result = renovationContractSchema.safeParse({
      payment_ratio_1: -1,
    });
    expect(result.success).toBe(false);
  });

  it("payment_ratio 超过100应该校验失败", () => {
    const result = renovationContractSchema.safeParse({
      payment_ratio_1: 101,
    });
    expect(result.success).toBe(false);
  });

  it("payment_ratio 为小数应该校验失败（超过100边界）", () => {
    const result = renovationContractSchema.safeParse({
      payment_ratio_1: 100.5,
    });
    expect(result.success).toBe(false);
  });

  it("payment_node 超过100字符应该校验失败", () => {
    const result = renovationContractSchema.safeParse({
      payment_node_1: "x".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it("payment_node 为空字符串应该通过校验", () => {
    const result = renovationContractSchema.safeParse({
      payment_node_1: "",
    });
    expect(result.success).toBe(true);
  });

  it("所有4个支付节点同时有值应该通过校验", () => {
    const result = renovationContractSchema.safeParse({
      payment_node_1: "首期",
      payment_ratio_1: 30,
      payment_node_2: "二期",
      payment_ratio_2: 30,
      payment_node_3: "三期",
      payment_ratio_3: 30,
      payment_node_4: "尾款",
      payment_ratio_4: 10,
    });
    expect(result.success).toBe(true);
  });

  it("payment_ratio 为字符串应该校验失败", () => {
    const result = renovationContractSchema.safeParse({
      payment_ratio_1: "30",
    });
    expect(result.success).toBe(false);
  });

  // ── 软装费用 ──
  it("soft_detail_attachment 超过500字符应该校验失败", () => {
    const result = renovationContractSchema.safeParse({
      soft_detail_attachment: "x".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("soft_detail_attachment 为空字符串应该通过校验", () => {
    const result = renovationContractSchema.safeParse({
      soft_detail_attachment: "",
    });
    expect(result.success).toBe(true);
  });

  // ── 其他费用 ──
  it("other_fee_reason 为字符串应该通过校验", () => {
    const result = renovationContractSchema.safeParse({
      other_fee_reason: "额外费用原因",
    });
    expect(result.success).toBe(true);
  });

  it("demolition_fee 为 0 应该通过校验", () => {
    const result = renovationContractSchema.safeParse({
      demolition_fee: 0,
    });
    expect(result.success).toBe(true);
  });

  it("garbage_fee 为 0 应该通过校验", () => {
    const result = renovationContractSchema.safeParse({
      garbage_fee: 0,
    });
    expect(result.success).toBe(true);
  });

  it("other_extra_fee 为 0 应该通过校验", () => {
    const result = renovationContractSchema.safeParse({
      other_extra_fee: 0,
    });
    expect(result.success).toBe(true);
  });
});
