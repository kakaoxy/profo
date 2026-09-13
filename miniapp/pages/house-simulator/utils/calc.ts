/**
 * 购房模拟器 · 计算纯函数（可单测）.
 *
 * 涵盖：金额格式化、等额本息月供、税费/首付/缺口汇总（derive）、贷款分摊（iloan）、
 * 限购问答树（buildQA/judgeQA）、多轮砍价（NEGO_R1/nego2Options/findN2Option）。
 * 全部函数只依赖入参（SimState 就地修改），不触碰 wx/系统 API，便于 vitest 单测。
 * 政策口径见 PRD §6（2026 上海），与 HiFi 原型 docs/design/购房模拟器-hifi.html 逐条对齐。
 *
 * ⚠️ 单文件 >500 行说明：本模块承载同一策略域（税费/贷款/限购/砍价）的全部纯计算
 * 函数，聚拢便于按 PRD 政策表逐条对照与单测；数据配置已拆入 constants.ts，场景视图
 * 拆入 scenes.ts。
 */

import {
  downRateFor,
  GJJ_CAP,
  House,
  SimState,
} from "./constants";

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

/** 百分比显示：去掉尾零（2.6%、3.05%、3.075%），避免浮点舍入错显. */
export function pct(v: number): string {
  return (v * 100).toFixed(3).replace(/0+$/, "").replace(/\.$/, "") + "%";
}

/** 压力 → 表情. */
export function stressFace(s: number): string {
  return s < 25 ? "😌" : s < 50 ? "😐" : s < 75 ? "😰" : "😱";
}

/** 卖家情绪 → 表情. */
export function sellerFace(s: number): string {
  return s < 40 ? "😤" : s < 65 ? "😑" : s < 85 ? "🙂" : "😄";
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

/**
 * 依房源 + 砍价比例计算衍生金额（税费逐项单列，首付含买方全部交易税费）.
 * 就地修改 S 的 deal/deposit/各项税费/down/need/gjjRate/commRate，并触发 iloan.
 */
export function derive(S: SimState): void {
  const h = S.house as House;
  /* 金额精确到分（元），不做万元取整，确保与线下实付金额一致 */
  const deal = round2(h.price * (1 - S.slash));
  S.deal = deal;
  S.deposit = round2(deal * 0.05);
  S.areaNum = parseInt(h.area, 10) || 0;
  /* 契税分档（2024 契税新政）：≤140㎡ 1%；>140㎡ 首套 1.5% / 二套 2% */
  const isFirst = S.role!.k !== "invest";
  const deedRate = S.areaNum <= 140 ? 0.01 : isFirst ? 0.015 : 0.02;
  S.deedTax = round2(deal * deedRate);
  /* 登记费：不动产登记费 80 元/件 */
  S.regFee = 80;
  /* 中介费：按已谈定费率（默认 2%，可压到 1%），服务费与税费分开 */
  S.agentFee = round2(deal * S.agentRate);
  /* 房产税：上海试点——二套按年征收（演示：成交价×70%×0.4%≈0.28%/年），单列不计入一次性首付 */
  S.estateTax = S.role!.k === "invest" ? round2(deal * 0.0028) : 0;
  /* 卖方税费口径（按房源持有年限/唯一性）：
     增值税：满 2 年免征；不满 2 年全额 5% + 附加（城建 7% + 教育费附加 3% + 地方教育附加 2% ≈ 增值税×12%）
     个税：满五唯一免征；否则核定 1%（上海住宅口径） */
  S.vat = 0;
  S.vatAdd = 0;
  S.sellerTax = 0;
  if (h.hold !== "new") {
    if (h.holdYears < 2) {
      S.vat = round2(deal * 0.05);
      S.vatAdd = round2(S.vat * 0.12);
    }
    if (!(h.holdYears >= 5 && h.unique)) {
      S.sellerTax = round2(deal * 0.01);
    }
  }
  /* 买方一次性税费 = 契税 + 登记费 + 中介费 */
  S.taxes = round2(S.deedTax + S.agentFee + S.regFee);
  /* 到手价暗坑：砍价时答应「到手价」，卖方税费（增值税+附加+个税）转嫁买方 */
  S.netTax = S.netDeal ? round2(S.vat + S.vatAdd + S.sellerTax) : 0;
  /* 房款首付：贷款方式决定最低比例，用户可在最低之上上调（downSel），1 = 全款不贷款 */
  S.downRate = Math.max(downRateFor(S.role!.k, h.ring, S.loanType), S.downSel || 0);
  S.down = round2(deal * S.downRate);
  if (S.loanType === "gjj") {
    const gjjLoan = S.deal - S.down;
    S.gjjTopUp = gjjLoan > GJJ_CAP ? round2(gjjLoan - GJJ_CAP) : 0;
    S.down = round2(S.down + S.gjjTopUp);
  } else {
    S.gjjTopUp = 0;
  }
  S.need = round2(S.down + S.taxes + S.netTax);
  S.gjjRate = S.role!.gjjRate;
  S.commRate = S.role!.commRate;
  iloan(S);
}

/** 金额取整到分（避免浮点误差）. */
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * 贷款计算（利率按身份角色：首套公积金 2.6%/商贷 3.05%；二套公积金 3.075%/商贷 3.06%）.
 * 贷款额 = 成交价 − 房款首付；纯公积金 min(贷款, 80万)；组合贷 公积金 min(贷款×40%, 80万) + 商贷补足.
 */
export function iloan(S: SimState): void {
  const loan = S.deal - S.down;
  const y = S.loanYears;
  if (S.loanType === "gjj") {
    const gjj = Math.min(loan, GJJ_CAP);
    const m = pmt(gjj, S.gjjRate, y);
    S.loan = { gjj, comm: 0, monthly: m, totalInt: m * y * 12 - gjj };
    return;
  }
  if (S.loanType === "comm") {
    const m = pmt(loan, S.commRate, y);
    S.loan = { gjj: 0, comm: loan, monthly: m, totalInt: m * y * 12 - loan };
    return;
  }
  /* 组合贷：公积金 min(贷款×40%, 80万) + 商贷 */
  const gjj = Math.min(loan * 0.4, GJJ_CAP);
  const comm = loan - gjj;
  const mg = pmt(gjj, S.gjjRate, y);
  const mc = pmt(comm, S.commRate, y);
  S.loan = { gjj, comm, monthly: mg + mc, totalInt: (mg + mc) * y * 12 - loan };
}

/** 限购问答定义（PRD §6.1：沪籍单身 1 套/家庭 2 套；非沪籍居住证满 5 年 1 套；社保满 1 年外环外不限/外环内 1 套；满 3 年外环内 2 套）. */
export interface QaDef {
  q: string;
  opts: [string, string][];
}

export const QA_DEFS: Record<string, QaDef> = {
  hukou: { q: "你的户籍是？", opts: [["sh", "上海户籍"], ["non-sh", "非上海户籍"]] },
  married: { q: "婚姻状况是？", opts: [["single", "单身"], ["married", "已婚"]] },
  permit: { q: "是否持《上海市居住证》满 5 年？", opts: [["yes", "是，已满 5 年"], ["no", "否 / 未满 5 年"]] },
  years: {
    q: "个税 / 社保连续缴纳多久？",
    opts: [["l1", "不满 1 年"], ["m1-3", "满 1 年，不满 3 年"], ["m3p", "满 3 年及以上"]],
  },
};

/** 名下套数由所选身份角色决定（刚需 0 / 置换 1 / 投资 1），问答不再重复提问. */
export function buildQA(S: SimState): string[] {
  const steps = ["hukou"] as string[];
  if (S.ans.hukou === "sh") {
    steps.push("married");
  } else {
    steps.push("permit");
    if (S.ans.permit !== "yes") {
      steps.push("years");
    }
  }
  return steps;
}

/** 限购判定（PRD §6.1 问答树）：依户籍/婚姻/居住证/社保 × 房源环线 × 名下套数. */
export function judgeQA(S: SimState): { ok: boolean; title: string; reason: string } {
  const a = S.ans;
  const inner = S.house!.ring === "内";
  const owned = S.role!.owned;
  if (a.hukou === "sh") {
    if (a.married === "single") {
      return owned === 0
        ? { ok: true, title: "恭喜，可购买 1 套", reason: "沪籍单身限购 1 套；你名下 0 套，具备购买资格（沪七条）。" }
        : { ok: false, title: "限购 · 不符合条件", reason: "沪籍单身限购 1 套，你名下已有住房，无法再购（沪七条）。" };
    }
    return owned < 2
      ? { ok: true, title: "恭喜，可购买 " + (owned === 0 ? "2" : "1") + " 套", reason: "沪籍家庭限购 2 套；你名下 " + (owned === 0 ? "0 套，可购 2 套" : "1 套，可再购 1 套") + "（沪七条）。" }
      : { ok: false, title: "限购 · 不符合条件", reason: "沪籍家庭限购 2 套，你名下已满 2 套，无法再购（沪七条）。" };
  }
  if (a.permit === "yes") {
    return owned === 0
      ? { ok: true, title: "恭喜，可购买 1 套", reason: "持居住证满 5 年视同沪籍购房资格，全市限购 1 套；你名下 0 套，具备资格。" }
      : { ok: false, title: "限购 · 不符合条件", reason: "持居住证满 5 年限购 1 套，你名下已有住房，无法再购。" };
  }
  if (a.years === "l1") {
    return { ok: false, title: "暂不具备购房资格", reason: "个税 / 社保连续缴纳不满 1 年，不满足限购政策要求，建议到期后再试。" };
  }
  if (a.years === "m1-3") {
    return !inner
      ? { ok: true, title: "恭喜，可购买（外环外）", reason: "非沪籍社保满 1 年：外环外不限套数，外环内限购 1 套。你选的是外环外房源，可直接购买。" }
      : owned === 0
        ? { ok: true, title: "恭喜，可购买 1 套", reason: "非沪籍社保满 1 年：外环内限购 1 套；你名下 0 套，具备资格。" }
        : { ok: false, title: "限购 · 不符合条件", reason: "非沪籍社保满 1 年：外环内限购 1 套，你名下已有住房，无法再购。" };
  }
  // m3p
  return !inner
    ? { ok: true, title: "恭喜，可购买（外环外）", reason: "非沪籍社保满 3 年：外环外不限套数，外环内限购 2 套。你选的是外环外房源，可直接购买。" }
    : owned < 2
      ? { ok: true, title: "恭喜，可购买", reason: "非沪籍社保满 3 年：外环内限购 2 套；你名下 " + (owned === 0 ? "0 套" : "1 套") + "，具备资格。" }
      : { ok: false, title: "限购 · 不符合条件", reason: "非沪籍社保满 3 年：外环内限购 2 套，你名下已满 2 套，无法再购。" };
}

/* ============================ 多轮砍价 ============================ */

/** 第一轮砍价选项：chip = 最终净让幅（成交价 = 挂牌价×(1-chip)）. */
export interface NegoR1Option {
  label: string;
  chip: number;
  mood: number;
  stress: number;
  d: string;
}

export const NEGO_R1: Record<"hard" | "soft" | "chat", NegoR1Option> = {
  hard: { label: "直接还价 -6%", chip: 0.06, mood: -25, stress: 12, d: "-6%：会不会太狠了？" },
  soft: { label: "试探出价 -3%", chip: 0.03, mood: -10, stress: 5, d: "-3%：先探探底价。" },
  chat: { label: "先聊聊，为什么卖？", chip: 0, mood: 10, stress: 2, d: "先建立感情，再谈价。" },
};

/** 第二轮砍价选项结构. */
export interface Nego2Option {
  key: string;
  label: string;
  d: string;
  chip: number;
  mood: number;
  stress: number;
}

/**
 * 第一轮报价生效（含越线判定）：chip = 本轮报价（净让幅）.
 * 报价越线 → negoCap=true，卖家情绪下调；随后 derive 按成交比例记账。
 */
export function setOffer(S: SimState, chip: number): void {
  const cap = (S.house as House).negotiable;
  S.slash = Math.min(cap, chip);
  S.negoCap = chip > cap;
  if (S.negoCap) {
    S.seller = Math.max(5, S.seller - 8);
  }
  derive(S);
}

/**
 * 第二轮选项：由「第一轮报价是否越过房东底线」动态生成——
 * 越线 → 房东已拒绝，只剩 按底线成交 / 加价缓和 / 坚持硬压（再低必被叫停）；
 * 未越线 → 才有 再砍一刀、假装离开 的空间。杜绝「刚拒绝 -6% 又谈成 -7%」的逻辑矛盾。
 */
export function nego2Options(S: SimState): { over: boolean; opts: Nego2Option[] } {
  const cap = (S.house as House).negotiable;
  const base = NEGO_R1[S.negoR1 as "hard" | "soft" | "chat"].chip;
  const over = S.negoCap;
  const mk = (key: string, label: string, d: string, chip: number, mood: number, stress: number): Nego2Option => ({
    key,
    label,
    d,
    chip,
    mood: mood || 0,
    stress: stress || 0,
  });
  let o: Nego2Option[];
  if (over) {
    /* 房东已经拒绝你上一轮报价：只能往回找补，没有更低的选项 */
    o = [
      mk("acc", "按房东底线 " + pct(cap) + " 成交", "顺着台阶下，房东松口。", cap, 12, 0),
      mk("retreat", "加价缓和到 " + pct(Math.max(0, cap - 0.005)), "你让一步，给彼此台阶——房东同意。", Math.max(0, cap - 0.005), 15, 0),
      mk("push", "坚持原报价一步不让", "继续硬压，逼近房东叫停线。", base, -20, 10),
    ];
  } else if (S.negoR1 === "hard") {
    o = [
      mk("up2", "加价 0.5% 缓和（→ " + pct(0.055) + "）", "对方嫌狠，给个台阶，你诚他也让。", 0.055, 10, 0),
      mk("pick2", "挑毛病，再砍 1%（→ " + pct(0.07) + "）", "户型/装修挨个挑刺——注意，可能越过房东底线。", 0.07, -15, 8),
      mk("walk2", "假装离开（→ " + pct(0.06) + "）", "作势要走，赌他被你叫回。", 0.06, -8, 8),
    ];
  } else if (S.negoR1 === "soft") {
    o = [
      mk("up3", "加价 0.5% 卖人情（→ " + pct(0.025) + "）", "你诚，他也让。", 0.025, 8, 0),
      mk("pick3", "承诺提高首付换再让（→ " + pct(0.035) + "）", "反正首付按政策算，姿态先给足。", 0.035, 18, 2),
      mk("keep3", "坚持原价磨（→ " + pct(0.03) + "）", "磨就是拼耐心。", 0.03, -6, 2),
    ];
  } else {
    /* chat */
    o = [
      mk("m5", "顺势出价 " + pct(0.05), "聊得热络，趁热打铁。", 0.05, -5, 3),
      mk("m4", "试探性 " + pct(0.04), "稳一点。", 0.04, -2, 2),
      mk("m7", "大胆开价 " + pct(0.07), "聊归聊，价照砍——小心越过底线。", 0.07, -20, 8),
    ];
  }
  return { over, opts: o };
}

/** 按 key 查找第二轮选项（含越线分支），找不到返回 null. */
export function findN2Option(S: SimState, key: string): Nego2Option | null {
  const r = nego2Options(S);
  for (let i = 0; i < r.opts.length; i++) {
    if (r.opts[i].key === key) {
      return r.opts[i];
    }
  }
  return null;
}