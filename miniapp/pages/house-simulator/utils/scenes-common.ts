/**
 * 购房模拟器 · 场景内容类型与公共构造（scenes 拆分的公共层）.
 *
 * 承载 23 屏 → SceneBlock 的块类型定义，以及跨场景复用的构建工具
 * （对话气泡 bubble / 月供展示 pmtY / 最终账单贷款标签 loanRowLabel）。
 * 纯函数层，仅依赖 calc/constants 的纯计算，便于单测。
 */

import { fmt, fmtYuan, pmt } from "./calc";
import type { SimState } from "./constants";

/** 对话气泡. */
export interface ChatItem {
  who: string;
  /** 头像字符（who 首字）. */
  whoChar: string;
  text: string;
  me?: boolean;
}

/** 账单行. */
export interface RowItem {
  k: string;
  v: string;
  total?: boolean;
}

/** KPI 卡. */
export interface KpiItem {
  label: string;
  value: string;
  unit: string;
}

/** 大按钮选项. */
export interface OptItem {
  action: string;
  title: string;
  desc?: string;
  marker?: string;
  /** 已用渠道的置灰占位（标题即占位文案，渲染为不可点卡片）. */
  disabled?: boolean;
}

/** 房源卡. */
export interface HouseCardItem {
  id: string;
  emoji: string;
  thumbCls: string;
  tag: string;
  tagCls: string;
  name: string;
  ringTag: string;
  meta: string;
  price: string;
  cut: string;
}

/**
 * 场景内容块（有序），WXML 按 t 分发渲染.
 * 块类型覆盖全部 22 屏的不同布局：页眉/对话/横幅/账单行/KPI/成交卡/房源卡/
 * 选项/提示条/表单(现金·自定义·年限)/CTA/链接/打卡/电子证照.
 */
export type SceneBlock =
  | { t: "eyebrow"; text: string }
  | { t: "title"; text: string; hero?: string; big?: boolean }
  | { t: "sub"; text: string }
  | { t: "dots"; items: { on: boolean }[] }
  | { t: "chat"; items: ChatItem[] }
  | { t: "banner"; cls: "warm" | "sky"; title?: string; desc?: string; large?: boolean }
  | { t: "rows"; items: RowItem[] }
  | { t: "kpis"; items: KpiItem[] }
  | {
      t: "deal";
      origText: string;
      deal: string;
      chips: { text: string; cls: string }[];
    }
  | { t: "houses"; items: HouseCardItem[] }
  | { t: "opts"; items: OptItem[] }
  | { t: "note"; bold?: string; text: string }
  | { t: "form-cash" }
  | { t: "form-custom" }
  | { t: "form-years"; items: { action: string; label: string; active: boolean }[] }
  | {
      t: "downSteps";
      items: { action: string; label: string; amount: string; active: boolean }[];
      min: string;
    }
  | { t: "cta"; items: { action: string; title: string; cls: string }[] }
  | { t: "link"; action: string; text: string }
  | { t: "check"; items: string[] }
  | { t: "deed"; name: string; area: string }
  | { t: "riskLog"; items: { tag: string; ts: string; detail: string }[] };

/** 对话气泡构造. */
export function bubble(who: string, text: string): ChatItem {
  return { who, whoChar: who.charAt(0), text };
}

/** 贷款月供标签（最终账单行）. */
export function loanRowLabel(S: SimState): string {
  if (S.loanType === "comm") {
    return "商贷 " + fmt(S.loan.comm) + " 万";
  }
  if (S.loanType === "gjj") {
    return "公积金 " + fmt(S.loan.gjj) + " 万";
  }
  return "公积金 " + fmt(S.loan.gjj) + " + 商贷 " + fmt(S.loan.comm);
}

/** 月供展示（元/月）. */
export function pmtY(P: number, annual: number, years: number): string {
  return "¥" + fmtYuan(pmt(P, annual, years)) + "/月";
}