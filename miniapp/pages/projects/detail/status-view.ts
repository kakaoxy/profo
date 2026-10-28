/**
 * 房源详情页 · 三状态视图配置（Design QA 2026-10-28 B-01/B-02 最小共识稿）.
 *
 * 输入后端 MarketingProjectStatus 原始值，输出页面级状态化决策：
 * - isSoldStatus：已售（过往案例）→ 隐藏调价提醒/贷款参考，CTA 改「联系顾问」
 * - getFooterCta：已售 → call（拨顾问电话）；在售/在途 → book（想看房）
 * - getPriceNoteText：价格口径说明随状态切换（已售文案不再锚定「最新报价」）
 *
 * 徽章文案/配色映射在共享组件 components/status-badge 内（避免双源）。
 */

/** 已售（过往案例）状态判定. */
export function isSoldStatus(status: string | null | undefined): boolean {
  return status === "已售";
}

/** 底栏 CTA 配置：book=预约看房流，call=拨打顾问电话. */
export type FooterCta = { mode: "book" | "call"; text: string };

/** 按房源状态决定底栏 CTA（已售改「联系顾问」，其余保留「想看房」）. */
export function getFooterCta(status: string | null | undefined): FooterCta {
  if (isSoldStatus(status)) {
    return { mode: "call", text: "联系顾问" };
  }
  return { mode: "book", text: "想看房" };
}

/** 价格口径说明文案（广告法自查 P1-04：口径随状态切换，不锚定单一报价）. */
export function getPriceNoteText(status: string | null | undefined): string {
  if (isSoldStatus(status)) {
    return "该房源已成交，本页为过往案例展示，价格信息仅供参考";
  }
  return "页面价格可能随市场调整，请以最新报价与实地看房为准";
}
