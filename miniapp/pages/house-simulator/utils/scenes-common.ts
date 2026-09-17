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

/** 档位卡（装修预算档位 / 设计师档位；选中态停留本屏）. */
export interface GradeItem {
  /** 档位 key. */
  k: string;
  name: string;
  /** 标签（主材自购 / 100 元/㎡ 等）. */
  tag: string;
  /** 标签配色类（hot / cool / 空）. */
  tagCls: string;
  /** 价格文案（约 15 万 / ¥6,000）. */
  price: string;
  desc: string;
  /** 选中后显示的一句话（档位的底牌）. */
  tail?: string;
  /** 是否选中. */
  on: boolean;
  action: string;
}

/** 上划卡信息格（工期 / 谁在做）. */
export interface SwipeCell {
  k: string;
  v: string;
  /** 补充口径（如「下单 2 天 · 等货 30-45 天」）. */
  note?: string;
}

/** 上划卡（3 秒一屏：一句现场 + 两个数字 + 一句提醒；决策屏无 hint/action 不可上划）. */
export interface SwipeBlock {
  t: "swipe";
  /** 日期行（装修 N / 12 · 第 X 天 · X月X日 · 上一步 +N 天）. */
  day?: string;
  name: string;
  /** 这一步在干什么（≤ 26 字）. */
  one: string;
  /** 信息格（工期 / 谁在做）. */
  cells?: SwipeCell[];
  /** 提醒前缀（最容易踩的点： / 验收时间表：）. */
  tipLabel?: string;
  /** 提醒正文. */
  tip?: string;
  /** 提醒配色：warm（全包坑点）/ sky（半包验收时间表）. */
  tipCls?: "warm" | "sky";
  /** 是否展示「上划继续」提示. */
  hint?: boolean;
  /** 上划触发的动作（决策屏留空 = 不可上划跳过）. */
  action?: string;
}

/** 合同清单单项行. */
export interface ClRowItem {
  /** 合同项 k. */
  k: string;
  name: string;
  /** 状态胶囊文案（已写进合同 ¥8,000 / 明确不做 / 没提）. */
  pill: string;
  pillCls: string;
  /** 纠纷点. */
  why: string;
  /** 「写清」正文（do 态展示）. */
  write?: string;
  /** 「不做」后果（no 态展示）. */
  noNote?: string;
  doLabel: string;
  doAction: string;
  doOn: boolean;
  noLabel: string;
  noAction: string;
  noOn: boolean;
}

/** 增项单条目. */
export interface BurstItem {
  no: string;
  stage: string;
  /** 爆单日（第 N 天）. */
  day: number;
  lines: { k: string; v: string }[];
  /** 小计文案（¥10,800 · +2 天）. */
  sum: string;
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
  | { t: "grades"; items: GradeItem[] }
  | SwipeBlock
  | {
      t: "pricebar";
      label: string;
      value: string;
      note?: string;
      /** 超支（结账 > 合同）：染警示色. */
      bad?: boolean;
      /** 正反馈（13 项全写清）：染绿色——写清不该被染成警告色. */
      ok?: boolean;
      /** 双段进度条（白 = 计划内，暖色 = 超出来的部分），仅总账工期条用. */
      bar?: { base: number; over: number };
    }
  | { t: "prog"; label: string; done: number; total: number; pct: number }
  | { t: "clSec"; title: string; count: string; rows: ClRowItem[] }
  | {
      t: "burst";
      /** 标题（全包「🧾 增项单 N 张」/ 半包「🛒 自购踩坑 N 笔」）. */
      title: string;
      count: number;
      src: string;
      items: BurstItem[];
      restText?: string;
      restSum?: string;
      hint: string;
      /** 本次合计文案（¥8,700 · 返工 +3 天）. */
      total: string;
    }
  | { t: "gantt"; items: { h: number; hot: boolean }[]; labels: string[] }
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
  | { t: "check"; items: string[]; title?: string }
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