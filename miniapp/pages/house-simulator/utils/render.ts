/**
 * 购房模拟器 · 页面渲染数据构建（状态带 / 装修流程条 / 付款确认弹窗）.
 *
 * 从 index.ts 拆出的纯构建函数：依据全局状态 S 产出 setData 所需
 * guard（购房状态带）/ steps（装修阶段流程条）/ meters（装修双进度条）/ modal（付款确认弹窗）。
 * 纯函数，不触碰 wx/Page 实例，便于单测与逐屏对照校验。
 *
 * 时间口径（2026-09-17 设计稿）：购房流程的「已走 N 天」= 各段经历周期抽取累计 + 坑拖出的天
 * （calc.elapsed），期条以 90 天（1-3 个月上界）为刻度；装修阶段沿用装修 v6 的钱/工双条。
 */

import { fmt, lossRows, money, paid, pitDays, timeScale } from "./calc";
import { NODES, STAGES } from "./constants";
import type { SimState } from "./constants";
import { PAY_KINDS, REAL_MAX, REAL_MIN, screenIdx, SCREENS, screenMeta } from "./flow";
import type { PayKind } from "./flow";
import { contractPriceOf, paidTotalOf, renovDelayDays, renovPlanAbs, wanFmt, yuanFmt } from "./renov-data";

/* ============================ 购房状态带 ============================ */

/** 进度条数据（base = 计划内/已走，over = 超出的部分）. */
export interface MeterData {
  base: number;
  over: number;
  /** 条右侧主数字（¥200.00 万 / 已走 42 天）. */
  text: string;
  /** 主数字后的口径说明（/ 需现金 522.50 万 / 常规 1-3 个月）. */
  sub: string;
}

/** 期条：黑 = 已走的经历天数，暖色 = 到 90 天刻度还剩下的常规区间. */
export interface TimeMeterData {
  base: number;
  /** 暖色带左侧留白（%），紧跟黑色段之后. */
  warmMargin: number;
  warmWidth: number;
  text: string;
  sub: string;
}

/** 购房状态带（12 段节点线 + 钱条 + 期条 + 多花提示）. */
export interface GuardData {
  /** 当前屏名与进度（「签约 · 居间协议 15/24」/「交易完成 · 已拿钥匙」）. */
  cur: string;
  /** 第 N 天. */
  day: string;
  segs: { cls: string }[];
  names: { t: string; on: boolean }[];
  money: MeterData;
  time: TimeMeterData;
  /** 多花提示（多花 N 笔 · ¥X 万），无则空串. */
  loss: string;
}

/** 构建购房状态带（仅购房 24 屏；装修屏返回 null，走装修自己的流程条与双条）. */
export function buildGuard(S: SimState): GuardData | null {
  if (S.scene.indexOf("renov") === 0) {
    return null;
  }
  const i = screenIdx(S.scene);
  const d = i >= 0 ? SCREENS[i] : SCREENS[0];
  const done = S.scene === "final";
  const m = money(S);
  const p = paid(S);
  const rows = lossRows(S);
  /* 多花口径 = 学费单 + 谈价答应的「到手价」（与总账屏的清单同一套账） */
  const lessons = rows.reduce((a, b) => a + b.cost, 0);
  const den = Math.max(m.need + lessons, 0.001);
  const ts = timeScale(S.day);
  return {
    cur: done ? "交易完成 · 已拿钥匙" : d.name + " " + (i + 1) + "/" + SCREENS.length,
    day: "第 " + S.day + " 天",
    segs: NODES.map((_, x) => ({ cls: done || x < d.node ? "done" : x === d.node ? "cur" : "future" })),
    names: NODES.map((t, x) => ({ t, on: !done && x === d.node })),
    money: {
      base: (p / den) * 100,
      over: (lessons / den) * 100,
      text: m.need ? "¥" + fmt(p) + " 万" : "预算未定",
      sub: m.need ? "/ 需现金 " + fmt(m.need) + " 万" + (S.borrowed ? "（已筹 " + fmt(S.borrowed) + " 万）" : "") : "",
    },
    time: {
      base: ts.base,
      warmMargin: Math.max(0, ts.rangeAt - ts.base),
      warmWidth: ts.base < 100 ? ts.rangeW : 0,
      text: "已走 " + S.day + " 天",
      sub: (pitDays(S) ? "（含坑拖出 " + pitDays(S) + " 天）" : "") + " / 常规 1-3 个月",
    },
    loss: lessons
      ? "多花 " + rows.length + " 笔 · ¥" + fmt(lessons) + " 万（合同没写清 / 谈价没谈清的账）"
      : "",
  };
}

/* ============================ 装修：流程条 + 钱/工双条 ============================ */

/** 12 节点流程条单节点. */
export interface StepItem {
  label: string;
  mark: string;
  cls: string;
}

/** 装修期双条：钱（结账 / 合同）+ 工（实际 / 计划），条宽为百分比. */
export interface RenovMeters {
  money: MeterData;
  time: MeterData;
  /** 条下方的损失口径（有增项才显示）. */
  loss: string;
}

/** 装修阶段流程条（12 项，替代交易 12 节点；顺序与 RENOV_STAGES 一致，主材紧跟拆除）. */
const RENOV_STEP_LABELS = ["设计", "签约", "拆除", "主材", "水电", "防水", "木瓦", "油漆", "安装", "保洁", "通风", "质保"];

/** 装修场景 → 阶段下标（1=设计起，12=全部完成；renovStart=0，renovDone 与质保同格）. */
const RENOV_SCENE_IDX: Partial<Record<SimState["scene"], number>> = {
  renovStart: 0,
  renovDesign: 1,
  renovContract: 2,
  renovDemo: 3,
  renovMain: 4,
  renovElec: 5,
  renovSeal: 6,
  renovTileWood: 7,
  renovPaint: 8,
  renovInstall: 9,
  renovClean: 10,
  renovAir: 11,
  renovWarr: 12,
  renovDone: 12,
};

/** 装修阶段名（HUD 顶部徽章）. */
export function renovStageLabel(S: SimState): string {
  return STAGES[S.scene] ?? "装修";
}

/** 构建装修流程条 + 顶部天数文案（装修屏专用）. */
export function buildRenovSteps(S: SimState): { steps: StepItem[]; stepPos: string; dayText: string } {
  const idx = RENOV_SCENE_IDX[S.scene] ?? 0;
  const steps = RENOV_STEP_LABELS.map((label, i) => ({
    label,
    mark: i < idx ? "✓" : "",
    /* 当前阶段 = 下标 idx-1（idx 从 1 起对应 labels 下标 0 起）；未开始（idx=0）
       与全部完成（idx=12）都不标当前格 */
    cls: idx > 0 && idx < RENOV_STEP_LABELS.length && i === idx - 1 ? "cur" : i < idx ? "done" : "",
  }));
  return {
    steps,
    stepPos: idx === 0 ? "开工前 · 定预算" : "装修 " + idx + " / 12",
    dayText: "第 " + (S.renovDay || 1) + " 天",
  };
}

/** 装修期双条（仅装修场景返回；口径对齐装修设计稿 v6）. */
export function buildRenovMeters(S: SimState): RenovMeters | null {
  if (S.scene.indexOf("renov") !== 0) {
    return null;
  }
  const plan = contractPriceOf(S);
  const pay = paidTotalOf(S);
  const extra = S.renovExtra;
  const den = Math.max(plan, pay, 1);
  const day = S.scene === "renovWarr" || S.scene === "renovDone" ? S.renovDoneDay || S.renovDay : S.renovDay;
  const planAbs = renovPlanAbs(S.renovStartDay);
  const tden = Math.max(planAbs, day, 1);
  return {
    money: {
      base: (plan / den) * 100,
      over: (extra / den) * 100,
      text: "¥" + wanFmt(pay) + " 万",
      sub: "/ 合同 " + wanFmt(plan) + " 万",
    },
    time: {
      base: (Math.min(planAbs, day) / tden) * 100,
      over: (renovDelayDays(day, S.renovStartDay) / tden) * 100,
      text: day + " 天",
      sub: "/ 计划 " + planAbs + " 天",
    },
    loss: extra
      ? (S.renovPkg === "half" ? "自购踩坑 " + S.renovBills.length + " 笔" : "增项 " + S.renovBills.length + " 张") + " · " + yuanFmt(extra) + "（" + (S.renovPkg === "half" ? "合同外的账" : "合同里没写的") + "）"
      : "",
  };
}

/* ============================ 付款确认弹窗 ============================ */

/** 付款确认弹窗数据（定金 / 网签首付先付 / 补足剩余首付 / 缴税 / 扣押尾款）. */
export interface PayInfo {
  kind: PayKind;
  title: string;
  /** 现有现金 / 本次支付（或扣留尾款）/ 支付后剩余（或现金不变）. */
  nowLabel: string;
  payLabel: string;
  afterLabel: string;
  now: string;
  pay: string;
  after: string;
  note: string;
  /** 违约警示（醒目警示色）. */
  warn: string;
  /** 下一节点：名称 / 常规周期 / 等谁 + 为什么. */
  nextName: string;
  nextReal: string;
  nextWait: string;
}

/** 底部弹层数据（当前只有付款确认）. */
export interface ModalData {
  type: "" | "pay";
  pay: PayInfo | null;
}

/** 弹层空态. */
export function emptyModal(): ModalData {
  return { type: "", pay: null };
}

/**
 * 付款确认弹窗：现金三段 + 口径说明 + 违约警示 + 下一节点与它的常规周期。
 * 「出款这一下」同时让用户感知这笔钱锁住了什么，以及接下来等多久、等谁。
 * 尾款扣押从卖方应得房款中扣留，不占用买方现金（第三格显示「现金不变」）。
 */
export function payModal(S: SimState, kind: PayKind, amount: number): ModalData {
  const def = PAY_KINDS[kind];
  const noCash = !!def.noCash;
  const nx = def.next ? screenMeta(def.next) : null;
  return {
    type: "pay",
    pay: {
      kind,
      title: def.title,
      nowLabel: "现有现金",
      payLabel: noCash ? "扣留尾款" : "本次支付",
      afterLabel: noCash ? "现金不变" : "支付后剩余",
      now: fmt(S.cash),
      pay: fmt(amount),
      after: noCash ? fmt(S.cash) : fmt(S.cash - amount),
      note: def.note,
      warn:
        kind === "deposit"
          ? "你违约 → 已付定金 " + fmt(S.deal * 0.05) + " 万不予返还；卖方违约 → 双倍返还 " + fmt(S.deal * 0.1) + " 万。"
          : kind === "firstPay" || kind === "restPay"
            ? "网签合同已生效：此刻反悔或迟延履行，按房价 20% 赔违约金，约 " + fmt(S.deal * 0.2) + " 万。"
            : "",
      nextName: nx ? nx.name : "装修",
      nextReal: nx ? "常规周期 " + nx.real : "交房后即可开工",
      nextWait: nx
        ? (nx.waitWho ?? "") + "：" + (nx.waitWhy ?? "")
        : "装修工期见装修模块（本模块不含）。",
    },
  };
}

/** 期条刻度常量（1-3 个月口径）. */
export const TIME_SCALE = { min: REAL_MIN, max: REAL_MAX };

/**
 * 把「第 N 天」落到真实日期：以今天为第 1 天，第 N 天 = 今天 + (N-1) 天.
 * 装修阶段（scenes-renov 的日期行）与状态带口径一致，让用户感知真实日历流逝。
 */
export function realOf(day: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + (day - 1));
  return d;
}