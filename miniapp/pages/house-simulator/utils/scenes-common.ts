/**
 * 购房模拟器 · 场景内容类型与公共构造（scenes 拆分的公共层）.
 *
 * 承载「38 屏 → 有序 SceneBlock 列表」的块类型定义，以及跨场景复用的构建工具
 * （对话气泡 bubble / 时间条单元格 / 坑块 / 学费单）。WXML 按块类型顺序渲染，
 * 因此在场景侧就能决定文案顺序与交互层级。
 *
 * 块类型分两类：
 *  - 购房模块（对齐 2026-09-17 设计稿）：timebar / pit / wait / chips / chipsRows /
 *    g3 / trail / tuition / lrn / clSec（签约 12 项）/ pricebar / prog / rows …
 *  - 装修模块（对齐 2026-09-15 设计稿 v6）：grades / swipe / clSec / burst / gantt /
 *    pricebar / banner / rows …
 */

import type { SimState } from "./constants";
import type { ScreenMeta } from "./flow";

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
  /** 合计行（加粗 + 主题色）. */
  total?: boolean;
  /** 值配色：ok 绿（已结清）/ bad 红（未结清 ✕）. */
  vCls?: "ok" | "bad";
  /** 键下方的小字补充（为什么这一项要核）. */
  sub?: string;
}

/** 大按钮选项. */
export interface OptItem {
  action: string;
  title: string;
  desc?: string;
  /** 右侧关键数字（+36.30 万 / 首付 20% / 6%），见各屏口径. */
  price?: string;
  /** 关键数字配色类（danger = 红色，用于「到手价」这类多掏的钱）. */
  priceCls?: string;
  /** 名称后的标签（成交 / 先问清 / 最低 40 万 / ⚠️ 红线）. */
  tag?: string;
  /** 标签配色类（hot / cool / 空）. */
  tagCls?: string;
  /** 选项脚注（越线大概率被叫停 / 这笔钱在算账屏才会出现）. */
  note?: string;
  /** 脚注为风险口径（红色）. */
  risk?: boolean;
  /** 已选（停留本屏的选项：身份 / 贷款方式 / 筹钱渠道 / 中介费；选中态必须一眼看得出来）. */
  on?: boolean;
  /** 已用渠道的置灰占位. */
  disabled?: boolean;
}

/** 单个胶囊（现金档 / 首付档 / 自定义房源口径）. */
export interface ChipItem {
  action: string;
  label: string;
  on: boolean;
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

/** 上划卡（装修阶段：一句现场 + 两个数字 + 一句提醒）. */
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
  /** 提醒配色：warm（全包坑点）/ sky（半包验收时间表）/ card（购房上划卡的坑块）. */
  tipCls?: "warm" | "sky" | "card";
  /** 购房上划卡内的坑块（一句最容易踩的点）. */
  pit?: string;
  /** 购房上划卡内的规避句. */
  fix?: string;
  /** 是否展示「上划继续」提示. */
  hint?: boolean;
  /** 上划触发的动作（决策屏留空 = 不可上划跳过）. */
  action?: string;
}

/** 合同清单单项行（签约 12 项深坑 / 装修 13 项合同清单共用）. */
export interface ClRowItem {
  /** 合同项 k. */
  k: string;
  name: string;
  /** 状态胶囊文案（已写进合同 / 不写 · ¥1.20 万 / 没提）. */
  pill: string;
  pillCls: string;
  /** 这一项为什么重要. */
  why: string;
  /** 「写清」正文（do 态展示）. */
  write?: string;
  /** 「不写」的代价正文（no 态展示）. */
  noNote?: string;
  doLabel: string;
  doAction: string;
  doOn: boolean;
  noLabel: string;
  noAction: string;
  noOn: boolean;
}

/** 增项单条目（装修）. */
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
  tag: string;
  /** 标签配色类（hot / cool / 空）. */
  tagCls: string;
  name: string;
  /** 房源卡的信息行（面积·首付·环线 / 税费口径）. */
  metas: string[];
  price: string;
  /** 可砍幅度（"可砍 6%"，空 = 不显示）. */
  cut: string;
  /** 已选中（选房屏停留本屏确认，选中态必须一眼看得出来）. */
  on?: boolean;
}

/** 双层时间条的单元格. */
export interface TimeCell {
  /** 格标题（经历周期 / 常规周期 · 等谁）. */
  k: string;
  /** 主数字（11天 / 7-15 天 / 当天）. */
  v: string;
  /** 主数字后的小字（天 / 空）. */
  unit: string;
  /** 脚注（含同期说明与累计 / 等谁 + 为什么是这段区间）. */
  n: string;
  /** 是否暖色格（右边常规周期格）. */
  real: boolean;
}

/**
 * 场景内容块（有序），WXML 按 t 分发渲染.
 */
export type SceneBlock =
  | { t: "eyebrow"; text: string }
  | { t: "title"; text: string; hero?: string; big?: boolean }
  | { t: "sub"; text: string }
  | { t: "prog"; label: string; done: number; total: number; pct: number }
  | { t: "chat"; items: ChatItem[] }
  | { t: "rows"; key?: string; items: RowItem[] }
  | { t: "houses"; items: HouseCardItem[] }
  | { t: "opts"; items: OptItem[] }
  | { t: "chips"; key?: string; items: ChipItem[] }
  | { t: "chipsRows"; key?: string; rows: { k: string; items: ChipItem[] }[] }
  | { t: "timebar"; day: string; strips: TimeCell[] }
  | { t: "wait"; title: string; who: string; steps: { label: string; cls: string }[]; rows: { k: string; v: string }[] }
  | { t: "pit"; title: string; fix?: string; sky?: boolean; /** 规避行的前缀（pitBlock 传「怎么避免：」；结果/结论卡传空串 = 不显示前缀） */ fixLabel?: string }
  | { t: "sect"; title: string; x: string }
  | { t: "g3"; items: { k: string; v: string; n: string }[] }
  | { t: "trail"; items: { text: string; hot: boolean }[] }
  | { t: "clSec"; title: string; count: string; rows: ClRowItem[] }
  | { t: "tuition"; title: string; src: string; items: { name: string; amount: string; text: string }[]; total: string }
  | { t: "lrn"; count: string; sum: string; rows: { b: string; t: string; r: string }[]; rest?: string }
  | { t: "gantt"; items: { h: number; hot: boolean }[]; labels: string[] }
  | { t: "rail"; segs: string[] }
  | {
      t: "pricebar";
      label: string;
      value: string;
      note?: string;
      /** 超支/踩坑（染警示色）. */
      bad?: boolean;
      /** 正反馈（染绿色）. */
      ok?: boolean;
      /** 双段进度条（白 = 计划内，暖色 = 超出来的部分）. */
      bar?: { base: number; over: number };
    }
  | { t: "note"; bold?: string; text: string }
  | { t: "riskLog"; items: { tag: string; ts: string; detail: string }[] }
  | SwipeBlock
  | { t: "grades"; items: GradeItem[] }
  | {
      t: "burst";
      /** 标题（🧾 增项单 N 张 / 🛒 自购踩坑 N 笔）. */
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
  | { t: "banner"; cls: "warm" | "sky"; title?: string; desc?: string; large?: boolean }
  | { t: "form-cash" }
  | { t: "form-custom" }
  | { t: "form-years"; items: { action: string; label: string; active: boolean }[] }
  | {
      t: "downSteps";
      items: { action: string; label: string; amount: string; active: boolean }[];
      /** 政策最低首付档（如 "20%"；模板自带「最低」前缀，这里不要再重复写「最低」） */
      min: string;
    }
  /** 辅助按钮行（主按钮由页面 primary 承担；这里放回退 / 次级动作）. */
  | { t: "cta"; items: { action: string; title: string; cls: string; wait?: string }[] };

/** 对话气泡构造. */
export function bubble(who: string, text: string): ChatItem {
  return { who, whoChar: who.charAt(0), text };
}

/** 主按钮数据（页面渲染在内容块之后，可单独 patch：输入框改值时不整屏重绘）. */
export interface PrimaryAction {
  title: string;
  /** 按钮动作（pay:* = 先弹付款确认）. */
  action: string;
  /** 等待承诺（如「等批贷 7-15 天」），按下之前就知道要等多久. */
  wait: string;
  disabled: boolean;
  /** 按钮配色类（缺省 btn-ink；次级动作用 btn-out；禁用态由 disabled 自动走 btn-disabled）. */
  cls?: string;
}

/** 场景视图：内容块（有序）+ 主按钮（null = 本屏靠选项推进，不摆主按钮）. */
export interface SceneView {
  blocks: SceneBlock[];
  primary: PrimaryAction | null;
}

/** 装修屏视图（CTA 在内容块内，无独立主按钮）. */
export function plainView(blocks: SceneBlock[]): SceneView {
  return { blocks, primary: null };
}

/** 双层时间条：左 = 经历周期（这一段抽到的天数 + 累计），右 = 常规周期 + 等谁 + 为什么. */
export function timeStrip(S: SimState, meta: ScreenMeta, days: number): TimeCell[] {
  if (meta.real === "—") {
    return [];
  }
  const pit = S.lessons.reduce((a, b) => a + b.days, 0);
  return [
    {
      k: "经历周期",
      v: days > 0 ? String(days) : "当天",
      unit: days > 0 ? "天" : "",
      n: (meta.par ? "与相邻环节同期 · " : "") + "累计第 " + S.day + " 天" + (pit ? "（含坑 " + pit + " 天）" : ""),
      real: false,
    },
    {
      k: "常规周期 · 等谁",
      v: meta.real,
      unit: "",
      n: (meta.waitWho ?? "") + "：" + (meta.waitWhy ?? ""),
      real: true,
    },
  ];
}

/** 房源卡首付估算（万元，按当前身份 / 环线 / 贷款方式）. */
export function houseDownText(price: number, rate: number): string {
  return "首付约 " + ((price * rate) / 10000).toFixed(2) + " 万";
}

/** 屏首时间块：第 N 天 + 双层时间条（real === "—" 的屏只留第 N 天，不编数字）. */
export function dayBlock(S: SimState, meta: ScreenMeta, drawn: number): SceneBlock {
  return { t: "timebar", day: "第 " + S.day + " 天", strips: timeStrip(S, meta, drawn) };
}

/** 每屏的坑块（一句最容易踩的点 + 一句怎么避免；pit 为空则不摆）. */
export function pitBlock(meta: ScreenMeta): SceneBlock[] {
  if (!meta.pit) {
    return [];
  }
  return [{ t: "pit", title: meta.pit, fix: meta.fix, fixLabel: "怎么避免：" }];
}

/**
 * 等待屏明细（审批 / 过户 / 交房三张屏展开）：把「为什么等这么久」摊开——
 * 常规节点轴（走到哪一步）+ 对方在做什么 + 你现在要做什么。
 */
export function waitBlock(meta: ScreenMeta): SceneBlock[] {
  const w = meta.wait;
  if (!w) {
    return [];
  }
  return [{
    t: "wait",
    title: "这 " + meta.real + "在等谁：",
    who: meta.waitWho ?? "",
    steps: w.steps.map((label, i) => ({ label, cls: i < w.at ? "done" : i === w.at ? "on" : "" })),
    rows: [
      { k: "对方", v: w.peer },
      { k: "你", v: w.you },
    ],
  }];
}