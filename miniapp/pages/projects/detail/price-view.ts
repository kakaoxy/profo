/**
 * 房源详情页 · 价格展示组装（Design QA 2026-10-28 D-03 自 index.ts 拆出）.
 *
 * 口径（广告法自查 P0-02 扩展，M-01 修复）：
 * - 已售且有真实成交价（sold_price>0）→ 按成交价展示，chip「成交价」
 * - 在售且有营销表总价（total_price>0）→ chip「挂牌价」（签约价/挂牌价，非成交价）
 * - 其余（在途无价 / total_price≤0）→ pricePending=true，主价格渲染「价格待定」，
 *   信息格总价/单价渲染「待定」，不渲染口径 chip（0 不是合法价格）
 * - 贷款参考卡：总价缺失/≤0 或已售时整卡隐藏
 */
import type { components } from "../../../types/api-types";
import { calcLoan, fmtBp, fmtWan1, fmtYuanInt, LOAN_DEFAULTS, MODE_NAME } from "../../../utils/loan-calc";
import { isSoldStatus } from "./status-view";

type PublicProjectDetail = components["schemas"]["PublicProjectDetail"];

/** 价格区展示数据：priceDisplay 为空时页面渲染「价格待定」. */
export type PriceView = {
  priceDisplay: number | null;
  /** 价格口径标注：「成交价」/「挂牌价」；空串不渲染. */
  priceScopeText: string;
  /** 无有效价格（total_price≤0 且无成交价）：主价格与信息格走缺省分支. */
  pricePending: boolean;
};

/** 贷款参考卡展示数据：默认口径下的首付/月供/口径摘要（金额与文案同源派生）. */
export type LoanCardView = {
  downPctText: string;
  downText: string;
  monthText: string;
  /** 摘要中段：方式 · 年限 · LPR 与加点. */
  sumText: string;
  /** 执行利率（强调色展示）. */
  rateText: string;
};

/** 组装价格区展示（主价格 + 口径 chip + 缺价分支）. */
export function buildPriceView(detail: PublicProjectDetail): PriceView {
  const soldPrice = detail.sold_price ?? null;
  if (soldPrice != null && soldPrice > 0) {
    return { priceDisplay: soldPrice, priceScopeText: "成交价", pricePending: false };
  }
  const totalPrice = detail.total_price ?? 0;
  if (totalPrice > 0) {
    // 「挂牌价」chip 仅用于在售房源：在途未挂牌、已售无成交价时不下口径（避免误导）
    const scopeText = detail.project_status === "在售" ? "挂牌价" : "";
    return { priceDisplay: totalPrice, priceScopeText: scopeText, pricePending: false };
  }
  return { priceDisplay: null, priceScopeText: "", pricePending: true };
}

/**
 * 按默认口径（LOAN_DEFAULTS，见 utils/loan-calc.ts）计算贷款参考卡展示数据.
 * 摘要行文案（年限/利率/加点）同源派生，避免硬编码与常量漂移失配.
 * 总价缺失/≤0 或已售（过往案例无贷款意义）返回 null（整卡隐藏）.
 */
export function buildLoanCard(
  detail: PublicProjectDetail,
): LoanCardView | null {
  const totalPrice = detail.total_price ?? 0;
  if (totalPrice <= 0 || isSoldStatus(detail.project_status)) {
    return null;
  }
  const r = calcLoan(totalPrice, LOAN_DEFAULTS);
  return {
    downPctText: String(LOAN_DEFAULTS.downPct),
    downText: fmtWan1(r.downWan),
    monthText: fmtYuanInt(r.first),
    /** 摘要中段：方式 · 年限 · LPR 与加点（静态标签「首套」「年利率」留在 wxml）. */
    sumText: `${MODE_NAME[LOAN_DEFAULTS.mode]} · ${LOAN_DEFAULTS.years}年 · LPR ${LOAN_DEFAULTS.lpr.toFixed(2)}%${fmtBp(LOAN_DEFAULTS.bp)}bp`,
    /** 执行利率（rust 强调，与金额同源派生）. */
    rateText: r.commRate.toFixed(2) + "%",
  };
}
