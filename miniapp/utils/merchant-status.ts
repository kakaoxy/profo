/**
 * 商户模块状态语义（DESIGN.md「M3 · 状态色」的唯一映射处）。
 *
 * 三档语义，取值直接对应 shared 样式层里的 chip 修饰类：
 *   todo → 待处理（待审核 / 待签署 / 洽谈中）· Apricot 底 + Rust 字
 *   done → 已落定（已合作 / 未合作 / 已签署 / 未发起）· Fog 底 + Graphite 字
 *   void → 已失效或异常（暂停 / 终止 / 已过期 / 已作废）· 白底 + Rust 字 + hairline
 *
 * 为什么集中在这里：改造前同一 Apricot 同时表示「待处理/已完成/已作废/已过期」
 * （审查报告 P0-6），四个页面各自写一遍三元表达式必然再次漂移。
 * 状态码来源：backend/constants/merchant.py 与 backend/services/merchant/agreement.py。
 */

export type StatusTone = "todo" | "done" | "void";

/** 门店审核状态码（backend/constants/merchant.py MerchantStoreReviewStatus） */
const REVIEW_LABELS: Record<string, string> = {
  pending: "待审核",
  approved: "已通过",
  merged: "已合并",
};

/** 门店合作状态码（字典 merchant_cooperation_status）→ 语义档 */
const COOPERATION_TONES: Record<string, StatusTone> = {
  not_cooperated: "done",
  negotiating: "todo",
  cooperated: "done",
  paused: "void",
  terminated: "void",
};

/** 协议状态码 → 语义档 */
const AGREEMENT_TONES: Record<string, StatusTone> = {
  not_initiated: "done",
  pending_sign: "todo",
  signed: "done",
  expired: "void",
  voided: "void",
};

/** 协议状态码 → 中文（后端未给 status_label 时兜底） */
const AGREEMENT_LABELS: Record<string, string> = {
  not_initiated: "未发起",
  pending_sign: "待签署",
  signed: "已签署",
  expired: "已过期",
  voided: "已作废",
};

/** 门店状态：审核未通过前一律算「待处理」，审核通过后按合作状态取档。 */
export function storeStatusTone(review_status: string, cooperation_status: string): StatusTone {
  if (review_status === "pending") {
    return "todo";
  }
  return COOPERATION_TONES[cooperation_status] ?? "done";
}

/**
 * 门店状态文案：审核未完成时先给审核结论（待审核 / 已合并），
 * 审核通过后给业务状态（洽谈中 / 已合作 …）——「已通过」不是用户要判断的下一步，
 * 只作为字典缺失时的兜底，否则列表里全变成「已通过」，看不出有没有谈成。
 */
export function storeStatusLabel(review_status: string, cooperation_status_label: string): string {
  if (review_status === "pending") return REVIEW_LABELS.pending;
  if (review_status === "merged") return REVIEW_LABELS.merged;
  return cooperation_status_label || REVIEW_LABELS[review_status] || review_status;
}

/** 协议状态档。 */
export function agreementStatusTone(status: string): StatusTone {
  return AGREEMENT_TONES[status] ?? "done";
}

/** 协议状态文案。 */
export function agreementStatusLabel(status: string, status_label?: string): string {
  return status_label || AGREEMENT_LABELS[status] || status;
}
