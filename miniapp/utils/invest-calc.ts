/**
 * 投资测算器纯计算模块.
 *
 * ⚠️ 计算口径与展示文案必须与 docs/To-Do/​​calculator.html 完全一致，禁止任何调整。
 * 移植关系：HTML `recalc()` 内的税费判定/利润推导逻辑原样落地于此，
 * 页面层（index.ts）仅做状态管理、事件绑定与 setData 渲染。
 */

/** 上海税政版本标注（HTML eyebrow/footer/税费明细副标题同源）. */
export const TAX_POLICY_LABEL = "SHANGHAI · 2026/2/25 税政";

/** 家庭住房套数（契税档）：sole=唯一 / second=第 2 套 / three=≥3 套. */
export type FamKey = "sole" | "second" | "three";

/** 个税计征方式：auto=自动取低 / r1=全额 1% / p20=差额 20% / fa=法拍 3%. */
export type PitMethod = "auto" | "r1" | "p20" | "fa";

/** 增值税税率档：3.18% 标准 / 3.15% 城镇. */
export type VatRate = "0.0318" | "0.0315";

/** 持有时间快捷片（月）. */
export const HOLD_CHIPS = [3, 6, 12, 24, 60];

/** 滑杆最大月数（需求指定 120；HTML 原版 240，此处为用户授权的偏差）. */
export const HOLD_MAX = 120;

/** 增值税税率文案（HTML 渲染用）. */
export const PIT_NAMES: Record<string, string> = {
  r1: "全额 1%",
  p20: "差额 20%",
  fa: "法拍 3%",
};

/** 家庭套数文案（HTML 渲染用）. */
export const FAM_TXT: Record<FamKey, string> = {
  sole: "家庭唯一住房",
  second: "家庭第 2 套住房",
  three: "家庭 ≥3 套 / 企业购房",
};

/** 万元金额格式化（与 HTML fw() 一致：zh-CN 千分位，固定 2 位小数）. */
export function fw(v: number): string {
  return (isFinite(v) ? v : 0).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** 表单输入数值解析（与 HTML num() 一致：非法回 0）. */
export function toNum(v: string | number | undefined | null): number {
  const n = parseFloat(String(v ?? ""));
  return isFinite(n) ? n : 0;
}

/** 测算输入（单位：万元 / 月 / ㎡ / %，与 HTML 表单字段一一对应）. */
export interface CalcInput {
  buy: number;
  sell: number;
  months: number;
  area: number;
  /** 买入税务核定价（0/空 = 默认同买进价）. */
  buyAssessed: number;
  /** 卖出税务核定价（0/空 = 默认同卖出价）. */
  sellAssessed: number;
  fam: FamKey;
  vatRate: VatRate;
  pitMethod: PitMethod;
  /** 家庭唯一住房开关（HTML iSole）. */
  sole: boolean;
  /** 买入时上家持有不满 2 年开关（HTML iBuyUnder2）. */
  buyUnder2: boolean;
  loan: number;
  /** 贷款年化利率（%）. */
  rate: number;
  reno: number;
  quota: number;
  extra: number;
  /** 买进佣金率（%）. */
  buyCommRate: number;
  /** 卖出佣金率（%）. */
  sellCommRate: number;
}

/** 测算结果（字段名与 HTML recalc() 局部变量一致，便于逐行对照）. */
export interface CalcResult {
  aBuy: number;
  aSell: number;
  /** 卖出环节增值税及附加. */
  sellVat: number;
  /** 买入环节增值税及附加（上家不满 2 年由买方承担）. */
  buyVat: number;
  /** 契税计税基础 = aBuy − buyVat. */
  deedBase: number;
  deedRate: number;
  deed: number;
  /** 满五年（≥60 个月）. */
  full5: boolean;
  /** 满五唯一免征. */
  exempt: boolean;
  /** 全额（核定 1%）口径个税. */
  pitFull: number;
  /** 差额（20%）口径个税基数（可为负）. */
  pitBase20: number;
  /** 差额（据实 20%）口径个税. */
  pitDiff: number;
  pit: number;
  pitLabel: string;
  /** 实际生效的个税口径（exempt / auto / r1 / p20 / fa）. */
  pitMode: string;
  /** 贷款利息（简单利息估算）. */
  interest: number;
  buyComm: number;
  sellComm: number;
  /** 税费合计（卖出增值税 + 买入增值税 + 契税 + 个税）. */
  taxTotal: number;
  /** 毛利（未扣税）. */
  gross: number;
  /** 预计净利润. */
  net: number;
  /** 初始投入（买进价 − 贷款金额 + 装修费 + 买进佣金）. */
  invest: number;
  /** 利润率（%，invest>0 才有意义）. */
  margin: number;
  /** 年化（利润率 ÷ 持有年数）. */
  annual: number;
  /** 总成本（含利息）. */
  costTotal: number;
}

/**
 * 核心测算：与 HTML recalc() 计算段逐行对齐，禁止调整口径.
 *
 * 增值税及附加：持有 <24 个月 → 强制征收（核定 ÷1.03 × 税率）；≥24 → 免征（自动，不可手动改）.
 * 契税：唯一 1%/1.5% · 第2套 1%/2% · ≥3套或企业 3%（以 140㎡ 分档）.
 * 个税：满5年(60月)+唯一 → 免征；否则全额(核定1%)与差额(利润20%)两算取低，法拍按 3%.
 * 利息：本金 × 年化 × 持有年数（简单利息估算）.
 */
export function calc(i: CalcInput): CalcResult {
  const aBuy = i.buyAssessed || i.buy;
  const aSell = i.sellAssessed || i.sell;
  const vr = parseFloat(i.vatRate);

  const sellVat = i.months < 24 ? (aSell / 1.03) * vr : 0;
  const buyVat = i.buyUnder2 ? (aBuy / 1.03) * vr : 0;

  const deedBase = aBuy - buyVat;
  const deedRate =
    i.fam === "three" ? 0.03 : i.fam === "second" ? (i.area > 140 ? 0.02 : 0.01) : i.area > 140 ? 0.015 : 0.01;
  const deed = deedBase * deedRate;

  const full5 = i.months >= 60;
  const exempt = full5 && i.sole;
  const pitFull = (aSell - sellVat) * 0.01;
  const pitBase20 = aSell - sellVat - aBuy - buyVat - i.reno;
  const pitDiff = Math.max(0, pitBase20 * 0.2);
  let pit = 0;
  let pitMode = exempt ? "exempt" : i.pitMethod;
  let pitLabel = "";
  if (pitMode === "auto") {
    pitLabel = pitDiff < pitFull ? PIT_NAMES.p20 : pitFull < pitDiff ? PIT_NAMES.r1 : "全额=差额";
    pit = Math.min(pitFull, pitDiff);
  } else {
    pitLabel = PIT_NAMES[i.pitMethod];
    pit = pitMode === "r1" ? pitFull : pitMode === "p20" ? pitDiff : (aSell - sellVat) * 0.03;
  }

  const interest = i.loan * (i.rate / 100) * (i.months / 12);
  const buyComm = i.buy * (i.buyCommRate / 100);
  const sellComm = i.sell * (i.sellCommRate / 100);
  const taxTotal = sellVat + buyVat + deed + pit;
  const gross = i.sell - i.buy - i.reno - i.quota - i.extra - interest - buyComm - sellComm;
  const net = gross - taxTotal;
  const invest = i.buy - i.loan + i.reno + buyComm;
  const margin = invest > 0 ? (net / invest) * 100 : 0;
  const annual = i.months > 0 ? margin / (i.months / 12) : 0;
  const costTotal = i.buy + taxTotal + buyComm + sellComm + i.quota + i.reno + i.extra + interest;

  return {
    aBuy,
    aSell,
    sellVat,
    buyVat,
    deedBase,
    deedRate,
    deed,
    full5,
    exempt,
    pitFull,
    pitBase20,
    pitDiff,
    pit,
    pitLabel,
    pitMode,
    interest,
    buyComm,
    sellComm,
    taxTotal,
    gross,
    net,
    invest,
    margin,
    annual,
    costTotal,
  };
}

/**
 * 复制结果文本：与 HTML btnCopy 汇总完全一致（含「友席美房投资测算工具」抬头）.
 */
export function buildCopyText(i: CalcInput, r: CalcResult, buyCommTxt: string, sellCommTxt: string): string {
  const vatState = i.months < 24 ? `不满2年征收 ${(parseFloat(i.vatRate) * 100).toFixed(2)}%` : "满2年免征";
  const pitState = r.exempt
    ? "满五唯一免征"
    : i.pitMethod === "auto"
      ? `自动取低（${r.pitLabel}）`
      : r.pitLabel;
  return [
    "【友席美房投资测算工具 · 上海 2026/2/25 税政】",
    `买进 ${fw(i.buy)} 万 → 卖出 ${fw(i.sell)} 万，持有 ${i.months} 个月`,
    `增值税及附加：${fw(r.sellVat)} 万（${vatState}）`,
    `个人所得税：${fw(r.pit)} 万（${pitState}）`,
    `契税：${fw(r.deed)} 万 · 买入增值税：${fw(r.buyVat)} 万`,
    `贷款利息：${fw(r.interest)} 万 · 装修 ${fw(i.reno)} 万 · 名额费 ${fw(i.quota)} 万${i.extra ? ` · 额外成本 ${fw(i.extra)} 万` : ""}`,
    `佣金（买 ${buyCommTxt} / 卖 ${sellCommTxt}）：${fw(r.buyComm + r.sellComm)} 万`,
    `初始投入 ${fw(r.invest)} 万 · 税费合计 ${fw(r.taxTotal)} 万 · 总成本 ${fw(r.costTotal)} 万`,
    `★ 预计净利润 ${fw(r.net)} 万（利润率 ${r.margin.toFixed(1)}%，年化 ${r.annual.toFixed(1)}%）`,
  ].join("\n");
}
