/**
 * 购房模拟器 · 计算纯函数（可单测）.
 *
 * 涵盖：金额格式化、等额本息月供、税费/首付/口径汇总（derive/money）、贷款分摊（iloan）、
 * 限购问答树（buildQA/judgeQA）、多轮砍价（NEGO_R1/nego2Options）、经历周期时间线
 * （stageDays/expDays/elapsed）、签约清单埋雷结算（settleMines/lossRows）。
 * 全部函数只依赖入参（SimState 就地修改），不触碰 wx/系统 API，便于 vitest 单测。
 *
 * 金额口径：全部以「元/分」精确计算，万元仅作展示单位（fmt/fmtY）。
 * 政策口径（2026 上海，见设计稿「政策口径」一节）：
 *  - 限购：沪籍（含成年单身按居民家庭）外环外不限套数 / 外环内限购 2 套；
 *    非沪籍社保·个税满 1 年 → 外环外不限、外环内 1 套，满 3 年 → 外环内 2 套；
 *    持居住证满 5 年 → 免社保/个税，全市限购 1 套。婚姻状况不再影响限购口径。
 *  - 二套商贷最低首付：外环内 25% / 外环外 15%（组合贷与公积金 20%）。
 *  - 卖方税费：增值税满 2 年免征（不满 2 年全额 5% + 附加 12%）；
 *    个税——买卖所得满五唯一免征、否则核定 1%；继承 / 赠与所得满五唯一免征、
 *    否则按（转让价 − 原值）× 20% 计。
 *
 * ⚠️ 单文件 >500 行说明：本模块承载同一策略域（税费/贷款/限购/砍价/时间线）的全部纯计算
 * 函数，聚拢便于按政策表逐条对照与单测；数据配置见 constants.ts，流程文案见 flow.ts，
 * 场景视图见 scenes*.ts。
 */

import { downRateFor, GJJ_CAP_FIRST, GJJ_CAP_SECOND, INCOME } from "./constants";
import type { House, Lesson, SceneKey, SimState } from "./constants";
import { BORROW_CAP, metaOf, REAL_MAX, REAL_MIN, SIGN_ITEMS } from "./flow";
import type { ScreenMeta } from "./flow";

/**
 * 元 → 万元字符串（保留 2 位小数，如 380.00）.
 * 对齐线下实付口径：金额全部以「元/分」精确计算，万元仅作展示单位。
 */
export function fmt(v: number): string {
  return (v / 10000).toFixed(2);
}

/** 万元带 ¥ 前缀（如 ¥200.00万）. */
export function fmtY(v: number): string {
  return "¥" + fmt(v) + "万";
}

/** 元 → 千分位字符串，保留 2 位小数（如 3,800,000.00，用于月供/登记费等「元」口径金额）. */
export function fmtYuan(v: number): string {
  const cents = Math.round(v * 100) / 100;
  return cents.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** 元 → 千分位整数字符串（如 8,000，用于装修增项/返工等小额「元」口径展示）. */
export function fmtN(v: number): string {
  return Math.round(v).toLocaleString("zh-CN");
}

/** 百分比显示：去掉尾零（2.6%、3.05%、3.075%），避免浮点舍入错显. */
export function pct(v: number): string {
  return (v * 100).toFixed(3).replace(/0+$/, "").replace(/\.$/, "") + "%";
}

/** 砍价折扣（如 9.4 折）. */
export function discountText(slash: number): string {
  return ((1 - (slash || 0)) * 10).toFixed(1) + " 折";
}

/** 压力 → 表情（装修阶段展示）. */
export function stressFace(s: number): string {
  return s < 25 ? "😌" : s < 50 ? "😐" : s < 75 ? "😰" : "😱";
}

/** 等额本息月供. */
export function pmt(P: number, annual: number, years: number): number {
  const r = annual / 12;
  const n = years * 12;
  if (r === 0) {
    return P / n;
  }
  const f = Math.pow(1 + r, n);
  return (P * r * f) / (f - 1);
}

/** 金额取整到分（避免浮点误差）. */
export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/* ============================ 房源与身份口径 ============================ */

/** 当前房源：自定义房源优先（选「自定义」时 house 已清空）. */
export function houseOf(S: SimState): House | null {
  return S.custom || S.house;
}

/** 家庭名下住房套数：置换 = 原房已售 → 0 套（按首套认定）；投资二套 = 1 套. */
export function ownedCount(S: SimState): number {
  return S.role && S.role.k === "invest" ? 1 : 0;
}

/**
 * 公积金家庭最高贷款额度（沪公积金管委会〔2026〕1号，自 2026-02-26 施行）：
 * 首套家庭 200 万 + 补充公积金 40 万 = 240 万；二套 160 万 + 40 万 = 200 万。
 * 套数按「家庭名下本市住房」认定：置换（原房已售）算首套。
 */
export function gjjCap(S: SimState): number {
  return ownedCount(S) === 0 ? GJJ_CAP_FIRST : GJJ_CAP_SECOND;
}

/**
 * 契税税率：按建筑面积与家庭套数推导（2024 契税新政）.
 * ≤140㎡ 1%；>140㎡ 首套 1.5% / 二套 2%——预设房源与自定义房源共用这一条，
 * 避免「同一套房换个身份进场，契税不变」的两套口径。
 */
export function deedRateOf(S: SimState): number {
  const area = S.areaNum || 0;
  if (area <= 140) {
    return 0.01;
  }
  return S.role && S.role.k === "invest" ? 0.02 : 0.015;
}

/** 卖方增值税（价内税口径）：未满 2 年全额 5% × 价内换算 + 附加 12%. */
export function sellerVatOf(h: House, price: number): number {
  if (h.hold === "new" || h.holdYears >= 2) {
    return 0;
  }
  return round2(price * 0.05 * 1.12);
}

/**
 * 卖方个税：买卖所得满五唯一免征、否则核定 1%；
 * 继承 / 赠与所得满五唯一免征、否则按（转让价 − 原值）× 20% 计.
 */
export function sellerIncomeTax(h: House, price: number): number {
  if (h.hold === "new") {
    return 0;
  }
  if (h.holdYears >= 5 && h.unique) {
    return 0;
  }
  if (h.acq === "inherit") {
    return round2(Math.max(0, price - (h.base || 0)) * 0.2);
  }
  return round2(price * 0.01);
}

/** 自定义房源默认口径（房款 450 万 · 90㎡ · 外环内 · 满五唯一 · 买卖取得 · 议价空间 5%）. */
export function defaultCustom(): House {
  return {
    id: "X", emoji: "📐", name: "自定义房源", area: "90㎡", price: 4500000,
    ring: "内", tag: "", tagCls: "badge-sky",
    holdYears: 5, unique: true, acq: "buy", base: 0,
    negotiable: 0.05,
    reno: "简装",
  };
}

/** 由「持有年限 × 是否唯一 × 取得方式」推导自定义房源的标签与税费口径（就地返回同一对象）. */
export function syncCustom(c: House): House {
  c.area = Math.round(parseFloat(c.area) || 0) + "㎡";
  const holdTxt = c.holdYears >= 5 ? "满五" : c.holdYears >= 2 ? "满二" : "不满 2 年";
  c.tag = c.holdYears < 2 ? "不满 2 年 · 全额增值税" : holdTxt + (c.unique ? "唯一" : "不唯一");
  if (c.acq === "inherit") {
    c.tag += " · 继承所得";
  }
  c.tagCls = c.holdYears < 2 ? "badge-hair" : c.holdYears >= 5 && c.unique ? "badge-sky" : "badge-fog";
  return c;
}

/* ============================ 税费 / 首付汇总 ============================ */

/**
 * 依房源 + 砍价比例重算全部衍生金额（税费逐项单列，首付含买方全部交易税费）.
 * 就地修改 S 的 deal/deposit/各项税费/down/need/gjjTopUp/利率，并触发 iloan.
 */
export function derive(S: SimState): void {
  const h = houseOf(S);
  if (!h || !S.role) {
    return;
  }
  const deal = round2(h.price * (1 - S.slash));
  S.deal = deal;
  S.deposit = round2(deal * 0.05);
  S.areaNum = h.areaNum || parseInt(h.area, 10) || 0;
  S.deedTax = round2(deal * deedRateOf(S));
  S.regFee = 80;
  S.agentFee = round2(deal * S.agentRate);
  /* 卖方税费：增值税（未满 2 年全额 5% + 附加）+ 个税（买卖核定 1% / 继承·赠与差额 20%） */
  S.vat = sellerVatOf(h, deal);
  S.vatAdd = round2(S.vat * 0.12);
  S.sellerTax = sellerIncomeTax(h, deal);
  /* 买方一次性税费 = 契税 + 登记费 + 中介费 */
  S.taxes = round2(S.deedTax + S.agentFee + S.regFee);
  /* 到手价：卖方税费（增值税+附加+个税）转嫁买方 */
  S.netTax = S.netDeal ? round2(S.vat + S.vatAdd + S.sellerTax) : 0;
  /* 房款首付：最低档（身份 × 环线 × 贷款方式）→ 用户加档 → 全款 1 */
  S.downRate = Math.max(downRateFor(S.role.k, h.ring, S.loanType), S.downSel || 0);
  S.down = round2(deal * S.downRate);
  /* 纯公积金额度上限（首套 240 万 / 二套 200 万，含补充公积金）：超出部分必须现金补足，并并入首付 */
  S.gjjTopUp = 0;
  if (S.loanType === "gjj") {
    const needLoan = round2(deal - S.down);
    if (needLoan > gjjCap(S)) {
      S.gjjTopUp = round2(needLoan - gjjCap(S));
      S.down = round2(S.down + S.gjjTopUp);
    }
  }
  S.need = round2(S.down + S.taxes + S.netTax);
  S.gjjRate = S.role.gjjRate;
  S.commRate = S.role.commRate;
  iloan(S);
}

/** 账目汇总（万元口径与各屏账单同源；单位：元）. */
export interface Money {
  /** 成交价. */
  deal: number;
  /** 房款首付（不含公积金额度补足）. */
  down: number;
  /** 首付现金 = 房款首付 + 额度补足（定金 + 先付 + 补足 三段之和）. */
  downCash: number;
  /** 纯公积金额度不足、必须现金补足的房款. */
  shortfall: number;
  deedTax: number;
  agentFee: number;
  /** 不动产登记费（元；S.regFee = 80 元/件）. */
  reg: number;
  /** 到手价转嫁的卖方税费（未答应则为 0）. */
  sellerTax: number;
  /** 该掏的房款与税费（不含学费）. */
  base: number;
  /** 首付需现金（含全部税费 + 到手价转嫁）. */
  need: number;
  /** 学费单合计（万元口径见 flow.SIGN_ITEMS）. */
  lessons: number;
  /** 实际掏的 = need + 学费. */
  total: number;
}

/** 账目汇总（与各屏账单/状态带钱条同口径）. */
export function money(S: SimState): Money {
  if (!S.deal) {
    return {
      deal: 0, down: 0, downCash: 0, shortfall: 0, deedTax: 0, agentFee: 0, reg: 80,
      sellerTax: 0, base: 0, need: 0, lessons: lessonCost(S), total: lessonCost(S),
    };
  }
  return {
    deal: S.deal,
    down: round2(S.deal * S.downRate),
    downCash: S.down,
    shortfall: S.gjjTopUp,
    deedTax: S.deedTax,
    agentFee: S.agentFee,
    reg: S.regFee,
    sellerTax: S.netTax,
    base: round2(S.down + S.taxes),
    need: S.need,
    lessons: lessonCost(S),
    total: round2(S.need + lessonCost(S)),
  };
}

/** 学费单合计（元）. */
export function lessonCost(S: SimState): number {
  return round2(S.lessons.reduce((a, b) => a + b.cost, 0));
}

/** 多花的清单 = 学费单 + 谈价答应的「到手价」（状态带与总账共用一套口径；cost 单位：元）. */
export function lossRows(S: SimState): Lesson[] {
  const rows = S.lessons.slice();
  if (S.netDeal && S.netTax > 0) {
    rows.unshift({
      k: "netprice", short: "「到手价」", stage: "成交 · 到手价", cost: round2(S.netTax), days: 0,
      src: "砍价时你答应的「到手价」",
      text: "卖方增值税 + 附加 + 个税整体转嫁给你，签约时这一句就锁定了。",
      fix: "谈价先问一句「含税还是到手」，再落价。",
    });
  }
  return rows;
}

/** 可动用现金（手头 + 已筹；已筹在筹钱屏已并入现金流）. */
export function avail(S: SimState): number {
  return S.cash;
}

/** 手头存款（可动用现金 − 已筹借款）. */
export function handCash(S: SimState): number {
  return round2(S.cash - S.borrowed);
}

/** 追加首付到 target 档要多掏多少（元，按实际首付档算）. */
export function addDownAmount(S: SimState, target: number): number {
  return round2(S.deal * target - S.deal * S.downRate);
}

/** 追加首付文案（首付提到 X%、多掏 Y 万）. */
export function addDownText(S: SimState, target: number): string {
  return "首付提到 " + (target * 100).toFixed(0) + "% · 多掏 " + fmt(addDownAmount(S, target)) + " 万";
}

/** 资金缺口（需现金 − 可动用现金）. */
export function gap(S: SimState): number {
  return Math.max(0, round2(money(S).need - S.cash));
}

/** 累计已出款（不含尾款扣押：那是从卖方房款中扣留，不占用买方现金）. */
export function paid(S: SimState): number {
  return S.paid;
}

/* ============================ 贷款 ============================ */

/** 纯公积金按家庭套数取上限（首套 240 万 / 二套 200 万）；其余方式不设上限. */
export function loanCap(S: SimState): number {
  return S.loanType === "gjj" ? gjjCap(S) : Infinity;
}

/** 实际可贷额 = min(房款 − 首付, 额度上限). */
export function loanPrincipal(S: SimState): number {
  return Math.max(0, Math.min(S.deal - S.deal * S.downRate, loanCap(S)));
}

/** 商贷利率（风控/月供试算口径：按身份二套上浮）. */
export function loanRate(S: SimState): number {
  return S.commRate;
}

/** 指定首付比例下的月供（风控阈值试算用）. */
export function monthlyOf(S: SimState, ratio?: number): number {
  const d = ratio === undefined ? S.downRate : ratio;
  const P = Math.max(0, Math.min(S.deal - S.deal * d, loanCap(S)));
  return pmt(P, loanRate(S), S.loanYears);
}

/** 月供是否越过风控线（月供 > 家庭月收入 50%）. */
export function overRisk(S: SimState): boolean {
  return monthlyOf(S) / INCOME > 0.5;
}

/** 追加首付到多少才能过风控线：取第一档达标值，最高全款（全款必然达标）. */
export function minDownToClear(S: SimState): number {
  const floor = downRateFor(S.role!.k, houseOf(S)!.ring, S.loanType);
  const list = [0.3, 0.5, 0.7, 1];
  for (const c of list) {
    const d = Math.max(c, floor);
    if (monthlyOf(S, d) / INCOME <= 0.5) {
      return d;
    }
  }
  return 1;
}

/**
 * 网签时应先付的首付部分（元，不含已付定金）：首付档位 ≥20% 先付 20% 房款，
 * <20%（如最低 15%）网签一次付清；全款按 30% 房款先付。
 * 贷款合同确认后补足 = down − deposit − firstPay（全款即补足剩余 65% 房款）——
 * 四段写死：定金 5% / 先付 / 补足 / 尾款，付款节点在一屏里看得见。
 */
export function firstPayFor(S: SimState): number {
  if (S.downRate >= 1) {
    return round2(S.deal * 0.3); /* 全款：网签先付 30% 房款，剩余在「全款 · 补足尾款」屏结清 */
  }
  const rate = Math.min(S.downRate, 0.2);
  return round2(Math.max(0, S.deal * rate - S.deposit));
}

/**
 * 贷款计算（利率按身份角色：首套公积金 2.6% / 商贷 3.05%；二套公积金 3.075% / 商贷 3.06%）.
 * 贷款额 = 成交价 − 房款首付；纯公积金 min(贷款, 80万)；组合贷 公积金 min(贷款×40%, 80万) + 商贷补足.
 */
export function iloan(S: SimState): void {
  const loan = Math.max(0, S.deal - S.down);
  const y = S.loanYears;
  if (S.loanType === "gjj") {
    const gjj = Math.min(loan, gjjCap(S));
    const m = pmt(gjj, S.gjjRate, y);
    S.loan = { gjj, comm: 0, monthly: m, totalInt: m * y * 12 - gjj };
    return;
  }
  if (S.loanType === "comm") {
    const m = pmt(loan, S.commRate, y);
    S.loan = { gjj: 0, comm: loan, monthly: m, totalInt: m * y * 12 - loan };
    return;
  }
  /* 组合贷：公积金 min(贷款×40%, 家庭上限) + 商贷（商贷不设上限，故组合贷不会出现「额度不足需现金补」） */
  const gjj = Math.min(loan * 0.4, gjjCap(S));
  const comm = loan - gjj;
  const mg = pmt(gjj, S.gjjRate, y);
  const mc = pmt(comm, S.commRate, y);
  S.loan = { gjj, comm, monthly: mg + mc, totalInt: (mg + mc) * y * 12 - loan };
}

/** 月供占家庭月收入比（风控口径，四舍五入到 %）. */
export function incomeRatio(S: SimState): number {
  return Math.round((S.loan.monthly / INCOME) * 100);
}

/* ============================ 经历周期（时间线）============================ */

/**
 * 本段的经历天数：从该段常规周期区间随机取一个数（同一次运行内固定、重开重抽）.
 * par 段（与相邻环节同期）照常取数、照常展示，但不累加进「已走 N 天」。
 */
export function stageDays(S: SimState, m: ScreenMeta): number {
  if (!m.days) {
    return 0;
  }
  const drawn = S.drawn[m.k];
  if (drawn === undefined) {
    const lo = m.days[0];
    const hi = m.days[1];
    const v = lo + Math.floor(Math.random() * (hi - lo + 1));
    S.drawn[m.k] = v;
    return v;
  }
  return drawn;
}

/** 已走的经历天数 = 今天（第 1 天）+ 走过的各段（不含同期段）之和. */
export function expDays(S: SimState): number {
  let d = 1;
  for (const k of S.walked) {
    const m = metaOf(k);
    if (m && m.days && !m.par) {
      d += stageDays(S, m);
    }
  }
  return d;
}

/** 踩坑额外拖出来的天. */
export function pitDays(S: SimState): number {
  return S.lessons.reduce((a, b) => a + b.days, 0);
}

/** 这趟实际走过的天（含坑）：状态带 / 时间条 / 总账共用同一口径. */
export function elapsed(S: SimState): number {
  return expDays(S) + pitDays(S);
}

/** 期条刻度：已走天数占 90 天（1-3 个月上界）的比例，以及常规区间暖色带的起点与宽度. */
export function timeScale(day: number): { base: number; rangeAt: number; rangeW: number } {
  const base = (Math.min(day, REAL_MAX) / REAL_MAX) * 100;
  return {
    base,
    rangeAt: (REAL_MIN / REAL_MAX) * 100,
    rangeW: ((REAL_MAX - REAL_MIN) / REAL_MAX) * 100,
  };
}

/* ============================ 限购问答 ============================ */

/** 限购问答定义（婚姻状况自 2025-08-26 起不再影响限购口径，故不提问）. */
export interface QaDef {
  q: string;
  opts: [string, string][];
}

export const QA_DEFS: Record<string, QaDef> = {
  hukou: { q: "你的户籍是？", opts: [["sh", "上海户籍"], ["non-sh", "非上海户籍"]] },
  permit: { q: "是否持《上海市居住证》满 5 年？", opts: [["yes", "是，已满 5 年"], ["no", "否 / 未满 5 年"]] },
  years: {
    q: "个税 / 社保连续缴纳多久？",
    opts: [["l1", "不满 1 年"], ["m1-3", "满 1 年，不满 3 年"], ["m3p", "满 3 年及以上"]],
  },
};

/** 问答步骤：户籍 →（非沪籍）居住证 →（未满 5 年）社保年限. */
export function buildQA(S: SimState): string[] {
  const steps = ["hukou"];
  if (S.ans.hukou !== "sh") {
    steps.push("permit");
    if (S.ans.permit !== "yes") {
      steps.push("years");
    }
  }
  return steps;
}

/**
 * 限购判定（口径 = 上海自 2026-02-26 起施行的限购政策）：
 * 沪籍家庭（含成年单身）外环外不限套数、外环内限购 2 套；
 * 非沪籍社保/个税满 1 年 → 外环外不限套数、外环内限购 1 套；满 3 年及以上 → 外环内 2 套；
 * 持《上海市居住证》满 5 年 → 免社保/个税证明，全市限购 1 套。
 * 外环外：符合购房条件即不限套数。
 */
export function judgeQA(S: SimState): { ok: boolean; title: string; reason: string } {
  const h = houseOf(S);
  const inner = !!(h && h.ring === "内");
  const owned = ownedCount(S);
  const a = S.ans;
  const mine =
    S.role && S.role.k === "trade" ? "置换：原房已售，名下 0 套" : "你名下 " + owned + " 套";
  if (a.hukou === "sh") {
    if (!inner) {
      return { ok: true, title: "可购买（外环外）", reason: "沪籍（含成年单身）在外环外购房不限套数；" + mine + "。" };
    }
    return owned < 2
      ? { ok: true, title: "可购买", reason: "沪籍外环内限购 2 套；" + mine + "。" }
      : { ok: false, title: "限购 · 不符合条件", reason: "沪籍外环内限购 2 套，名下已满 2 套。" };
  }
  if (a.permit === "yes") {
    return owned === 0
      ? { ok: true, title: "可购买 1 套", reason: "持居住证满 5 年：免社保或个税证明，全市限购 1 套；" + mine + "。" }
      : { ok: false, title: "限购 · 不符合条件", reason: "持居住证满 5 年全市限购 1 套，名下已有住房。" };
  }
  if (a.years === "l1") {
    return { ok: false, title: "暂不具备购房资格", reason: "社保 / 个税不满 1 年：外环内、外环外都还不能买。" };
  }
  if (a.years === "m1-3") {
    if (!inner) {
      return { ok: true, title: "可购买（外环外）", reason: "非沪籍社保满 1 年：外环外不限套数。" };
    }
    return owned === 0
      ? { ok: true, title: "可购买 1 套", reason: "非沪籍社保满 1 年：外环内限购 1 套；" + mine + "。" }
      : { ok: false, title: "限购 · 不符合条件", reason: "非沪籍社保满 1 年：外环内限购 1 套，名下已有住房。" };
  }
  if (!inner) {
    return { ok: true, title: "可购买（外环外）", reason: "非沪籍社保满 3 年：外环外不限套数。" };
  }
  return owned < 2
    ? { ok: true, title: "可购买", reason: "非沪籍社保满 3 年：外环内限购 2 套（原有 1 套 + 增购 1 套）；" + mine + "。" }
    : { ok: false, title: "限购 · 不符合条件", reason: "非沪籍社保满 3 年：外环内限购 2 套，名下已满。" };
}

/* ============================ 多轮砍价 ============================ */

/** 第一轮砍价选项：chip = 净让幅（成交价 = 挂牌价 ×(1-chip)）. */
export interface NegoR1Option {
  k: "hard" | "soft" | "chat";
  label: string;
  chip: number;
  d: string;
  /** 选项脚注（越线大概率被叫停 / 留有余地 / 急售的房东最好谈）. */
  note: string;
}

export const NEGO_R1: Record<"hard" | "soft" | "chat", NegoR1Option> = {
  hard: { k: "hard", chip: 0.06, label: "直接还价 -6%", d: "第一天就摆底线，能行就签。", note: "越线大概率被叫停" },
  soft: { k: "soft", chip: 0.03, label: "试探出价 -3%", d: "礼貌试探，先看看房东的反应。", note: "留有余地" },
  chat: { k: "chat", chip: 0, label: "先聊聊，为什么卖？", d: "不问价，先听故事。", note: "急售的房东最好谈" },
};

/** 第二轮砍价选项. */
export interface Nego2Option {
  k: string;
  label: string;
  d: string;
  /** 本轮净让幅. */
  slash: number;
}

/**
 * 第二轮选项（第一轮未越线时才进入谈判；越线直接进叫停屏）.
 * 不摆重复项：已经压到底线时「再压 1 个点」不存在，且「就按 X% 成交」与
 * 「直接压到底线」在数值相同时是同一件事，只留一条。
 */
export function nego2Options(S: SimState): Nego2Option[] {
  const h = houseOf(S)!;
  const cap = h.negotiable;
  const chip = S.negoR1 ? NEGO_R1[S.negoR1].chip : 0;
  const push = Math.min(chip + 0.01, cap);
  const opts: Nego2Option[] = [];
  if (chip < cap) {
    opts.push({ k: "push", label: "再压 1 个点，到 " + (push * 100).toFixed(0) + "%", d: "再试一次，看房东松不松口。", slash: push });
  }
  opts.push({ k: "hold", label: "就按 " + (chip * 100).toFixed(0) + "% 成交", d: "见好就收。", slash: chip });
  if (chip < cap && push < cap) {
    opts.push({ k: "bottom", label: "直接压到底线 " + (cap * 100).toFixed(0) + "%", d: "一步到位，风险自负。", slash: cap });
  }
  return opts;
}

/** 按 key 查找第二轮选项，找不到返回 null. */
export function findN2Option(S: SimState, k: string): Nego2Option | null {
  const opts = nego2Options(S);
  for (const o of opts) {
    if (o.k === k) {
      return o;
    }
  }
  return null;
}

/* ============================ 签约深坑：埋雷与结算 ============================ */

/** 「先不写」与「没提」是同一件事：没写进合同就会埋雷. */
export interface MineItem {
  k: string;
  name: string;
  cost: number;
  days: number;
  risk?: string;
  text: string;
  fix: string;
  /** 用户显式选了「先不写」（否则为「没提」）. */
  explicit: boolean;
  at: SceneKey;
}

/** 当前已埋的雷（签约清单里所有「没写进合同」的项）. */
export function mineList(S: SimState): MineItem[] {
  const out: MineItem[] = [];
  for (const it of SIGN_ITEMS) {
    if (S.con[it.k] === "do") {
      continue;
    }
    out.push({
      k: it.k, name: it.name, cost: it.omit.cost, days: it.omit.days, risk: it.omit.risk,
      text: it.omit.text, fix: it.omit.fix, explicit: S.con[it.k] === "no", at: it.omit.at,
    });
  }
  return out;
}

/**
 * 进入某屏时结算到站的雷：埋的雷爆成学费单（多花的钱 + 拖出来的天），
 * 计入 S.lessons 与 S.burst（本屏展示用），并抬升压力.
 */
export function settleMines(S: SimState, screenKey: SceneKey): void {
  S.burst = [];
  const m = metaOf(screenKey);
  for (const mine of mineList(S)) {
    if (mine.at !== screenKey) {
      continue;
    }
    if (S.lessons.some((l) => l.k === mine.k)) {
      continue;
    }
    const lesson: Lesson = {
      k: mine.k, short: mine.name, stage: m ? m.name : "",
      /* 学费单口径：cost 以「元」记账（SIGN_ITEMS 里是万元），与其余金额同单位 */
      cost: round2(mine.cost * 10000), days: mine.days,
      risk: mine.risk, text: mine.text, fix: mine.fix,
      src: mine.explicit ? "签约清单「" + mine.name + "」你写的是「先不写」" : "签约清单「" + mine.name + "」你没提",
    };
    S.lessons.push(lesson);
    S.burst.push(lesson);
  }
  if (S.burst.length) {
    S.stress = Math.min(100, S.stress + 22);
  }
}

/* ============================ 缴费（付款确认弹窗口径）============================ */

/**
 * 本次支付金额：与 sign / signNet / loanContract / deed / settle 五屏的账同口径.
 * 尾款扣押从卖方应得房款中扣留，不占用买方现金。
 */
export function payAmount(S: SimState, kind: string): number {
  const m = money(S);
  if (kind === "deposit") {
    return S.deposit;
  }
  if (kind === "firstPay") {
    return firstPayFor(S);
  }
  if (kind === "restPay") {
    return Math.max(0, round2(m.downCash - S.deposit - firstPayFor(S)));
  }
  if (kind === "transfer") {
    return round2(m.deedTax + m.agentFee + m.reg + m.sellerTax);
  }
  return round2(m.deal * 0.01); /* holdback：扣押尾款（从卖方房款中扣) */
}

/**
 * 渠道全借满也不够 → 只能换房.
 * ⚠️ 单位：need/cash 是元，BORROW_CAP 是万元（30+20+20）——必须换算后再比，
 * 否则 21.61 万缺口（216,100 元）会被判成「超出 70 万上限」，渠道全被置灰。
 */
export function borrowOverflow(S: SimState): boolean {
  return Math.max(0, money(S).need - S.cash) > BORROW_CAP * 10000;
}