/**
 * 贷款计算器 · 纯计算函数（无 wx 依赖，可 vitest 直测）.
 *
 * 口径对齐 docs/2026-10-02-贷款计算器-spec.md（K2~K6）：
 * - 默认口径：首套 · 纯商贷 · 首付 15%（政策下限）· 30 年 · LPR 3.5% − 45bp = 3.05% · 等额本息；
 * - 公积金首套 5 年期以上利率 2.60% 固定（2026 上海政策 20260901 版，本期不开放编辑）；
 * - 首付下限：商贷 15% / 公积金·组合贷 20%，上限 80%；
 * - 金额以「元」精确计算，万元仅作展示单位（万元 1 位小数、元四舍五入）。
 */

/** 贷款方式：纯商贷 / 纯公积金 / 组合贷. */
export type LoanMode = "comm" | "fund" | "combo";

/** 还款方式：等额本息 / 等额本金. */
export type RepayMethod = "axi" | "prin";

/** 计算器可调参数. */
export interface LoanParams {
  mode: LoanMode;
  /** 首付比例 %（15~80）. */
  downPct: number;
  /** 贷款年限（年，10/15/20/25/30）. */
  years: number;
  /** 5 年期以上 LPR 基准 %（2~6）. */
  lpr: number;
  /** 加点 bp（−100~+100）. */
  bp: number;
  /** 组合贷公积金贷款额（万元，10~500）. */
  fundAmt: number;
  method: RepayMethod;
}

/** 还款计划单期明细（金额均为「元」）. */
export interface LoanScheduleRow {
  /** 当期月供. */
  pay: number;
  /** 当期本金. */
  pri: number;
  /** 当期利息. */
  int: number;
  /** 期后剩余本金. */
  bal: number;
}

/** 贷款计算结果（金额：元；万元仅展示）. */
export interface LoanResult {
  /** 首付款（万元）. */
  downWan: number;
  /** 贷款总额（万元）. */
  loanWan: number;
  /** 首月月供（元）；等额本息恒为首末一致. */
  first: number;
  /** 末月月供（元）；等额本息与首月一致. */
  last: number;
  /** 等额本金每月递减额（元）；等额本息为 0. */
  dec: number;
  /** 支付利息总额（元）. */
  interestYuan: number;
  /** 结果卡展示的执行利率 %（fund 模式 = 公积金利率）. */
  execRate: number;
  /** 商贷执行利率 %（lpr + bp/100）. */
  commRate: number;
  /** 逐期还款计划（组合贷为两部分按期合并）. */
  rows: LoanScheduleRow[];
}

/** 默认口径（设计稿 ARTBOARD 01/02 一致）. */
export const LOAN_DEFAULTS: LoanParams = {
  mode: "comm",
  downPct: 15,
  years: 30,
  lpr: 3.5,
  bp: -45,
  fundAmt: 100,
  method: "axi",
};

/** 公积金首套 5 年期以上利率 %（政策固定，本期不开放编辑）. */
export const FUND_RATE = 2.6;

/** 首付比例下限 %（商贷 15 / 公积金·组合贷 20）. */
export const DOWN_MIN: Record<LoanMode, number> = { comm: 15, fund: 20, combo: 20 };

/** 首付比例上限 %. */
export const DOWN_MAX = 80;

/** 砍价期望总价上限（万元，与设计稿 v1.3 bargain-ok 校验一致）. */
export const BARGAIN_MAX_WAN = 9999;

/** 年限可选档（年）. */
export const LOAN_YEARS = [10, 15, 20, 25, 30] as const;

/** 还款方式说明文案. */
export const METHOD_DESC: Record<RepayMethod, string> = {
  axi: "每月还款额固定，前期利息占比高",
  prin: "每月归还固定本金，月供逐月递减，前期还款压力较大",
};

/** 贷款方式中文名. */
export const MODE_NAME: Record<LoanMode, string> = {
  comm: "纯商贷",
  fund: "纯公积金",
  combo: "组合贷",
};

/** 还款方式中文名. */
export const METHOD_NAME: Record<RepayMethod, string> = {
  axi: "等额本息",
  prin: "等额本金",
};

/** 首付下限提示文案. */
export const DOWN_NOTE: Record<LoanMode, string> = {
  comm: "首套纯商贷首付不低于 15%",
  fund: "公积金贷款首付不低于 20%",
  combo: "组合贷首付不低于 20%",
};

/** 逐期推演单一利率部分（等额本息/等额本金），返回首末月供、递减额、总利息与明细. */
function buildSchedule(P: number, annualRatePct: number, months: number, method: RepayMethod): {
  rows: LoanScheduleRow[];
  first: number;
  last: number;
  dec: number;
  totalInt: number;
} {
  if (P <= 0 || months <= 0) {
    return { rows: [], first: 0, last: 0, dec: 0, totalInt: 0 };
  }
  const r = annualRatePct / 100 / 12;
  const rows: LoanScheduleRow[] = [];
  let bal = P;
  let totalInt = 0;
  let first = 0;
  let last = 0;
  let dec = 0;

  if (method === "axi") {
    const f = Math.pow(1 + r, months);
    const M = r === 0 ? P / months : (P * r * f) / (f - 1);
    first = M;
    last = M;
    for (let k = 1; k <= months; k++) {
      const it = bal * r;
      const pri = M - it;
      bal = Math.max(bal - pri, 0);
      totalInt += it;
      rows.push({ pay: M, pri, int: it, bal });
    }
  } else {
    const priC = P / months;
    dec = priC * r;
    for (let k = 1; k <= months; k++) {
      const it = bal * r;
      const pay = priC + it;
      if (k === 1) {
        first = pay;
      }
      last = pay;
      bal = Math.max(bal - priC, 0);
      totalInt += it;
      rows.push({ pay, pri: priC, int: it, bal });
    }
  }
  return { rows, first, last, dec, totalInt };
}

/**
 * 贷款计算主入口：按总价（万元）与参数求首付/月供/利息/逐期明细.
 * priceWan ≤ 0 或参数非法时返回全零结果（rows 为空数组）.
 */
export function calcLoan(priceWan: number, p: LoanParams): LoanResult {
  if (!Number.isFinite(priceWan) || priceWan <= 0 || !Number.isFinite(p.years) || p.years <= 0) {
    return {
      downWan: 0, loanWan: 0, first: 0, last: 0, dec: 0,
      interestYuan: 0, execRate: 0, commRate: 0, rows: [],
    };
  }
  const downWan = (priceWan * p.downPct) / 100;
  const loanWan = priceWan - downWan;
  const commRate = p.lpr + p.bp / 100;
  let execRate = commRate;
  const parts: { P: number; rate: number }[] = [];

  if (p.mode === "comm") {
    parts.push({ P: loanWan * 10000, rate: commRate });
  } else if (p.mode === "fund") {
    execRate = FUND_RATE;
    parts.push({ P: loanWan * 10000, rate: FUND_RATE });
  } else {
    const fundPart = Math.min(p.fundAmt, loanWan);
    const commPart = loanWan - fundPart;
    if (commPart > 0) {
      parts.push({ P: commPart * 10000, rate: commRate });
    }
    if (fundPart > 0) {
      parts.push({ P: fundPart * 10000, rate: FUND_RATE });
    }
  }

  const months = p.years * 12;
  let rows: LoanScheduleRow[] | null = null;
  let totalInt = 0;
  let first = 0;
  let last = 0;
  let dec = 0;
  for (const pt of parts) {
    const s = buildSchedule(pt.P, pt.rate, months, p.method);
    totalInt += s.totalInt;
    first += s.first;
    last += s.last;
    dec += s.dec;
    if (rows === null) {
      rows = s.rows;
    } else {
      // 组合贷：两部分按期合并（期数一致，逐项相加）
      for (let i = 0; i < s.rows.length; i++) {
        rows[i].pay += s.rows[i].pay;
        rows[i].pri += s.rows[i].pri;
        rows[i].int += s.rows[i].int;
        rows[i].bal += s.rows[i].bal;
      }
    }
  }
  return {
    downWan,
    loanWan,
    first,
    last,
    dec,
    interestYuan: totalInt,
    execRate,
    commRate,
    rows: rows ?? [],
  };
}

/** 首付比例钳制：不高于上限、不低于当前方式政策下限. */
export function clampDownPct(pct: number, mode: LoanMode): number {
  return Math.max(DOWN_MIN[mode], Math.min(DOWN_MAX, pct));
}

/** LPR 步进 ±0.05%，钳 2~6（两位小数防浮点尾差）. */
export function stepLpr(v: number, dir: number): number {
  return Math.round(Math.min(6, Math.max(2, v + dir * 0.05)) * 100) / 100;
}

/** 加点步进 ±5bp，钳 −100~+100. */
export function stepBp(v: number, dir: number): number {
  return Math.min(100, Math.max(-100, v + dir * 5));
}

/** 公积金额度步进 ±5 万，钳 10~500（万元）. */
export function stepFundAmt(v: number, dir: number): number {
  return Math.min(500, Math.max(10, v + dir * 5));
}

/** 万元 → 1 位小数字符串（去尾零，如 "72.9" / "100"）. */
export function fmtWan1(x: number): string {
  return String(Number(x.toFixed(1)));
}

/** 百分比 → 展示串：非整数保留最多 2 位小数去尾零（32.258…→"32.26"，15→"15"）. */
export function fmtPct2(x: number): string {
  return String(Number(x.toFixed(2)));
}

/** 元 → 四舍五入千分位字符串（如 "17,528"）. */
export function fmtYuanInt(x: number): string {
  return Math.round(x).toLocaleString("en-US");
}

/** 加点 → 带符号字符串（正 +N / 负 −N / 零 "0"，负号用 U+2212 与设计稿一致）. */
export function fmtBp(v: number): string {
  return (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v);
}

/**
 * 砍价输入解析（spec K10）：合法范围 (0, 9999] 万，支持小数；非法返回 null.
 * 空串 / 非数字 / ≤0 / >9999 均视为非法.
 */
export function parseBargainInput(raw: string): number | null {
  const v = Number(raw);
  if (!Number.isFinite(v) || v <= 0 || v > BARGAIN_MAX_WAN) {
    return null;
  }
  return v;
}

/** 自定义首付金额上限（万元）按总价上限估计；实际以 eff 价格 × DOWN_MAX 为准（spec K12）. */
export function downAmountBounds(priceWan: number, mode: LoanMode): { min: number; max: number } {
  return { min: (priceWan * DOWN_MIN[mode]) / 100, max: (priceWan * DOWN_MAX) / 100 };
}

/**
 * 自定义首付金额 → 首付比例（%）：保留 9 位小数全精度（toFixed(9) 兼清洗浮点尾差，
 * 首付金额还原误差远小于 1 元，保证「手填 80 万即贷总价−80 万」的业务实操），
 * 并按 mode 钳下限/上限（spec K12；比例取整会导致首付金额偏差，已废弃）.
 */
export function downAmountToPct(amountWan: number, priceWan: number, mode: LoanMode): number {
  return clampDownPct(Number(((amountWan / priceWan) * 100).toFixed(9)), mode);
}
