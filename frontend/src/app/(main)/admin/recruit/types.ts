/**
 * 招募管理（区域伙伴招募计划）UI 类型与常量。
 *
 * 实体类型由 `pnpm gen-api` 生成（@/lib/api-types），此处仅做语义别名
 * 与 UI 常量（中文标签 / Badge 配色 / 漏斗步骤）集中管理。
 * 无运行时副作用、无 'use client' 指令，可被 Server / Client Component 共同导入。
 */

import type { components } from "@/lib/api-types";

// ─── 枚举别名（对齐后端 Pydantic 枚举） ──────────────────────────────────────

export type RecruitCampaignStatus = components["schemas"]["RecruitCampaignStatus"];
export type RecruitLeadStatus = components["schemas"]["RecruitLeadStatus"];
export type RecruitSource = components["schemas"]["RecruitLeadSource"];

// ─── 实体别名（对齐后端 Response Schema） ────────────────────────────────────

/** 招募活动（后台响应投影） */
export type RecruitCampaign = components["schemas"]["RecruitCampaignResponse"];

/** 招募客户线索（后台列表项，手机号已脱敏） */
export type RecruitLead = components["schemas"]["RecruitLeadListItem"];

/** 6 级核心业务漏斗数据 */
export type RecruitFunnelData = components["schemas"]["RecruitFunnelResponse"];

// ─── 员工（UI 投影，由 UserSimpleResponse 映射） ──────────────────────────────

/** 员工（分享归属/业绩核算维度，由 GET /api/v1/users/simple 映射） */
export interface RecruitEmployee {
  id: string;
  name: string;
}

// ─── 中文标签常量（供页面复用） ───────────────────────────────────────────────

/** 线索跟进状态中文标签 */
export const RECRUIT_LEAD_STATUS_LABELS: Record<RecruitLeadStatus, string> = {
  new: "新线索",
  contacted: "已联系",
  high_intent: "意向高",
  converted: "已转化",
  eliminated: "已淘汰",
};

/** 线索来源中文标签 */
export const RECRUIT_SOURCE_LABELS: Record<RecruitSource, string> = {
  card: "分享卡片",
  poster: "分享海报",
};

// ─── 设计稿（Steep）Badge 配色类 ─────────────────────────────────────────────

/** 设计稿 badge 风格：`<span class="badge ${cls}">`（rounded-full 药丸形态） */
export const RECRUIT_BADGE_CLASS = {
  /** Fog 底 / Graphite 字：中性 */
  neutral: "bg-fog text-graphite",
  /** Dove 描边 / Graphite 字：轮廓 */
  outline: "text-graphite ring-1 ring-inset ring-dove",
  /** Sky 底 / Ink 字：信息强调（如「新线索」） */
  sky: "bg-sky-wash text-ink",
  /** Apricot 底 / Rust 字：暖色强调（如「意向高」） */
  apricot: "bg-apricot-wash text-rust",
  /** Ink 底 / 白字：实心强调（如「启用中」「已转化」） */
  ink: "bg-ink text-white",
  /** Slate 字 / Fog 描边：弱化（如「已淘汰」） */
  muted: "text-slate ring-1 ring-inset ring-fog",
} as const;

/** 漏斗看板各级指标（自上而下依次展示，数值单调不增） */
export const RECRUIT_FUNNEL_STEPS: ReadonlyArray<{ key: keyof RecruitFunnelData; label: string }> =
  [
    { key: "share_count", label: "分享次数" },
    { key: "pv", label: "打开次数(PV)" },
    { key: "uv", label: "打开人数(UV)" },
    { key: "deep_view", label: "深度浏览" },
    { key: "clicked_auth", label: "点击授权" },
    { key: "authed", label: "授权成功(原始留资)" },
    { key: "valid_leads", label: "有效新客(北极星)" },
  ];
