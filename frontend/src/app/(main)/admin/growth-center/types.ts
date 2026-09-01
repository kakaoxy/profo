/**
 * 获客中心（跨模块统一视图）UI 类型与常量。
 *
 * 实体类型由 `pnpm gen-api` 生成（@/lib/api-types），此处仅做语义别名
 * 与 UI 常量（模块/状态/来源的中文标签与 Badge 配色）集中管理。
 * 无运行时副作用、无 'use client' 指令，可被 Server / Client Component 共同导入。
 */

import type { components } from "@/lib/api-types";

// ─── 枚举别名（对齐后端 Pydantic 枚举） ──────────────────────────────────────

/** 获客模块（4 条分享获客链路） */
export type GrowthModule = components["schemas"]["GrowthModule"];
/** 统一 5 态状态 */
export type UnifiedLeadStatus = components["schemas"]["UnifiedLeadStatus"];
/** 线索来源（card/poster/direct） */
export type LeadSource = components["schemas"]["LeadSource"];

// ─── 模块元信息（Badge 配色全站统一，对齐设计稿） ─────────────────────────────

export const GROWTH_MODULE_META: Record<GrowthModule, { label: string; badge: string }> = {
  valuation: { label: "估价", badge: "bg-sky-wash text-[#1d5bb8]" },
  booking: { label: "房源预约", badge: "bg-apricot-wash text-rust" },
  sheet: { label: "房源单", badge: "bg-[#b9e6d2] text-[#067a54]" },
  recruit: { label: "招募", badge: "bg-ink text-white" },
};

/** 模块固定顺序（总览来源构成、漏斗对比渲染顺序） */
export const GROWTH_MODULE_ORDER: ReadonlyArray<GrowthModule> = [
  "valuation",
  "booking",
  "sheet",
  "recruit",
];

// ─── 统一 5 态状态元信息 ──────────────────────────────────────────────────────

export const GROWTH_STATUS_META: Record<UnifiedLeadStatus, { label: string; badge: string }> = {
  new: { label: "新线索", badge: "bg-sky-wash text-ink" },
  contacted: { label: "已联系", badge: "bg-fog text-graphite" },
  high_intent: { label: "意向高", badge: "bg-apricot-wash text-rust" },
  converted: { label: "已转化", badge: "bg-ink text-white" },
  eliminated: { label: "已淘汰", badge: "text-slate ring-1 ring-inset ring-fog" },
};

// ─── 来源元信息 ───────────────────────────────────────────────────────────────

export const GROWTH_SOURCE_META: Record<LeadSource, { label: string; badge: string }> = {
  card: { label: "分享卡片", badge: "text-graphite ring-1 ring-inset ring-dove" },
  poster: { label: "分享海报", badge: "text-graphite ring-1 ring-inset ring-dove" },
  direct: { label: "直接进入", badge: "bg-fog text-graphite" },
};

// ─── 分期标注 ─────────────────────────────────────────────────────────────────

/** 一期标记文案 */
export const PHASE_1_LABEL = "一期";
/** 二期标记文案 */
export const PHASE_2_LABEL = "二期";

// ─── 设计稿（Steep）Badge 配色类（自 recruit/types 迁入，原样复用） ────────────

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
