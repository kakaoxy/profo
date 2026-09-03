/**
 * 管理端统一线索流转矩阵常量（与小程序 `miniapp/pages/customers/detail/constants.ts`
 * 的 FLOW_MATRIX 完全同源口径，对齐后端 `services/growth_center/flow_matrix.py`）。
 *
 * 纯常量文件（无 'use client'），可被 Server / Client Component 共同导入；
 * 统一状态中文标签复用 `../types` 的 GROWTH_STATUS_META，此处不重复定义。
 */

import type { components } from "@/lib/api-types";
import type { GrowthModule, UnifiedLeadStatus } from "../types";

/** 淘汰原因（取值与后端 MyCustomerStatusUpdateRequest.reason 枚举对齐） */
export type LeadEliminateReason = NonNullable<
  components["schemas"]["MyCustomerStatusUpdateRequest"]["reason"]
>;

/**
 * 模块 × 当前统一状态 → 可流转目标状态矩阵（终态为空数组，前端不渲染流转入口）：
 * - recruit/booking：全量手动流转（主链路 + 淘汰旁路 + 重新激活）；
 * - valuation/sheet：仅淘汰旁路（reason 必填）+ 重新激活（eliminated→contacted，remark 必填），
 *   其余流转后端 409。
 */
export const FLOW_MATRIX: Record<GrowthModule, Record<UnifiedLeadStatus, UnifiedLeadStatus[]>> = {
  recruit: {
    new: ["contacted", "high_intent", "converted", "eliminated"],
    contacted: ["high_intent", "converted", "eliminated"],
    high_intent: ["converted", "eliminated"],
    converted: [],
    eliminated: ["contacted"],
  },
  valuation: {
    new: ["eliminated"],
    contacted: ["eliminated"],
    high_intent: ["eliminated"],
    converted: [],
    eliminated: ["contacted"],
  },
  booking: {
    new: ["contacted", "high_intent", "converted", "eliminated"],
    contacted: ["high_intent", "converted", "eliminated"],
    high_intent: ["converted", "eliminated"],
    converted: [],
    eliminated: ["contacted"],
  },
  sheet: {
    new: ["eliminated"],
    contacted: ["eliminated"],
    high_intent: ["eliminated"],
    converted: [],
    eliminated: ["contacted"],
  },
};

/** 淘汰原因单选项 */
export const ELIMINATE_REASONS: Array<{ value: LeadEliminateReason; label: string }> = [
  { value: "no_intent", label: "无意向" },
  { value: "invalid_info", label: "信息无效" },
  { value: "lost_to_competitor", label: "输给竞品" },
];

/**
 * 淘汰旁路是否必须填写原因（对齐后端契约：recruit 原生无淘汰原因字段，
 * 提交的 reason 被忽略；其余模块 status=eliminated 时 reason 必填 422）
 */
export const ELIMINATE_REASON_REQUIRED: Record<GrowthModule, boolean> = {
  recruit: false,
  booking: true,
  valuation: true,
  sheet: true,
};
