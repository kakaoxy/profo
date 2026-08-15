/**
 * 区域伙伴招募计划 · 纯逻辑工具.
 *
 * 抽离页面中不依赖微信运行时（wx.*）的纯函数，便于 vitest 直测：
 * - 深度浏览判定（stayed_ms >= 3000）
 * - 分享/进入参数解析（campaign_id / referrer / source）
 * - 报名表单校验顺序（主营商圈非空 → 隐私协议勾选）
 * - 落地页固定营销文案常量（RECRUIT_LANDING_CONTENT）
 */

import type { components } from "../types/api-types";

/** 来源渠道枚举（与 RecruitLeadSource 对齐）. */
export type RecruitSource = components["schemas"]["RecruitLeadSource"];

/** 分享/进入参数解析结果. */
export interface RecruitQuery {
  campaignId: string;
  referrer: string;
  source: RecruitSource;
}

// ===== 落地页固定营销文案结构 =====

/** Hero 区：信任建立钩子. */
export interface RecruitHero {
  title: string;
  lead: string;
  tags: string[];
  closerPrefix: string;
  closerBold: string;
}

/** 数据卡单项. */
export interface RecruitStat {
  /** 货币符号（仅佣金项有）. */
  yen?: string;
  /** 目标数值（用于从 0 滚动到该值）. */
  target: number;
  /** 数值后缀（如 "+", "W+"）. */
  suffix?: string;
  /** 单位（如 "人", "个"）. */
  unit?: string;
  label: string;
}

/** 痛点卡：问句 + 答案（答案拆为前/加粗/后三段以便 wxml 渲染高亮）. */
export interface RecruitPain {
  q: string;
  aBefore: string;
  aBold: string;
  aAfter: string;
  /** 暖色突出（仅中间一张）. */
  warm: boolean;
}

/** 优势卡. */
export interface RecruitWhy {
  num: string;
  title: string;
  desc: string;
}

/** 流程步骤. */
export interface RecruitFlowStep {
  name: string;
  desc: string;
}

/** 评价卡. */
export interface RecruitReview {
  stars: number;
  text: string;
  avatar: string;
  name: string;
  role: string;
}

/** 落地页固定营销内容整体结构. */
export interface RecruitLandingContent {
  hero: RecruitHero;
  stats: RecruitStat[];
  painTitle: string;
  painSub: string;
  pains: RecruitPain[];
  whyTitle: string;
  whySub: string;
  whys: RecruitWhy[];
  flowTitle: string;
  flowSub: string;
  flow: RecruitFlowStep[];
  reviewTitle: string;
  reviewSub: string;
  reviews: RecruitReview[];
}

/** 落地页固定营销内容（文案严格对照设计稿，硬编码不从后端读取）. */
export const RECRUIT_LANDING_CONTENT: RecruitLandingContent = {
  hero: {
    title: "你缺客户吗？",
    lead: "我们就是那个——",
    tags: ["不约时间", "不磨价格", "不玩消失"],
    closerPrefix: "的",
    closerBold: "\u201C神仙客户\u201D",
  },
  stats: [
    { target: 300, suffix: "+", unit: "人", label: "已合作经纪人" },
    { target: 15, unit: "个", label: "覆盖商圈" },
    { yen: "¥", target: 1000, suffix: "W+", label: "累计佣金" },
  ],
  painTitle: "我们懂你的每一个痛点",
  painSub: "你说，我们就到",
  pains: [
    {
      q: "客户聊半天约不出来？",
      aBefore: "随时看房，",
      aBold: "业主有空我们就到",
      aAfter: "，全城覆盖，快速响应。",
      warm: false,
    },
    {
      q: "客户看半天不出价？",
      aBefore: "",
      aBold: "最快 2 小时出价",
      aAfter: "，绝不拖延，书面报价单，透明可查。",
      warm: true,
    },
    {
      q: "客户看中了，跟业主约不上时间？",
      aBefore: "我们随时配合面谈，",
      aBold: "你说几点就几点",
      aAfter: "，7×12 小时在线响应。",
      warm: false,
    },
  ],
  whyTitle: "为什么选择跟我们合作？",
  whySub: "四个硬核承诺",
  whys: [
    { num: "01", title: "1% 佣金秒结", desc: "交房即到账，不拖不欠" },
    { num: "02", title: "快速响应", desc: "7×12 小时在线" },
    { num: "03", title: "快出价不反复", desc: "书面报价透明可查" },
    { num: "04", title: "装修代卖", desc: "一站式赋能房源" },
  ],
  flowTitle: "合作流程",
  flowSub: "五步成交，闭环清晰",
  flow: [
    { name: "推荐房源", desc: "分享你手头匹配的客户房源" },
    { name: "实地看房", desc: "业主配合，随时带看" },
    { name: "快速报价", desc: "2 小时内书面出价，不反复" },
    { name: "签约收房", desc: "流程规范，权属清晰" },
    { name: "佣金到账", desc: "1% 秒结，交房即付" },
  ],
  reviewTitle: "合作伙伴怎么说？",
  reviewSub: "真实经纪人口碑",
  reviews: [
    {
      stars: 5,
      text: "不跳单，结佣快，装得好，卖得快",
      avatar: "洪",
      name: "洪店长",
      role: "浦东金杨 · 资深店长",
    },
    {
      stars: 5,
      text: "以前最怕客户约了不看，看了不谈，谈了不买，跟你们合作省心太多了！",
      avatar: "李",
      name: "李店长",
      role: "宝山张庙 · 资深经纪人",
    },
  ],
};

/**
 * 解析 onLoad 分享/进入参数.
 * @param options 页面 onLoad 传入的 query
 * @param fallbackCampaignId 无 campaign_id 时使用的兜底（页面内已加载的第一张活动卡）
 */
export function parseRecruitQuery(
  options: Record<string, string | undefined>,
  fallbackCampaignId = "",
): RecruitQuery {
  const campaignId = options.campaign_id || fallbackCampaignId;
  const referrer = options.referrer || "";
  const source: RecruitSource = options.source === "poster" ? "poster" : "card";
  return { campaignId, referrer, source };
}

/**
 * 构造分享事件上报体.
 */
export function buildShareEventPayload(
  campaignId: string,
  shareType: "card" | "poster",
): Record<string, unknown> {
  return {
    campaign_id: campaignId || undefined,
    share_type: shareType,
  };
}

/**
 * 从 getwxacodeunlimit 的 scene 场景值中提取短码.
 *
 * 后端生成 scene 为键值对格式 `code=xxxxxxxx`（见 services/recruit/qrcode.py），
 * 微信扫码进入时 onLoad 收到的 options.scene 为其 URL 编码形式，解码后不能直接当短码使用。
 * 兼容带路径前缀的形态（如 `pages/xxx?code=xxx`）。小程序环境不支持 URL 构造器，用 split 解析。
 *
 * @param scene decodeURIComponent 之后的场景值
 * @returns 短码；无 code 键时返回空串
 */
export function parseSceneCode(scene: string): string {
  const query = scene.includes("?") ? scene.slice(scene.indexOf("?") + 1) : scene;
  const pair = query.split("&").find((p) => p.startsWith("code="));
  return pair ? pair.slice("code=".length) : "";
}

/**
 * 深度浏览判定（唯一标准：停留 >= 3000ms）.
 */
export function isDeepView(stayedMs: number): boolean {
  return stayedMs >= 3000;
}

/**
 * 报名表单校验（顺序：主营商圈非空 → 隐私协议勾选）.
 * @returns 校验失败返回错误提示文案；通过返回空串
 */
export function checkRecruitForm(mainBusinessArea: string, agreed: boolean): string {
  if (!mainBusinessArea.trim()) {
    return "请先填写主营商圈";
  }
  if (!agreed) {
    return "请先阅读并同意隐私协议";
  }
  return "";
}

/** 构建分享 query 串（卡片 path 与朋友圈 query 共用）. */
export function buildShareQuery(
  campaignId: string,
  referrer: string,
  source: RecruitSource,
): string {
  const params: string[] = [`campaign_id=${encodeURIComponent(campaignId)}`];
  if (referrer) {
    params.push(`referrer=${encodeURIComponent(referrer)}`);
  }
  params.push(`source=${source}`);
  return params.join("&");
}

/** 构建分享 path（卡片/朋友圈共用，海报二期交由 canvas 处理）. */
export function buildSharePath(
  campaignId: string,
  referrer: string,
  source: RecruitSource,
): string {
  return `/pages/recruit/detail/index?${buildShareQuery(campaignId, referrer, source)}`;
}
