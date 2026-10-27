import type { FollowUpConclusion, FollowUpMethod } from "../types";

/**
 * 跟进结论徽标映射 —— 列表表格 / 卡片视图 / 时间线徽标样式的唯一来源。
 *
 * 设计稿（docs/design/线索跟进列表-线索中心迭代-hifi.html 02 节图例）：
 * 四态全部落在 Rust / Apricot / Fog 同色系内，靠「填充强度」区分严重度，
 * 不引入新彩色（对齐 DESIGN.md「唯一暖强调 Rust」）。
 *
 * ⚠️ 文案口径：徽标用设计稿短文案；登记 chip 保留 constants/ui-labels 的
 * FOLLOW_UP_CONCLUSIONS 完整文案（「价格与合作模式均未谈拢」），两者长短并存
 * 是设计稿自身形态（图例短 / 抽屉长），改一处需同步设计稿。
 */
export interface FollowUpConclusionMeta {
  label: string;
  /** 完整类串（含 LEAD_BADGE_BASE 基类），可直接传给 cn()/className */
  badgeClass: string;
}

/** 白底胶囊基类：复用 lead-status-meta 的公共基类，保证与状态徽标同构 */
import { LEAD_BADGE_BASE } from "./lead-status-meta";

export const FOLLOW_UP_CONCLUSION_META: Record<FollowUpConclusion, FollowUpConclusionMeta> = {
  price_disagree: {
    label: "价格未谈拢",
    badgeClass: `${LEAD_BADGE_BASE} bg-apricot-wash text-rust`,
  },
  mode_disagree: {
    label: "合作模式未谈拢",
    badgeClass: `${LEAD_BADGE_BASE} border border-apricot-edge bg-pure-white text-rust`,
  },
  both_disagree: {
    label: "价格与模式均未谈拢",
    badgeClass: `${LEAD_BADGE_BASE} bg-ink text-white`,
  },
};

/** 「未记录」态（conclusion 为 NULL，存量记录 / 未填）——不含结论，不伪造 */
export const FOLLOW_UP_CONCLUSION_NONE: FollowUpConclusionMeta = {
  label: "未记录",
  badgeClass: `${LEAD_BADGE_BASE} bg-fog text-graphite`,
};

/** 取徽标元信息：null / 未知值统一落到「未记录」，不抛错 */
export function getFollowUpConclusionMeta(
  conclusion: FollowUpConclusion | null | undefined,
): FollowUpConclusionMeta {
  if (!conclusion) return FOLLOW_UP_CONCLUSION_NONE;
  return FOLLOW_UP_CONCLUSION_META[conclusion] ?? FOLLOW_UP_CONCLUSION_NONE;
}

/** 跟进方式短文案（fu-meta 次级信息行「MM-DD · 跟进人 · 方式」用） */
export const FOLLOW_UP_METHOD_SHORT: Record<FollowUpMethod, string> = {
  phone: "电话",
  wechat: "微信",
  face: "面谈",
  visit: "带看",
};

/** 取方式短文案：未知值兜底回原值 */
export function getFollowUpMethodShort(method: FollowUpMethod | string): string {
  return FOLLOW_UP_METHOD_SHORT[method as FollowUpMethod] ?? method;
}
