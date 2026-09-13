/**
 * 购房模拟器 · 计算纯函数单测（对齐 PRD §6 / HiFi 原型口径）.
 * 覆盖：等额本息、首付比例、税费/首付/缺口汇总、限购判定、多轮砍价动态分支。
 */
import { describe, expect, it } from "vitest";
import {
  buildQA,
  derive,
  findN2Option,
  fmt,
  fmtY,
  fmtYuan,
  judgeQA,
  nego2Options,
  pct,
  pmt,
  setOffer,
} from "../../pages/house-simulator/utils/calc";
import {
  createInitialState,
  downRateFor,
  HOUSES,
  ROLES,
} from "../../pages/house-simulator/utils/constants";

describe("金额格式化", () => {
  it("fmt 万元显示：保留 2 位小数（与线下实付口径一致）", () => {
    expect(fmt(2000000)).toBe("200.00");
    expect(fmt(125000)).toBe("12.50");
    expect(fmt(3800000)).toBe("380.00");
  });

  it("fmtY/fmtYuan 千分位 + 2 位小数", () => {
    expect(fmtY(3800000)).toBe("¥380.00万");
    expect(fmtYuan(3800000)).toBe("3,800,000.00");
    expect(fmtYuan(15216.5)).toBe("15,216.50");
  });

  it("pct 去除尾零（2.6% / 3.05% / 3.075% / 整数百分比）", () => {
    expect(pct(0.026)).toBe("2.6%");
    expect(pct(0.0305)).toBe("3.05%");
    expect(pct(0.03075)).toBe("3.075%");
    expect(pct(0.2)).toBe("20%");
  });
});

describe("等额本息 pmt", () => {
  it("利率为 0 时按本金均摊", () => {
    expect(pmt(120000, 0, 1)).toBe(10000); // years=1 → 12 期
  });

  it("年利率越高月供越高；月供×期数-本金=总利息", () => {
    const m1 = pmt(1000000, 0.0305, 30);
    const m2 = pmt(1000000, 0.04, 30);
    expect(m2).toBeGreaterThan(m1);
    expect(m1 * 360 - 1000000).toBeGreaterThan(0);
    expect(m1).toBeGreaterThan(1000000 / 360); // 有利息月供必高于均摊
  });
});

describe("首付比例 downRateFor", () => {
  it("首套：商贷 15% / 组合贷·公积金 20%", () => {
    expect(downRateFor("first", "内", "comm")).toBe(0.15);
    expect(downRateFor("first", "内", "combo")).toBe(0.2);
    expect(downRateFor("trade", "外", "comm")).toBe(0.15);
    expect(downRateFor("trade", "外", "gjj")).toBe(0.2);
  });

  it("二套外环内 25%；外环外 商贷 15% / 组合贷·公积金 20%", () => {
    expect(downRateFor("invest", "内", "comm")).toBe(0.25);
    expect(downRateFor("invest", "内", "combo")).toBe(0.25);
    expect(downRateFor("invest", "外", "comm")).toBe(0.15);
    expect(downRateFor("invest", "外", "combo")).toBe(0.2);
  });
});

describe("derive 税费/首付/缺口汇总", () => {
  it("刚需首套 × 满五唯一（B 房）× 组合贷：契税 1%、免卖方税费", () => {
    const S = createInitialState();
    S.role = ROLES.first;
    S.house = HOUSES.find((h) => h.id === "B")!;
    S.slash = 0.05; // B 房底线 5%
    derive(S);
    expect(S.deal).toBe(3800000); // 400万 × 0.95
    expect(S.deposit).toBe(190000); // 成交价 5%
    expect(S.deedTax).toBe(38000); // ≤140㎡ 1%（精确到分，不再四舍五入到万）
    expect(S.agentFee).toBe(76000); // 2%（精确到分）
    expect(S.taxes).toBe(38000 + 76000 + 80);
    expect(S.vat).toBe(0);
    expect(S.sellerTax).toBe(0); // 满五唯一免征
    expect(S.netTax).toBe(0);
    expect(S.downRate).toBe(0.2); // 首套组合贷
    expect(S.down).toBe(760000);
    expect(S.need).toBe(760000 + 114080);
    expect(S.gjjTopUp).toBe(0); // 贷款额有限，公积金额度充足
  });

  it("投资二套 × 未满 2 年全额增值税（F 房）× 纯公积金：到手价转嫁 + 公积金额度补足", () => {
    const S = createInitialState();
    S.role = ROLES.invest;
    S.house = HOUSES.find((h) => h.id === "F")!; // 550万 · 未满2年
    S.loanType = "gjj";
    S.slash = 0;
    S.netDeal = true; // 答应到手价
    derive(S);
    expect(S.deal).toBe(5500000);
    expect(S.vat).toBe(275000); // 5%（精确到分）
    expect(S.vatAdd).toBe(33000); // 增值税×12%（精确到分）
    expect(S.sellerTax).toBe(55000); // 核定 1%（精确到分）
    expect(S.netTax).toBe(275000 + 33000 + 55000); // 363000 转嫁
    expect(S.downRate).toBe(0.25); // 二套外环内（F 房 ring=内）
    expect(S.down).toBe(1375000 + 3325000); // 首付 + 公积金 80 万额度不足补足
    expect(S.gjjTopUp).toBe(3325000);
    expect(S.deedTax).toBe(55000); // 92㎡ → 1%（精确到分）
    expect(S.taxes).toBe(55000 + 110000 + 80);
    expect(S.need).toBe(S.down + S.taxes + S.netTax);
    // 纯公积金：贷款额被压缩到 80 万
    expect(S.loan.gjj).toBe(800000);
    expect(S.loan.comm).toBe(0);
  });

  it("首付可在最低之上多付（downSel 生效，不最低贷款）", () => {
    const S = createInitialState();
    S.role = ROLES.first;
    S.house = HOUSES.find((h) => h.id === "B")!; // 400万 · 组合贷最低 20%
    S.downSel = 0.5; // 现金充足，多付到 50%
    derive(S);
    expect(S.downRate).toBe(0.5); // 不再被钳死在最低 20%
    expect(S.down).toBe(2000000); // 挂牌价 400 万 × 50%
    expect(S.loan.comm + S.loan.gjj).toBe(2000000); // 贷款额相应减少
    expect(S.loan.monthly).toBeGreaterThan(0);
  });

  it("全款 100%：无贷款、无月供、无公积金额度补足", () => {
    const S = createInitialState();
    S.role = ROLES.first;
    S.house = HOUSES.find((h) => h.id === "B")!;
    S.downSel = 1; // 全款
    derive(S);
    expect(S.downRate).toBe(1);
    expect(S.down).toBe(S.deal); // 400万×0.95=380万
    expect(S.loan.comm).toBe(0);
    expect(S.loan.gjj).toBe(0);
    expect(S.loan.monthly).toBe(0);
    expect(S.loan.totalInt).toBe(0);
    expect(S.gjjTopUp).toBe(0);
  });

  it("用户所选低于最低首付时按最低执行（20% 兜底）", () => {
    const S = createInitialState();
    S.role = ROLES.first;
    S.house = HOUSES.find((h) => h.id === "B")!;
    S.downSel = 0.15; // 组合贷最低 20%，低于限制
    derive(S);
    expect(S.downRate).toBe(0.2);
    expect(S.down).toBe(800000); // 400 万 × 20%
  });
});

describe("限购判定 judgeQA", () => {
  it("沪籍单身：名下 0 套可购、≥1 套限购", () => {
    const S1 = createInitialState();
    S1.role = ROLES.first; // owned 0
    S1.house = HOUSES[0];
    S1.ans = { hukou: "sh", married: "single" };
    expect(judgeQA(S1).ok).toBe(true);

    const S2 = createInitialState();
    S2.role = ROLES.trade; // owned 1
    S2.house = HOUSES[0];
    S2.ans = { hukou: "sh", married: "single" };
    expect(judgeQA(S2).ok).toBe(false);
  });

  it("沪籍已婚：名下 1 套可再购 1 套", () => {
    const S = createInitialState();
    S.role = ROLES.trade; // owned 1
    S.house = HOUSES[0];
    S.ans = { hukou: "sh", married: "married" };
    expect(judgeQA(S).ok).toBe(true);
  });

  it("非沪籍持居住证满 5 年：全市限购 1 套", () => {
    const S = createInitialState();
    S.role = ROLES.first;
    S.house = HOUSES[0];
    S.ans = { hukou: "non-sh", permit: "yes" };
    expect(judgeQA(S).ok).toBe(true);
  });

  it("非沪籍社保不满 1 年：无资格", () => {
    const S = createInitialState();
    S.role = ROLES.first;
    S.house = HOUSES[0];
    S.ans = { hukou: "non-sh", permit: "no", years: "l1" };
    expect(judgeQA(S).ok).toBe(false);
  });

  it("非沪籍社保满 1 年：外环外不限、外环内名下 0 套可购、≥1 套限购", () => {
    const S1 = createInitialState();
    S1.role = ROLES.first;
    S1.house = HOUSES[2]; // C 房 外环外
    S1.ans = { hukou: "non-sh", permit: "no", years: "m1-3" };
    expect(judgeQA(S1).ok).toBe(true);

    const S2 = createInitialState();
    S2.role = ROLES.trade; // owned 1
    S2.house = HOUSES[0]; // 外环内
    S2.ans = { hukou: "non-sh", permit: "no", years: "m1-3" };
    expect(judgeQA(S2).ok).toBe(false);
  });

  it("非沪籍社保满 3 年：外环内名下 1 套可再购", () => {
    const S = createInitialState();
    S.role = ROLES.trade; // owned 1
    S.house = HOUSES[0];
    S.ans = { hukou: "non-sh", permit: "no", years: "m3p" };
    expect(judgeQA(S).ok).toBe(true);
  });
});

describe("问答流程 buildQA", () => {
  it("沪籍：户籍 → 婚姻；非沪籍：户籍 → 居住证 →（未满 5 年）社保年限", () => {
    const S = createInitialState();
    // 问答第一问恒为户籍，作答前 ans 为空（而非直接可购），流程由用户逐题推进
    S.ans = { hukou: "sh" };
    expect(buildQA(S)).toEqual(["hukou", "married"]);
    S.ans = { hukou: "non-sh", permit: "yes" };
    expect(buildQA(S)).toEqual(["hukou", "permit"]);
    S.ans = { hukou: "non-sh", permit: "no" };
    expect(buildQA(S)).toEqual(["hukou", "permit", "years"]);
  });
});

describe("多轮砍价 nego2Options", () => {
  function setup(hard: "hard" | "soft" | "chat", chip: number) {
    const S = createInitialState();
    S.role = ROLES.first;
    S.house = HOUSES.find((h) => h.id === "B")!; // 底线 5%
    S.negoR1 = hard;
    setOffer(S, chip);
    return S;
  }

  it("第一轮直接还 -6% 越线：第二轮只剩 按底线成交/加价缓和/坚持硬压", () => {
    const S = setup("hard", 0.06);
    expect(S.negoCap).toBe(true);
    expect(S.slash).toBe(0.05); // 成交价按房东底线封顶
    const r = nego2Options(S);
    expect(r.over).toBe(true);
    expect(r.opts.map((o) => o.key)).toEqual(["acc", "retreat", "push"]);
    // 越线后除「坚持硬压（必叫停）」外没有任何更低的报价（retreat 是买方让步，幅度低于底线）
    expect(r.opts.filter((o) => o.key !== "push").every((o) => o.chip <= 0.05)).toBe(true);
    expect(r.opts.find((o) => o.key === "push")!.chip).toBe(0.06);
  });

  it("未越线：soft 第二轮有 卖人情/换首付/磨 三档", () => {
    const S = setup("soft", 0.03);
    expect(S.negoCap).toBe(false);
    const r = nego2Options(S);
    expect(r.over).toBe(false);
    expect(r.opts.map((o) => o.key)).toEqual(["up3", "pick3", "keep3"]);
    expect(findN2Option(S, "pick3")).not.toBeNull();
    expect(findN2Option(S, "acc")).toBeNull();
  });

  it("chat 第一轮顺水推舟：第二轮可开价 5% / 4% / 7%", () => {
    const S = setup("chat", 0);
    expect(S.negoCap).toBe(false);
    const r = nego2Options(S);
    expect(r.opts.map((o) => o.key)).toEqual(["m5", "m4", "m7"]);
  });

  it("「再砍一刀」是否成立取决于房源底线：-7% 在底线 8% 的 D 房可成、底线 5% 的 B 房叫停", () => {
    const S1 = createInitialState();
    S1.role = ROLES.first;
    S1.house = HOUSES.find((h) => h.id === "D")!; // 底线 8%
    S1.negoR1 = "chat";
    setOffer(S1, 0);
    // 第二轮开价 7% < 8%：不越线
    setOffer(S1, 0.07);
    expect(S1.negoCap).toBe(false);

    const S2 = createInitialState();
    S2.role = ROLES.first;
    S2.house = HOUSES.find((h) => h.id === "B")!; // 底线 5%
    S2.negoR1 = "chat";
    setOffer(S2, 0);
    setOffer(S2, 0.07);
    expect(S2.negoCap).toBe(true);
  });
});