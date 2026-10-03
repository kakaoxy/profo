/**
 * 「贷款计算器」纯计算函数测试：等额本息/等额本金锚点、组合贷拆分与按期合并、
 * 逐期守恒（Σ本金=贷款额、Σ利息=总利息）、参数钳制边界、零价兜底.
 * 口径与锚点值对齐 docs/2026-10-02-贷款计算器-spec.md（设计稿 486 万示例）.
 */
import { describe, expect, it } from "vitest";
import {
  calcLoan, clampDownPct, downAmountBounds, downAmountToPct, fmtBp, fmtPct2, fmtWan1, fmtYuanInt,
  parseBargainInput, stepBp, stepFundAmt, stepLpr,
  BARGAIN_MAX_WAN, DOWN_MAX, DOWN_MIN, LOAN_DEFAULTS,
} from "../../utils/loan-calc";
import type { LoanParams } from "../../utils/loan-calc";

/** 与 LOAN_DEFAULTS 一致的基础参数（显式展开便于单字段覆盖）. */
function base(overrides: Partial<LoanParams> = {}): LoanParams {
  return { ...LOAN_DEFAULTS, ...overrides };
}

describe("默认口径锚点（首套 · 纯商贷 · 15% · 30年 · LPR−45bp · 等额本息）", () => {
  it("486 万：首付 72.9 万 / 月供 17,528 / 总利息 2,179,101（设计稿示例）", () => {
    const r = calcLoan(486, base());
    expect(r.downWan).toBeCloseTo(72.9, 6);
    expect(r.loanWan).toBeCloseTo(413.1, 6);
    expect(Math.round(r.first)).toBe(17528);
    expect(Math.round(r.last)).toBe(17528);
    expect(r.dec).toBe(0);
    expect(Math.round(r.interestYuan)).toBe(2179101);
    expect(r.execRate).toBeCloseTo(3.05, 6);
    expect(r.commRate).toBeCloseTo(3.05, 6);
    expect(r.rows.length).toBe(360);
  });

  it("详情卡格式化：首付 '72.9' / 月供 '17,528'", () => {
    const r = calcLoan(486, base());
    expect(fmtWan1(r.downWan)).toBe("72.9");
    expect(fmtYuanInt(r.first)).toBe("17,528");
  });
});

describe("等额本金", () => {
  it("486 万商贷：首月 21,975 / 末月 11,504 / 每月递减 29（设计稿示例）", () => {
    const r = calcLoan(486, base({ method: "prin" }));
    expect(Math.round(r.first)).toBe(21975);
    expect(Math.round(r.last)).toBe(11504);
    expect(Math.round(r.dec)).toBe(29);
  });

  it("逐期递减：每期月供比上期少 dec（首期后），本金恒定", () => {
    const r = calcLoan(486, base({ method: "prin" }));
    const diff = r.rows[0].pay - r.rows[1].pay;
    expect(diff).toBeCloseTo(r.dec, 6);
    expect(r.rows[0].pri).toBeCloseTo(r.rows[359].pri, 6);
    // 末月剩余本金为 0
    expect(r.rows[359].bal).toBeCloseTo(0, 4);
  });
});

describe("组合贷拆分与合并", () => {
  it("fundAmt 100 万：公积金 2.60% + 商贷 3.05%，执行利率取商贷", () => {
    const r = calcLoan(486, base({ mode: "combo" }));
    expect(r.execRate).toBeCloseTo(3.05, 6);
    // 手工拆分对账：公积金 100 万 + 商贷 313.1 万，同参数分别算再合并
    const fund = calcLoan(100, base({ mode: "fund", downPct: 0 }));
    const comm = calcLoan(313.1, base({ downPct: 0 }));
    expect(Math.round(r.first)).toBe(Math.round(fund.first + comm.first));
    expect(Math.round(r.interestYuan)).toBe(Math.round(fund.interestYuan + comm.interestYuan));
  });

  it("fundAmt 超贷款总额时取贷款总额、商贷部分为 0（利率展示取商贷口径）", () => {
    const r = calcLoan(100, base({ mode: "combo", fundAmt: 500 }));
    const fundOnly = calcLoan(100, base({ mode: "fund" }));
    expect(Math.round(r.first)).toBe(Math.round(fundOnly.first));
    expect(Math.round(r.interestYuan)).toBe(Math.round(fundOnly.interestYuan));
  });
});

describe("纯公积金", () => {
  it("486 万：执行利率 2.60% 固定", () => {
    const r = calcLoan(486, base({ mode: "fund" }));
    expect(r.execRate).toBe(2.6);
    expect(r.rows.length).toBe(360);
  });
});

describe("逐期守恒（等额本息 / 本金 / 组合贷）", () => {
  it.each([
    ["comm-axi", base()],
    ["comm-prin", base({ method: "prin" })],
    ["combo-axi", base({ mode: "combo" })],
    ["combo-prin", base({ mode: "combo", method: "prin" })],
    ["fund-axi", base({ mode: "fund" })],
  ])("%s：Σ本金=贷款额、Σ利息=总利息、余额单调递减至 0", (_n, p) => {
    const r = calcLoan(486, p);
    const loanYuan = r.loanWan * 10000;
    let sumPri = 0;
    let sumInt = 0;
    let prevBal = loanYuan;
    for (const row of r.rows) {
      // 每期：pay = pri + int，余额递减恰好 pri
      expect(row.pay).toBeCloseTo(row.pri + row.int, 4);
      expect(prevBal - row.bal).toBeCloseTo(row.pri, 2);
      prevBal = row.bal;
      sumPri += row.pri;
      sumInt += row.int;
    }
    expect(sumPri).toBeCloseTo(loanYuan, 0);
    expect(Math.round(sumInt)).toBe(Math.round(r.interestYuan));
    expect(r.rows[359].bal).toBeCloseTo(0, 4);
  });
});

describe("参数钳制", () => {
  it("首付下限按方式联动（商贷 15 / 公积金·组合贷 20），上限 80", () => {
    expect(clampDownPct(10, "comm")).toBe(15);
    expect(clampDownPct(15, "fund")).toBe(20);
    expect(clampDownPct(15, "combo")).toBe(20);
    expect(clampDownPct(50, "comm")).toBe(50);
    expect(clampDownPct(90, "comm")).toBe(DOWN_MAX);
  });

  it("LPR 步进 0.05、钳 2~6；两位小数无浮点尾差", () => {
    expect(stepLpr(3.5, 1)).toBe(3.55);
    expect(stepLpr(3.5, -1)).toBe(3.45);
    expect(stepLpr(6, 1)).toBe(6);
    expect(stepLpr(2, -1)).toBe(2);
    expect(stepLpr(3.5, -100)).toBe(2);
  });

  it("加点步进 5、钳 −100~+100", () => {
    expect(stepBp(-45, -1)).toBe(-50);
    expect(stepBp(-45, 1)).toBe(-40);
    expect(stepBp(100, 1)).toBe(100);
    expect(stepBp(-100, -1)).toBe(-100);
  });

  it("公积金额度步进 5、钳 10~500", () => {
    expect(stepFundAmt(100, 1)).toBe(105);
    expect(stepFundAmt(10, -1)).toBe(10);
    expect(stepFundAmt(500, 1)).toBe(500);
  });

  it("DOWN_MIN 常量与政策表一致", () => {
    expect(DOWN_MIN).toEqual({ comm: 15, fund: 20, combo: 20 });
  });
});

describe("边界与格式化", () => {
  it("总价缺失/非法：全零结果 + 空 rows（详情卡隐藏、计算器 invalid 态）", () => {
    for (const price of [0, -5, Number.NaN]) {
      const r = calcLoan(price, base());
      expect(r.downWan).toBe(0);
      expect(r.first).toBe(0);
      expect(r.interestYuan).toBe(0);
      expect(r.rows).toEqual([]);
    }
  });

  it("r=0 兜底：月供 = P/n", () => {
    const r = calcLoan(480, base({ lpr: 0, bp: 0 }));
    expect(r.first).toBeCloseTo((480 * 0.85 * 10000) / 360, 4);
  });

  it("fmtWan1 去尾零 / fmtPct2 两位小数去尾零 / fmtBp 带符号（U+2212）", () => {
    expect(fmtWan1(100)).toBe("100");
    expect(fmtWan1(72.9)).toBe("72.9");
    // 四舍五入取非半途值断言（x.x5 半途值受浮点表示影响，不作契约）
    expect(fmtWan1(72.06)).toBe("72.1");
    expect(fmtWan1(72.04)).toBe("72");
    expect(fmtPct2(15)).toBe("15");
    expect(fmtPct2(32.258064516)).toBe("32.26");
    expect(fmtPct2(20.5)).toBe("20.5");
    expect(fmtBp(-45)).toBe("−45");
    expect(fmtBp(30)).toBe("+30");
    expect(fmtBp(0)).toBe("0");
  });
});

describe("砍价输入解析（spec K10，设计稿 v1.3）", () => {
  it("合法输入：整数/小数，返回数值", () => {
    expect(parseBargainInput("486")).toBe(486);
    expect(parseBargainInput("460.5")).toBe(460.5);
    expect(parseBargainInput("1")).toBe(1);
    expect(parseBargainInput(BARGAIN_MAX_WAN + "")).toBe(BARGAIN_MAX_WAN);
  });

  it("非法输入：空串/非数字/≤0/>9999 → null", () => {
    expect(parseBargainInput("")).toBeNull();
    expect(parseBargainInput("abc")).toBeNull();
    expect(parseBargainInput("0")).toBeNull();
    expect(parseBargainInput("-5")).toBeNull();
    expect(parseBargainInput("10000")).toBeNull();
  });

  it("砍价 486→460 万：月供/利息按新价重算（默认口径）", () => {
    const cut = calcLoan(460, LOAN_DEFAULTS);
    expect(cut.loanWan).toBeCloseTo(391, 6);
    // 等额本息月供与贷款额线性关系：460/486 × 17,528
    expect(Math.round(cut.first)).toBe(Math.round((460 / 486) * 17528));
    expect(cut.downWan).toBeCloseTo(69, 6);
  });
});

describe("自定义首付金额换算（spec K12）", () => {
  it("有效区间 = [总价×下限, 总价×80%]，随 mode 联动", () => {
    expect(downAmountBounds(486, "comm")).toEqual({ min: 72.9, max: 388.8 });
    expect(downAmountBounds(486, "fund").min).toBeCloseTo(97.2, 6);
    expect(downAmountBounds(486, "combo").min).toBeCloseTo(97.2, 6);
  });

  it("金额→比例：全精度保留手填金额（不取整），clamp 双保险", () => {
    // 80/248 = 32.258064516%：不取整，保证「手填 80 万即贷 168 万」业务实操（2026-10-03 修订）
    expect(downAmountToPct(80, 248, "comm")).toBeCloseTo(32.258064516, 6);
    expect(downAmountToPct(150, 486, "comm")).toBeCloseTo(30.864197531, 6);
    expect(downAmountToPct(72.9, 486, "comm")).toBe(15); // 恰为下限
    expect(downAmountToPct(388.8, 486, "comm")).toBe(80); // 恰为上限
    // 公积金/组合贷下限 20%：低金额被钳到 20
    expect(downAmountToPct(72.9, 486, "fund")).toBe(20);
    // 超上限金额换算出 >80% 的比例也被钳回 80
    expect(downAmountToPct(450, 486, "comm")).toBe(80);
  });

  it("手填金额经比例还原后偏差 < 1 分钱（无取整损失）", () => {
    // 用户报障场景：总价 248 万手填 80 万 → 首付 80、贷款 168
    const pct = downAmountToPct(80, 248, "comm");
    const r = calcLoan(248, { ...LOAN_DEFAULTS, downPct: pct });
    expect(r.downWan).toBeCloseTo(80, 6);
    expect(r.loanWan).toBeCloseTo(168, 6);
    // 任意金额同样成立
    const p2 = downAmountToPct(123.4, 567.8, "combo");
    const r2 = calcLoan(567.8, { ...LOAN_DEFAULTS, mode: "combo", downPct: p2 });
    expect(r2.downWan).toBeCloseTo(123.4, 6);
  });
});
