/**
 * 投资测算器页面.
 *
 * ⚠️ 页面布局 / 交互 / 计算逻辑 / 文案必须与 docs/To-Do/​​calculator.html 完全一致，禁止任何调整。
 * - HTML `recalc()` 的计算段在 utils/invest-calc.ts（纯函数，逐行对齐）；
 * - HTML `recalc()` 的渲染段在本文件 recalc()（逐行对齐，WXML 零数值运算，全部预格式化）；
 * - 门禁：仅「已登录且已绑定手机号」的用户可使用（HTML 无此约束，为本次需求新增的唯一差异点）.
 *
 * ⚠️ 单文件 >500 行说明：本文件 700+ 行中约 2/3 为「初始 data + recalc 渲染段」——
 * 这是 HTML recalc() 渲染段的 1:1 映射，字段与 HTML 元素 id 一一对应；
 * 拆分到多文件会切断「HTML 源 ↔ 实现」的逐段对照链路，违背本次「完全一致、禁止调整」的硬约束，故保持单文件。
 */
import type { components } from "../../../types/api-types";
import { calc, buildCopyText, fw, toNum, HOLD_MAX, TAX_POLICY_LABEL } from "../../../utils/invest-calc";
import type { CalcInput, CalcResult, FamKey, PitMethod, VatRate } from "../../../utils/invest-calc";
import { getAccessToken, getCAccessToken } from "../../../utils/token";
import { request } from "../../../utils/request";

type PublicUserInfo = components["schemas"]["PublicUserInfo"];

/** 持有时间展示（HTML oHoldM/oHoldY 同源）. */
interface HoldView {
  m: string;
  y: string;
}

/** 持有时间快捷片视图. */
interface HoldChipView {
  m: number;
  label: string;
  on: boolean;
}

/** 分段控件选项视图. */
interface SegOptionView {
  v: string;
  label: string;
  on: boolean;
}

/** WXML 渲染模型：recalc 渲染段的所有输出（全部预格式化，WXML 零数值运算）. */
export interface InvestCalcView extends CalcResult {
  /* ── 门禁 ── */
  gate: boolean;
  loggedIn: boolean;

  /* ── 顶栏 / hero ── */
  eyebrow: string;

  /* ── 输入回显 ── */
  buy: string;
  sell: string;
  area: string;
  buyAssessed: string;
  sellAssessed: string;
  loan: string;
  rate: string;
  reno: string;
  quota: string;
  extra: string;
  buyCommRate: string;
  sellCommRate: string;

  /* ── 控件状态 ── */
  months: number;
  holdPct: number;
  hold: HoldView;
  holdTip: string;
  holdChips: HoldChipView[];
  segFam: SegOptionView[];
  segVat: SegOptionView[];
  segPit: SegOptionView[];
  sole: boolean;
  buyUnder2: boolean;

  /* ── 结果卡 ── */
  profit: string;
  profitNeg: boolean;
  note: string;
  chipInvest: string;
  chipTax: string;
  chipMargin: string;
  chipAnnual: string;

  /* ── 资金卡 ── */
  interestText: string;
  interestCap: string;

  /* ── 增值税卡 ── */
  vatStateOk: boolean;
  vatChip: string;
  vatAmt: string;
  vatCap: string;
  vatHintCls: string;
  vatHint: string;

  /* ── 个税卡 ── */
  pitStateOk: boolean;
  pitChip: string;
  pitAmt: string;
  pitCap: string;
  pitHintCls: string;
  pitHint: string;

  /* ── 契税卡 ── */
  deedChip: string;
  deedAmt: string;
  deedCap: string;

  /* ── 其他费用卡 ── */
  buyCommTag: string;
  sellCommTag: string;
  bBuyComm: string;
  bSellComm: string;

  /* ── 成本总览卡 ── */
  showBuyVat: boolean;
  bDeed: string;
  bBuyVat: string;
  bBuyComm2: string;
  bSellComm2: string;
  bQuota: string;
  bReno: string;
  bExtra: string;
  bInterest: string;
  bVat: string;
  bPit: string;
  fDeed: string;
  fBuyVat: string;
  fBuyComm: string;
  fInterest: string;
  fVat: string;
  fPit: string;
  fSellComm: string;
  tTax: string;
  tCost: string;
  fTax: string;
  fCost: string;

  /* ── 底部栏 ── */
  dockProfit: string;
  copyDone: boolean;
}

/** 页面实例自定义方法（Page 泛型第二参数）. */
interface PageCustom {
  /** 贷款金额默认联动买进价 80%（手动修改后不再联动，等价 HTML loanAuto）. */
  loanAuto: boolean;
  /** 「已复制 ✓」提示复原计时器. */
  copyTimer: ReturnType<typeof setTimeout> | null;
  /** 拉取 /public/auth/me 判定登录与手机号绑定状态（失败按未登录处理）. */
  loadGate(): Promise<void>;
  buildInput(): CalcInput;
  recalc(): void;
  onBuyInput(e: WechatMiniprogram.Input): void;
  onSellInput(e: WechatMiniprogram.Input): void;
  onAreaInput(e: WechatMiniprogram.Input): void;
  onBuyAssessedInput(e: WechatMiniprogram.Input): void;
  onSellAssessedInput(e: WechatMiniprogram.Input): void;
  onLoanInput(e: WechatMiniprogram.Input): void;
  onBuyInputLoanSync(): void;
  onRateInput(e: WechatMiniprogram.Input): void;
  onRenoInput(e: WechatMiniprogram.Input): void;
  onQuotaInput(e: WechatMiniprogram.Input): void;
  onExtraInput(e: WechatMiniprogram.Input): void;
  onBuyCommRateInput(e: WechatMiniprogram.Input): void;
  onSellCommRateInput(e: WechatMiniprogram.Input): void;
  onHoldInput(e: WechatMiniprogram.SliderChange): void;
  onHoldChipTap(e: WechatMiniprogram.BaseEvent): void;
  onSegFam(e: WechatMiniprogram.BaseEvent): void;
  onSegVat(e: WechatMiniprogram.BaseEvent): void;
  onSegPit(e: WechatMiniprogram.BaseEvent): void;
  onSoleChange(e: WechatMiniprogram.SwitchChange): void;
  onBuyUnder2Change(e: WechatMiniprogram.SwitchChange): void;
  onReset(): void;
  onCopy(): void;
  onGoLogin(): void;
  /** 非法 token（aud 缺失）时清 token：与 profile 页 clearTokensAndReset 同口径（保留协议标识）. */
  clearTokens(): void;
}

/** bindinput 事件统一取值（WechatMiniprogram.Input 的 detail 含 value）. */
function inputValue(e: WechatMiniprogram.Input): string {
  return e.detail.value;
}

/** 分段控件选项定义（dataset 值与 HTML data-v 一致）. */
const SEG_FAM_DEFS: { v: FamKey; label: string }[] = [
  { v: "sole", label: "唯一" },
  { v: "second", label: "第 2 套" },
  { v: "three", label: "≥3 套" },
];
const SEG_VAT_DEFS: { v: VatRate; label: string }[] = [
  { v: "0.0318", label: "3.18% 标准" },
  { v: "0.0315", label: "3.15% 城镇" },
];
const SEG_PIT_DEFS: { v: PitMethod; label: string }[] = [
  { v: "auto", label: "自动取低" },
  { v: "r1", label: "全额 1%" },
  { v: "p20", label: "差额 20%" },
  { v: "fa", label: "法拍 3%" },
];
const HOLD_CHIP_LABELS: Record<number, string> = {
  6: "6 月",
  12: "12 月",
  24: "24 月",
  36: "36 月",
  60: "60 月",
  84: "84 月",
};

/** 已选分段控件视图. */
function segOptions<T extends string>(defs: { v: T; label: string }[], on: T): SegOptionView[] {
  return defs.map((d) => ({ v: d.v, label: d.label, on: d.v === on }));
}

/** 从分段控件视图取当前选中值（等价 HTML segV()）. */
function segSelected(options: SegOptionView[]): string {
  return (options.find((o) => o.on) ?? options[0]).v;
}

/** 滑杆填充百分比（HTML fill()）. */
function holdPctOf(months: number): number {
  return Number(((months / HOLD_MAX) * 100).toFixed(1));
}

/**
 * 初始 data（静态字段）.
 *
 * CalcResult 计算结果字段由 onLoad 的 recalc() 全量填充（首帧渲染前即完成），
 * 故初始仅需门禁/输入回显/控件状态等静态字段.
 */
function initialData(): Omit<InvestCalcView, keyof CalcResult> {
  return {
    /* ── 门禁 ── */
    gate: false,
    loggedIn: false,

    /* ── 顶栏 / hero ── */
    eyebrow: TAX_POLICY_LABEL,

    /* ── 输入回显（HTML 默认值） ── */
    buy: "600",
    sell: "750",
    area: "89",
    buyAssessed: "",
    sellAssessed: "",
    loan: "480",
    rate: "3.05",
    reno: "0",
    quota: "",
    extra: "0",
    buyCommRate: "1",
    sellCommRate: "1",

    /* ── 控件状态 ── */
    months: 30,
    holdPct: holdPctOf(30),
    hold: { m: "30", y: "2 年 6 个月" },
    holdTip: "拖动滑杆即可联动利息与增值税判定",
    holdChips: [6, 12, 24, 36, 60, 84].map((m) => ({ m, label: HOLD_CHIP_LABELS[m], on: false })),
    segFam: segOptions(SEG_FAM_DEFS, "sole"),
    segVat: segOptions(SEG_VAT_DEFS, "0.0318"),
    segPit: segOptions(SEG_PIT_DEFS, "auto"),
    sole: true,
    buyUnder2: false,

    /* ── 结果卡（初始渲染由 recalc 覆盖） ── */
    profit: "0.00",
    profitNeg: false,
    note: "—",
    chipInvest: "0.00 万",
    chipTax: "0.00 万",
    chipMargin: "0.0%",
    chipAnnual: "0.0%",

    /* ── 资金卡 ── */
    interestText: "0.00 万",
    interestCap: "—",

    /* ── 增值税卡 ── */
    vatStateOk: false,
    vatChip: "不满 2 年 · 自动征收",
    vatAmt: "0.00 万",
    vatCap: "—",
    vatHintCls: "hintline",
    vatHint: "—",

    /* ── 个税卡 ── */
    pitStateOk: false,
    pitChip: "自动取低",
    pitAmt: "0.00 万",
    pitCap: "—",
    pitHintCls: "hintline",
    pitHint: "—",

    /* ── 契税卡 ── */
    deedChip: "1.0%",
    deedAmt: "0.00 万",
    deedCap: "—",

    /* ── 其他费用卡 ── */
    buyCommTag: "1%",
    sellCommTag: "1%",
    bBuyComm: "0.00 万",
    bSellComm: "0.00 万",

    /* ── 成本总览卡 ── */
    showBuyVat: false,
    bDeed: "0.00",
    bBuyVat: "0.00",
    bBuyComm2: "0.00",
    bSellComm2: "0.00",
    bQuota: "0.00",
    bReno: "0.00",
    bExtra: "0.00",
    bInterest: "0.00",
    bVat: "0.00",
    bPit: "0.00",
    fDeed: "—",
    fBuyVat: "—",
    fBuyComm: "—",
    fInterest: "—",
    fVat: "—",
    fPit: "—",
    fSellComm: "—",
    tTax: "0.00",
    tCost: "0.00",
    fTax: "—",
    fCost: "—",

    /* ── 底部栏 ── */
    dockProfit: "0.00 万",
    copyDone: false,
  };
}

Page<InvestCalcView, PageCustom>({
  // CalcResult 计算字段由 onLoad 首个 recalc() 同步填充（门禁未通过时 WXML 也不渲染主区）
  data: initialData() as unknown as InvestCalcView,

  /* 贷款金额默认联动买进价 80%（手动修改后不再联动，等价 HTML loanAuto）. */
  loanAuto: true,
  /* 「已复制 ✓」提示复原计时器. */
  copyTimer: null as ReturnType<typeof setTimeout> | null,

  onLoad() {
    this.loadGate();
    this.recalc();
  },

  onUnload() {
    if (this.copyTimer) {
      clearTimeout(this.copyTimer);
      this.copyTimer = null;
    }
  },

  async loadGate() {
    const token = getAccessToken();
    const cToken = getCAccessToken();
    // 无任何令牌 → 未登录
    if (!token && !cToken) {
      this.setData({ gate: false, loggedIn: false });
      return;
    }
    try {
      // request.ts 对 /public/* 自动注入 C 端令牌（内部员工持双令牌时亦按 C 端受众放行）
      const me = await request<PublicUserInfo>({ url: "/public/auth/me" });
      const hasPhone = !!me.phone;
      this.setData({ gate: hasPhone, loggedIn: true });
    } catch {
      // 401 已由 request 层自动刷新重试；仍失败（身份失效/网络异常）→ 按未登录展示登录引导
      this.setData({ gate: false, loggedIn: false });
    }
  },

  /** 从当前表单状态构造 CalcInput（口径与 HTML recalc 读取阶段一致）. */
  buildInput(): CalcInput {
    const d = this.data;
    return {
      buy: toNum(d.buy),
      sell: toNum(d.sell),
      months: parseInt(String(d.months), 10) || 0,
      area: toNum(d.area),
      buyAssessed: toNum(d.buyAssessed),
      sellAssessed: toNum(d.sellAssessed),
      fam: segSelected(d.segFam) as FamKey,
      vatRate: segSelected(d.segVat) as VatRate,
      pitMethod: segSelected(d.segPit) as PitMethod,
      sole: d.sole,
      buyUnder2: d.buyUnder2,
      loan: toNum(d.loan),
      rate: toNum(d.rate),
      reno: toNum(d.reno),
      quota: toNum(d.quota),
      extra: toNum(d.extra),
      buyCommRate: toNum(d.buyCommRate),
      sellCommRate: toNum(d.sellCommRate),
    };
  },

  /** 全量渲染：HTML recalc() 渲染段的等价实现（全部预格式化进 data）. */
  recalc() {
    const input = this.buildInput();
    const r = calc(input);
    const months = input.months;
    const area = input.area;
    const patch: Partial<InvestCalcView> = {};

    /* —— 渲染：持有（HTML 持有时间段） —— */
    const y = Math.floor(months / 12);
    const m = months % 12;
    const hold: HoldView = {
      m: String(months),
      y: months >= 12 ? (m === 0 ? `${y} 年整` : `${y} 年 ${m} 个月`) : "不满 1 年",
    };
    patch.months = months;
    patch.holdPct = holdPctOf(months);
    patch.hold = hold;
    patch.holdChips = this.data.holdChips.map((c) => ({ ...c, on: c.m === months }));
    patch.holdTip =
      months < 24
        ? `增值税：再持有 ${24 - months} 个月满 2 年即自动免征`
        : months < 60
          ? `个税：再持有 ${60 - months} 个月满 5 年，且保持唯一可免征`
          : "已满 5 年：唯一住房个税免征，增值税亦免征";

    /* —— 渲染：增值税（HTML 增值税段） —— */
    const vatStateOk = months >= 24;
    patch.vatStateOk = vatStateOk;
    if (!vatStateOk) {
      patch.vatChip = "不满 2 年 · 自动征收";
      patch.vatAmt = `${fw(r.sellVat)} 万`;
      patch.vatCap = `计税：核定 ${fw(r.aSell)} ÷ 1.03 × ${(parseFloat(input.vatRate) * 100).toFixed(2)}%（含附加）`;
      patch.vatHintCls = "hintline";
      patch.vatHint = `持有 ${months} 个月，未满 2 年，须缴纳增值税及附加`;
    } else {
      patch.vatChip = "满 2 年 · 免征";
      patch.vatAmt = "0.00 万";
      patch.vatCap = "持有满 2 年，增值税及附加免征";
      patch.vatHintCls = "hintline mut";
      patch.vatHint = "已满 2 年，免征自动生效";
    }

    /* —— 渲染：个税（HTML 个税段） —— */
    const pitStateOk = r.exempt;
    patch.pitStateOk = pitStateOk;
    if (r.exempt) {
      patch.pitChip = "满五唯一 · 免征";
      patch.pitAmt = "0.00 万";
      patch.pitCap = `持有 ${months} 个月（满 5 年）且家庭唯一，免征个人所得税`;
    } else {
      patch.pitChip =
        (r.full5 ? "满五不唯一 · " : "") + (input.pitMethod === "auto" ? `自动取低 · ${r.pitLabel}` : r.pitLabel);
      patch.pitAmt = `${fw(r.pit)} 万`;
      if (input.pitMethod === "auto") {
        const deduct = `原值 ${fw(r.aBuy)}${r.buyVat ? ` − 买入增值税 ${fw(r.buyVat)}` : ""} − 装修 ${fw(input.reno)}`;
        patch.pitCap =
          `全额：(${fw(r.aSell)} − 增值税 ${fw(r.sellVat)}) × 1% = ${fw(r.pitFull)} 万 ｜ 差额：(${fw(r.aSell)} − 增值税 ${fw(r.sellVat)} − ${deduct}) × 20% = ${fw(r.pitDiff)} 万 → 取低按${r.pitLabel}计` +
          (r.pitBase20 <= 0 ? "，无增值按 0 计" : "");
      } else if (input.pitMethod === "r1") {
        patch.pitCap = `计税：全额（核定）：(核定 ${fw(r.aSell)} − 增值税 ${fw(r.sellVat)}) × 1%`;
      } else if (input.pitMethod === "p20") {
        patch.pitCap =
          `计税：差额：(核定 ${fw(r.aSell)} − 增值税 ${fw(r.sellVat)} − 原值 ${fw(r.aBuy)}${r.buyVat ? ` − 买入增值税 ${fw(r.buyVat)}` : ""} − 装修 ${fw(input.reno)}) × 20%` +
          (r.pitBase20 <= 0 ? "，现无增值按 0 计" : "");
      } else {
        patch.pitCap = `计税：(核定 ${fw(r.aSell)} − 增值税 ${fw(r.sellVat)}) × 3%（法拍房）`;
      }
    }
    patch.pitHintCls = !r.full5 && input.sole ? "hintline" : "hintline mut";
    patch.pitHint = !r.full5 && input.sole
      ? `距离满五唯一免征还差 ${60 - months} 个月（保持家庭唯一）`
      : r.exempt
        ? "当前满足免征条件"
        : "未满足免征条件（需满 5 年且唯一）";

    /* —— 渲染：契税（HTML 契税段） —— */
    const famTxt = { sole: "家庭唯一住房", second: "家庭第 2 套住房", three: "家庭 ≥3 套 / 企业购房" }[input.fam];
    patch.deedChip = `${(r.deedRate * 100).toFixed(1)}%`;
    patch.deedAmt = `${fw(r.deed)} 万`;
    patch.deedCap =
      `${famTxt}，按面积 ${area > 140 ? ">140㎡" : "≤140㎡"} 套档 · 计税：买入核定 ${fw(r.deedBase)}${r.buyVat ? `（已扣买入增值税 ${fw(r.buyVat)}）` : ""} × ${(r.deedRate * 100).toFixed(1)}%`;

    /* —— 渲染：利息（HTML 利息段） —— */
    patch.interestText = `${fw(r.interest)} 万`;
    patch.interestCap = `${fw(input.loan)} 万 × 年化 ${((input.rate / 100) * 100).toFixed(2)}% × ${(months / 12).toFixed(1)} 年（简单利息估算）`;

    /* —— 渲染：总览结算过程（HTML 总览段） —— */
    const vrTxt = `${(parseFloat(input.vatRate) * 100).toFixed(2)}%`;
    const bcTxt = `${toNum(input.buyCommRate)}%`;
    const scTxt = `${toNum(input.sellCommRate)}%`;
    patch.buyCommTag = bcTxt;
    patch.sellCommTag = scTxt;
    patch.fDeed = `买入核定 ${fw(r.deedBase)}${r.buyVat ? `（已扣买入增值税 ${fw(r.buyVat)}）` : ""} × ${(r.deedRate * 100).toFixed(1)}% · ${famTxt} · ${area > 140 ? ">140㎡" : "≤140㎡"}`;
    patch.fBuyVat = `买入核定 ${fw(r.aBuy)} ÷ 1.03 × ${vrTxt}（含附加）`;
    patch.showBuyVat = r.buyVat > 0;
    patch.fBuyComm = `买进价 ${fw(input.buy)} × ${bcTxt}`;
    patch.fInterest = `${fw(input.loan)} 万 × 年化 ${((input.rate / 100) * 100).toFixed(2)}% × ${(months / 12).toFixed(1)} 年`;
    patch.fVat = months < 24 ? `卖出核定 ${fw(r.aSell)} ÷ 1.03 × ${vrTxt}（含附加）` : "持有满 2 年 · 免征";
    const fullF = `全额：(${fw(r.aSell)} − 增值税 ${fw(r.sellVat)}) × 1% = ${fw(r.pitFull)} 万`;
    const diffF = `差额：(${fw(r.aSell)} − 增值税 ${fw(r.sellVat)} − 原值 ${fw(r.aBuy)}${r.buyVat ? ` − 买入增值税 ${fw(r.buyVat)}` : ""} − 装修 ${fw(input.reno)}) × 20% = ${fw(r.pitDiff)} 万`;
    patch.fPit = r.exempt
      ? "满 5 年且家庭唯一 · 免征"
      : r.pitMode === "r1"
        ? fullF
        : r.pitMode === "p20"
          ? diffF
          : r.pitMode === "fa"
            ? `法拍：(${fw(r.aSell)} − 增值税 ${fw(r.sellVat)}) × 3% = ${fw(r.pit)} 万`
            : r.pitLabel === "差额 20%"
              ? diffF
              : r.pitLabel === "全额 1%"
                ? fullF
                : `${fullF} ｜ ${diffF}（两者相同）`;
    patch.fSellComm = `卖出价 ${fw(input.sell)} × ${scTxt}`;
    patch.fTax = `增值税 ${fw(r.sellVat)}${r.buyVat ? ` + 买入增值税 ${fw(r.buyVat)}` : ""} + 契税 ${fw(r.deed)} + 个税 ${fw(r.pit)} = ${fw(r.taxTotal)} 万`;
    patch.fCost = `买进 ${fw(input.buy)} + 税费 ${fw(r.taxTotal)} + 佣金 ${fw(r.buyComm + r.sellComm)} + 名额 ${fw(input.quota)} + 装修 ${fw(input.reno)}${input.extra ? ` + 额外 ${fw(input.extra)}` : ""} + 利息 ${fw(r.interest)} = ${fw(r.costTotal)} 万`;

    /* —— 渲染：结果与总览（HTML 结果段） —— */
    patch.profit = (r.net < 0 ? "−" : "") + fw(Math.abs(r.net));
    patch.profitNeg = r.net < 0;
    patch.note = `毛利 ${fw(r.gross)} 万（未扣税） · 利息 ${fw(r.interest)} 万`;
    patch.chipInvest = `${fw(r.invest)} 万`;
    patch.chipTax = `${fw(r.taxTotal)} 万`;
    patch.chipMargin = `${r.margin.toFixed(1)}%`;
    patch.chipAnnual = `${r.annual.toFixed(1)}%`;
    patch.dockProfit = (r.net < 0 ? "−" : "") + fw(Math.abs(r.net)) + " 万";

    patch.bDeed = fw(r.deed);
    patch.bBuyVat = fw(r.buyVat);
    patch.bBuyComm = `${fw(r.buyComm)} 万`;
    patch.bBuyComm2 = fw(r.buyComm);
    patch.bSellComm = `${fw(r.sellComm)} 万`;
    patch.bSellComm2 = fw(r.sellComm);
    patch.bQuota = fw(input.quota);
    patch.bReno = fw(input.reno);
    patch.bExtra = fw(input.extra);
    patch.bInterest = fw(r.interest);
    patch.bVat = fw(r.sellVat);
    patch.bPit = fw(r.pit);
    patch.tTax = fw(r.taxTotal);
    patch.tCost = fw(r.costTotal);

    this.setData(patch as Partial<InvestCalcView> & Record<string, unknown>);
  },

  /* ── 文本输入：同步 data 后重算 ── */

  onBuyInput(e: WechatMiniprogram.Input) {
    this.setData({ buy: inputValue(e) });
    this.onBuyInputLoanSync();
    this.recalc();
  },

  onSellInput(e: WechatMiniprogram.Input) {
    this.setData({ sell: inputValue(e) });
    this.recalc();
  },

  onAreaInput(e: WechatMiniprogram.Input) {
    this.setData({ area: inputValue(e) });
    this.recalc();
  },

  onBuyAssessedInput(e: WechatMiniprogram.Input) {
    this.setData({ buyAssessed: inputValue(e) });
    this.recalc();
  },

  onSellAssessedInput(e: WechatMiniprogram.Input) {
    this.setData({ sellAssessed: inputValue(e) });
    this.recalc();
  },

  onLoanInput(e: WechatMiniprogram.Input) {
    // 手动修改贷款金额后，不再随买进价自动联动（等价 HTML loanAuto=false）
    this.loanAuto = false;
    this.setData({ loan: inputValue(e) });
    this.recalc();
  },

  onBuyInputLoanSync() {
    if (this.loanAuto) {
      this.setData({ loan: String(Number((toNum(this.data.buy) * 0.8).toFixed(2))) });
    }
  },

  onRateInput(e: WechatMiniprogram.Input) {
    this.setData({ rate: inputValue(e) });
    this.recalc();
  },

  onRenoInput(e: WechatMiniprogram.Input) {
    this.setData({ reno: inputValue(e) });
    this.recalc();
  },

  onQuotaInput(e: WechatMiniprogram.Input) {
    this.setData({ quota: inputValue(e) });
    this.recalc();
  },

  onExtraInput(e: WechatMiniprogram.Input) {
    this.setData({ extra: inputValue(e) });
    this.recalc();
  },

  onBuyCommRateInput(e: WechatMiniprogram.Input) {
    this.setData({ buyCommRate: inputValue(e) });
    this.recalc();
  },

  onSellCommRateInput(e: WechatMiniprogram.Input) {
    this.setData({ sellCommRate: inputValue(e) });
    this.recalc();
  },

  /* ── 持有时间：滑杆 / 快捷片 三向同步 ── */

  onHoldInput(e: WechatMiniprogram.SliderChange) {
    const months = typeof e.detail.value === "number" ? e.detail.value : Number(e.detail.value);
    this.setData({ months });
    this.recalc();
  },

  onHoldChipTap(e: WechatMiniprogram.BaseEvent) {
    const months = Number((e.currentTarget.dataset as { m: number }).m);
    this.setData({ months });
    this.recalc();
  },

  /* ── 分段控件（HTML seg 点击分发） ── */

  onSegFam(e: WechatMiniprogram.BaseEvent) {
    const v = (e.currentTarget.dataset as { v: string }).v;
    this.setData({ segFam: segOptions(SEG_FAM_DEFS, v as FamKey) });
    this.recalc();
  },

  onSegVat(e: WechatMiniprogram.BaseEvent) {
    const v = (e.currentTarget.dataset as { v: string }).v;
    this.setData({ segVat: segOptions(SEG_VAT_DEFS, v as VatRate) });
    this.recalc();
  },

  onSegPit(e: WechatMiniprogram.BaseEvent) {
    const v = (e.currentTarget.dataset as { v: string }).v;
    this.setData({ segPit: segOptions(SEG_PIT_DEFS, v as PitMethod) });
    this.recalc();
  },

  /* ── 开关 ── */

  onSoleChange(e: WechatMiniprogram.SwitchChange) {
    this.setData({ sole: e.detail.value });
    this.recalc();
  },

  onBuyUnder2Change(e: WechatMiniprogram.SwitchChange) {
    this.setData({ buyUnder2: e.detail.value });
    this.recalc();
  },

  /* ── 重置（HTML btnReset 同款默认值与控件复位） ── */

  onReset() {
    this.loanAuto = true;
    this.setData({
      buy: "600",
      sell: "750",
      months: 30,
      area: "89",
      rate: "3.05",
      reno: "0",
      quota: "",
      extra: "0",
      loan: "480",
      buyCommRate: "1",
      sellCommRate: "1",
      buyAssessed: "",
      sellAssessed: "",
      sole: true,
      buyUnder2: false,
      segFam: segOptions(SEG_FAM_DEFS, "sole"),
      segVat: segOptions(SEG_VAT_DEFS, "0.0318"),
      segPit: segOptions(SEG_PIT_DEFS, "auto"),
    });
    this.recalc();
    wx.pageScrollTo({ scrollTop: 0, duration: 300 });
  },

  /* ── 复制结果（HTML btnCopy 同款文案） ── */

  onCopy() {
    if (this.data.copyDone) {
      return;
    }
    const input = this.buildInput();
    const r: CalcResult = calc(input);
    const txt = buildCopyText(
      input,
      r,
      `${toNum(input.buyCommRate)}%`,
      `${toNum(input.sellCommRate)}%`,
    );
    wx.setClipboardData({
      data: txt,
      success: () => {
        // 微信会自带「内容已复制」toast，这里按 HTML 交互在按钮上展示「已复制 ✓」
        this.setData({ copyDone: true });
        if (this.copyTimer) {
          clearTimeout(this.copyTimer);
        }
        this.copyTimer = setTimeout(() => {
          this.copyTimer = null;
          this.setData({ copyDone: false });
        }, 1600);
      },
    });
  },

  /* ── 门禁未通过 → 登录引导 ── */

  onGoLogin() {
    wx.navigateTo({ url: "/pages/login/index/index" });
  },

  clearTokens() {
    wx.removeStorageSync("access_token");
    wx.removeStorageSync("refresh_token");
    wx.removeStorageSync("c_access_token");
    wx.removeStorageSync("c_refresh_token");
  },
});
