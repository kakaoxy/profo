/**
 * 购房模拟器 · 计算纯函数单测（对齐 2026-09-17 购房模块高保真设计稿 v1 口径）.
 *
 * 覆盖：金额格式化、等额本息、首付比例、税费/首付/口径汇总（derive/money）、首付分期、
 * 贷款分摊与风控线、经历周期时间线（stageDays/expDays/elapsed）、限购问答、多轮砍价
 * 动态分支、签约深坑埋雷与结算（settleMines）、五个出款点的金额口径。
 * 纯函数，无需 Page/wx；涉及随机抽天数的用例以 vi.spyOn(Math,"random") 固定区间端点。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addDownAmount, addDownText, avail, borrowOverflow, buildQA, deedRateOf, defaultCustom,
  derive, discountText, elapsed, expDays, findN2Option, firstPayFor, fmt, fmtN, fmtY, fmtYuan,
  gap, gjjCap, handCash, houseOf, iloan, incomeRatio, judgeQA, lessonCost, loanCap, loanPrincipal,
  loanRate, lossRows, minDownToClear, mineList, money, monthlyOf, nego2Options, NEGO_R1,
  overRisk, ownedCount, paid, payAmount, pct, pitDays, pmt, QA_DEFS, round2, sellerIncomeTax,
  sellerVatOf, settleMines, stageDays, stressFace, syncCustom, timeScale,
} from "../../pages/house-simulator/utils/calc";
import {
  createInitialState, downRateFor, GJJ_CAP_FIRST, GJJ_CAP_SECOND, HOUSES, INCOME, ROLES,
} from "../../pages/house-simulator/utils/constants";
import type { LoanTypeKey, RoleKey, SimState } from "../../pages/house-simulator/utils/constants";
import {
  BORROW_CAP, BORROW_CAPS, HAND_ITEMS, NODE_DAYS, PAY_KINDS, REAL_MAX, REAL_MIN, SCREENS,
  screenIdx, screenMeta, SIGN_ITEMS,
} from "../../pages/house-simulator/utils/flow";

afterEach(() => {
  vi.restoreAllMocks();
});

/** 构造「身份 × 房源」基础状态（未砍价、未选首付档）. */
function state(roleK: RoleKey = "first", houseId = "B", lt: LoanTypeKey = "combo"): SimState {
  const S = createInitialState();
  S.role = ROLES[roleK];
  S.house = HOUSES.find((h) => h.id === houseId)!;
  S.loanType = lt;
  return S;
}

const house = (id: string) => HOUSES.find((h) => h.id === id)!;

describe("金额格式化", () => {
  it("fmt 万元保留 2 位小数", () => {
    expect(fmt(2000000)).toBe("200.00");
    expect(fmt(3800000)).toBe("380.00");
    expect(fmt(125000)).toBe("12.50");
  });

  it("fmtY / fmtYuan / fmtN 千分位", () => {
    expect(fmtY(3800000)).toBe("¥380.00万");
    expect(fmtYuan(3800000)).toBe("3,800,000.00");
    expect(fmtYuan(15216.5)).toBe("15,216.50");
    expect(fmtN(3800)).toBe("3,800");
  });

  it("pct 去掉尾零（2.6% / 3.05% / 3.075% / 20%）", () => {
    expect(pct(0.026)).toBe("2.6%");
    expect(pct(0.0305)).toBe("3.05%");
    expect(pct(0.03075)).toBe("3.075%");
    expect(pct(0.2)).toBe("20%");
  });

  it("discountText / stressFace / round2", () => {
    expect(discountText(0)).toBe("10.0 折");
    expect(discountText(0.05)).toBe("9.5 折");
    expect(stressFace(8)).toBe("😌");
    expect(stressFace(30)).toBe("😐");
    expect(stressFace(60)).toBe("😰");
    expect(stressFace(80)).toBe("😱");
    expect(round2(1.006)).toBe(1.01);
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
});

describe("等额本息 pmt", () => {
  it("利率 0 → 本金均摊", () => {
    expect(pmt(120000, 0, 1)).toBe(10000);
  });

  it("利率越高月供越高；月供×期数 − 本金 = 正的总利息", () => {
    const m1 = pmt(1000000, 0.0305, 30);
    const m2 = pmt(1000000, 0.04, 30);
    expect(m2).toBeGreaterThan(m1);
    expect(m1).toBeGreaterThan(1000000 / 360);
    expect(m1 * 360 - 1000000).toBeGreaterThan(0);
  });
});

describe("首付比例 downRateFor", () => {
  it("首套（刚需 / 置换）：商贷 15% / 组合贷·公积金 20%", () => {
    expect(downRateFor("first", "内", "comm")).toBe(0.15);
    expect(downRateFor("first", "外", "gjj")).toBe(0.2);
    expect(downRateFor("trade", "内", "combo")).toBe(0.2);
  });

  it("二套：外环内 25%；外环外 商贷 15% / 组合贷·公积金 20%", () => {
    expect(downRateFor("invest", "内", "comm")).toBe(0.25);
    expect(downRateFor("invest", "内", "gjj")).toBe(0.25);
    expect(downRateFor("invest", "外", "comm")).toBe(0.15);
    expect(downRateFor("invest", "外", "combo")).toBe(0.2);
  });
});

describe("房源口径与卖方税费", () => {
  it("houseOf 自定义房源优先；ownedCount 只有投资二套算 1 套（置换原房已售 = 0）", () => {
    const S = state("trade", "B");
    expect(houseOf(S)!.id).toBe("B");
    S.custom = defaultCustom();
    expect(houseOf(S)!.id).toBe("X");
    expect(ownedCount(S)).toBe(0);
    expect(ownedCount(state("first", "B"))).toBe(0);
    expect(ownedCount(state("invest", "B"))).toBe(1);
    /* 置换的原房已卖：角色表里 owned 也必须是 0，否则限购会按二套误判 */
    expect(ROLES.trade.owned).toBe(0);
  });

  it("契税分档：≤140㎡ 1%；>140㎡ 首套 1.5% / 二套 2%", () => {
    const small = state("first", "B");
    derive(small); // 88㎡
    expect(deedRateOf(small)).toBe(0.01);

    const big = state("first", "E");
    derive(big); // 160㎡
    expect(big.areaNum).toBe(160);
    expect(deedRateOf(big)).toBe(0.015);

    const bigInv = state("invest", "E");
    derive(bigInv);
    expect(deedRateOf(bigInv)).toBe(0.02);
  });

  it("卖方增值税：满 2 年 / 新房免征；不满 2 年按 5% × 1.12（含附加）", () => {
    expect(sellerVatOf(house("B"), 3800000)).toBe(0); // 满五
    expect(sellerVatOf(house("C"), 6000000)).toBe(0); // 新房
    expect(sellerVatOf(house("F"), 5500000)).toBe(round2(5500000 * 0.05 * 1.12));
  });

  it("卖方个税：满五唯一 / 新房免征；买卖否则核定 1%；继承按差额 20%", () => {
    expect(sellerIncomeTax(house("B"), 3800000)).toBe(0);
    expect(sellerIncomeTax(house("C"), 6000000)).toBe(0);
    expect(sellerIncomeTax(house("F"), 5500000)).toBe(55000);
    const inherit = { ...house("B"), acq: "inherit" as const, unique: false, base: 1000000 };
    expect(sellerIncomeTax(inherit, 3800000)).toBe(round2((3800000 - 1000000) * 0.2));
    const noBase = { ...house("B"), acq: "inherit" as const, unique: false, base: 0 };
    expect(sellerIncomeTax(noBase, 3800000)).toBe(round2(3800000 * 0.2));
  });
});

describe("自定义房源 defaultCustom / syncCustom", () => {
  it("默认口径：450 万 · 90㎡ · 外环内 · 满五唯一 · 买卖取得", () => {
    const c = defaultCustom();
    expect(c.price).toBe(4500000);
    expect(c.area).toBe("90㎡");
    expect(c.ring).toBe("内");
    expect(c.holdYears).toBe(5);
    expect(c.unique).toBe(true);
    expect(c.negotiable).toBe(0.05);
  });

  it("syncCustom 按「持有年限 × 唯一 × 取得方式」重推标签与面积整数化", () => {
    const c = { ...defaultCustom(), holdYears: 0, unique: false, area: "88.6" };
    syncCustom(c);
    expect(c.area).toBe("89㎡");
    expect(c.tag).toBe("不满 2 年 · 全额增值税");
    expect(c.tagCls).toBe("badge-hair");

    const c2 = { ...defaultCustom(), holdYears: 5, unique: true };
    syncCustom(c2);
    expect(c2.tag).toBe("满五唯一");
    expect(c2.tagCls).toBe("badge-sky");

    const c3 = { ...defaultCustom(), holdYears: 2, unique: false, acq: "inherit" as const };
    syncCustom(c3);
    expect(c3.tag).toBe("满二不唯一 · 继承所得");
    expect(c3.tagCls).toBe("badge-fog");
  });
});

describe("derive 税费 / 首付 / 需现金", () => {
  it("无身份或无房源时直接返回（不产生半截金额）", () => {
    const S = createInitialState();
    derive(S);
    expect(S.deal).toBe(0);
    expect(S.need).toBe(0);
  });

  it("刚需首套 × B 房（满五唯一）× 组合贷：契税 1%、免卖方税费", () => {
    const S = state("first", "B");
    S.slash = 0.05; // B 房底线 5%
    derive(S);
    expect(S.deal).toBe(3800000);
    expect(S.deposit).toBe(190000); // 成交价 5%
    expect(S.areaNum).toBe(88);
    expect(S.deedTax).toBe(38000);
    expect(S.agentFee).toBe(76000);
    expect(S.taxes).toBe(38000 + 76000 + 80);
    expect(S.vat).toBe(0);
    expect(S.vatAdd).toBe(0);
    expect(S.sellerTax).toBe(0);
    expect(S.netTax).toBe(0);
    expect(S.downRate).toBe(0.2); // 首套组合贷
    expect(S.down).toBe(760000);
    expect(S.gjjTopUp).toBe(0);
    expect(S.need).toBe(760000 + 114080);
  });

  it("投资二套 × F 房（不满 2 年）× 纯公积金 + 到手价：转嫁税费 + 公积金额度补足", () => {
    const S = state("invest", "F", "gjj");
    S.netDeal = true;
    derive(S);
    expect(S.deal).toBe(5500000);
    expect(S.vat).toBe(round2(5500000 * 0.05 * 1.12)); // 308000（含附加口径）
    expect(S.vatAdd).toBe(round2(S.vat * 0.12));
    expect(S.sellerTax).toBe(55000);
    expect(S.netTax).toBe(S.vat + S.vatAdd + S.sellerTax);
    expect(S.downRate).toBe(0.25); // 二套外环内
    expect(S.gjjTopUp).toBe(4125000 - GJJ_CAP_SECOND); /* 二套家庭上限 200 万（含补充公积金） */
    expect(S.down).toBe(1375000 + S.gjjTopUp);
    expect(S.deedTax).toBe(55000);
    expect(S.taxes).toBe(55000 + 110000 + 80);
    expect(S.need).toBe(S.down + S.taxes + S.netTax);
    expect(S.loan.gjj).toBe(GJJ_CAP_SECOND);
    expect(S.loan.comm).toBe(0);
  });

  it("到手价转嫁随 netDeal 开关（未答应 = 0）", () => {
    const S = state("first", "F");
    derive(S);
    expect(S.sellerTax).toBe(55000);
    expect(S.netTax).toBe(0);
    S.netDeal = true;
    derive(S);
    expect(S.netTax).toBe(S.vat + S.vatAdd + S.sellerTax);
  });

  it("首付可在最低之上加档；低于最低档按最低执行", () => {
    const S = state("first", "B");
    S.downSel = 0.5;
    derive(S);
    expect(S.downRate).toBe(0.5);
    expect(S.down).toBe(2000000);
    expect(S.loan.gjj + S.loan.comm).toBe(2000000);

    const low = state("first", "B");
    low.downSel = 0.15; // 组合贷最低 20%
    derive(low);
    expect(low.downRate).toBe(0.2);
    expect(low.down).toBe(800000);
  });

  it("全款 100%：无贷款、无月供、无公积金额度补足", () => {
    const S = state("first", "B");
    S.downSel = 1;
    derive(S);
    expect(S.downRate).toBe(1);
    expect(S.down).toBe(S.deal);
    expect(S.loan).toEqual({ gjj: 0, comm: 0, monthly: 0, totalInt: 0 });
    expect(S.gjjTopUp).toBe(0);
  });
});

describe("money / 汇总与现金口径", () => {
  it("deal 为 0 时返回零口径（不出现 NaN）", () => {
    const m = money(createInitialState());
    expect(m.deal).toBe(0);
    expect(m.need).toBe(0);
    expect(m.total).toBe(0);
    expect(m.lessons).toBe(0);
  });

  it("money 与 derive 同源：base = 房款首付 + 买方税费；total = need + 学费", () => {
    const S = state("first", "B");
    S.slash = 0.05;
    derive(S);
    const m = money(S);
    expect(m.deal).toBe(S.deal);
    expect(m.down).toBe(round2(S.deal * S.downRate));
    expect(m.downCash).toBe(S.down);
    expect(m.shortfall).toBe(S.gjjTopUp);
    expect(m.deedTax).toBe(S.deedTax);
    expect(m.agentFee).toBe(S.agentFee);
    expect(m.base).toBe(round2(S.down + S.taxes));
    expect(m.need).toBe(S.need);
    expect(m.total).toBe(round2(S.need + m.lessons));
  });

  it("avail / handCash / gap / paid：现金口径与已出款", () => {
    const S = state("first", "B");
    S.slash = 0.05;
    derive(S);
    S.cash = 1000000;
    S.borrowed = 300000;
    S.cash += 300000;
    expect(avail(S)).toBe(1300000);
    expect(handCash(S)).toBe(1000000);
    expect(gap(S)).toBe(Math.max(0, round2(S.need - S.cash)));
    S.paid = 190000;
    expect(paid(S)).toBe(190000);
  });

  it("追加首付金额与文案按实际首付档算", () => {
    const S = state("first", "B");
    derive(S);
    expect(addDownAmount(S, 0.5)).toBe(round2(S.deal * 0.5 - S.deal * 0.2));
    expect(addDownText(S, 0.5)).toBe("首付提到 50% · 多掏 " + fmt(addDownAmount(S, 0.5)) + " 万");
  });

  it("lossRows：到手价转入多花清单（学费单 + 「到手价」）", () => {
    const S = state("first", "F");
    S.netDeal = true;
    derive(S);
    const rows = lossRows(S);
    expect(rows).toHaveLength(1);
    expect(rows[0].k).toBe("netprice");
    expect(rows[0].cost).toBe(S.netTax);
    S.lessons = [{ k: "chan", short: "产调", stage: "过户", cost: 12000, days: 15, text: "", src: "", fix: "" }];
    expect(lossRows(S).map((r) => r.k)).toEqual(["netprice", "chan"]);
    expect(lessonCost(S)).toBe(12000); /* 学费单以「元」记账，与其余金额同单位 */
  });
});

describe("贷款：额度 / 分摊 iloan / 风控线", () => {
  it("loanCap 仅纯公积金有限额；loanPrincipal 取 min(房款 − 首付, 上限)", () => {
    const S = state("first", "B");
    derive(S);
    expect(loanCap(S)).toBe(Infinity);
    expect(loanPrincipal(S)).toBe(round2(S.deal - S.deal * S.downRate));
    S.loanType = "gjj";
    derive(S);
    expect(loanCap(S)).toBe(gjjCap(S)); /* 首套家庭上限 240 万 */
    expect(loanPrincipal(S)).toBe(gjjCap(S));
  });

  it("公积金额度按最新政策与套数认定：首套家庭 240 万 / 二套 200 万（含补充公积金）", () => {
    const first = state("first", "B");
    expect(gjjCap(first)).toBe(GJJ_CAP_FIRST);
    const trade = state("trade", "B");
    expect(gjjCap(trade)).toBe(GJJ_CAP_FIRST); /* 置换原房已售 → 名下 0 套，按首套认定 */
    const invest = state("invest", "B");
    expect(gjjCap(invest)).toBe(GJJ_CAP_SECOND);
    /* 超上限的部分必须现金补足（B 房 400 万 · 首付 20% → 贷款 320 万 > 240 万） */
    first.loanType = "gjj";
    derive(first);
    expect(first.gjjTopUp).toBe(3200000 - GJJ_CAP_FIRST);
    expect(first.loan.gjj).toBe(GJJ_CAP_FIRST);
    expect(money(first).shortfall).toBe(first.gjjTopUp);
  });

  it("iloan：商贷全额 / 公积金封顶（首套 240 万）/ 组合贷 40% 公积金（封顶）+ 商贷补足", () => {
    const comm = state("first", "B", "comm");
    derive(comm);
    expect(comm.loan.gjj).toBe(0);
    expect(comm.loan.comm).toBe(round2(comm.deal - comm.down));
    expect(comm.loan.totalInt).toBeCloseTo(comm.loan.monthly * comm.loanYears * 12 - comm.loan.comm, 6);

    const combo = state("first", "B", "combo");
    derive(combo);
    const loan = combo.deal - combo.down;
    expect(combo.loan.gjj).toBe(Math.min(loan * 0.4, GJJ_CAP_FIRST));
    expect(combo.loan.comm).toBeCloseTo(loan - combo.loan.gjj, 6);
    expect(combo.loan.monthly).toBeGreaterThan(0);

    const gjj = state("first", "B", "gjj");
    derive(gjj);
    expect(gjj.loan.gjj).toBe(GJJ_CAP_FIRST);
    expect(gjj.loan.comm).toBe(0);
  });

  it("loanRate 取身份商贷利率；incomeRatio 为月供占家庭月收入 %", () => {
    const S = state("first", "B");
    derive(S);
    expect(loanRate(S)).toBe(ROLES.first.commRate);
    expect(incomeRatio(S)).toBe(Math.round((S.loan.monthly / INCOME) * 100));
  });

  it("overRisk：月供超收入 50% 判为越线；追加首付档可压回线下", () => {
    const S = state("first", "F");
    S.loanYears = 10;
    derive(S);
    expect(overRisk(S)).toBe(true);
    expect(minDownToClear(S)).toBe(0.7);
    expect(monthlyOf(S, minDownToClear(S)) / INCOME).toBeLessThanOrEqual(0.5);

    const ok = state("first", "B");
    derive(ok);
    expect(overRisk(ok)).toBe(false);
  });

  it("firstPayFor：50% 档网签付 20% 房款、20% 档网签付清、全款先付 30% 房款", () => {
    const half = state("first", "B");
    half.downSel = 0.5;
    derive(half);
    const first = firstPayFor(half);
    expect(first).toBe(round2(half.deal * 0.2 - half.deposit));
    expect(half.down - half.deposit - first).toBe(round2(half.deal * 0.3));

    const base = state("first", "B");
    derive(base);
    expect(base.downRate).toBe(0.2);
    expect(base.down - base.deposit - firstPayFor(base)).toBe(0);

    const cash = state("first", "B");
    cash.downSel = 1;
    derive(cash);
    expect(firstPayFor(cash)).toBe(round2(cash.deal * 0.3));
    expect(cash.down - cash.deposit - firstPayFor(cash)).toBe(round2(cash.deal * 0.65));
  });
});

describe("经历周期时间线（stageDays / expDays / elapsed）", () => {
  it("经历天数从常规区间抽取，抽到下限 / 上限都对；同一次运行内固定（重抽无效）", () => {
    const S = createInitialState();
    const sel = screenMeta("select"); // 2-8 周 = 14-56 天
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(stageDays(S, sel)).toBe(sel.days![0]);
    vi.spyOn(Math, "random").mockReturnValue(0.999);
    expect(stageDays(S, sel)).toBe(sel.days![0]); // 已缓存，不再重抽
    expect(S.drawn.select).toBe(sel.days![0]);

    const S2 = createInitialState();
    vi.spyOn(Math, "random").mockReturnValue(0.999);
    expect(stageDays(S2, sel)).toBe(sel.days![1]);
  });

  it("无 days 的屏（real = —）不抽、不累加", () => {
    const S = createInitialState();
    expect(stageDays(S, screenMeta("start"))).toBe(0);
    expect(stageDays(S, screenMeta("blocked"))).toBe(0);
  });

  it("expDays = 今天（第 1 天）+ 走过的非同期段；par 段抽到天数但不累加", () => {
    const S = createInitialState();
    vi.spyOn(Math, "random").mockReturnValue(0);
    S.walked = ["select", "qa"]; // qa 为 par（与看房同期）
    expect(expDays(S)).toBe(1 + screenMeta("select").days![0]);
    // par 段照常抽取并可展示
    expect(stageDays(S, screenMeta("qa"))).toBe(screenMeta("qa").days![0]);
    expect(expDays(S)).toBe(1 + screenMeta("select").days![0]);
  });

  it("elapsed = expDays + 坑拖出来的天（lessons.days 合计）", () => {
    const S = createInitialState();
    vi.spyOn(Math, "random").mockReturnValue(0);
    S.lessons = [
      { k: "chan", short: "", stage: "", cost: 1.2, days: 15, text: "", src: "", fix: "" },
      { k: "owner", short: "", stage: "", cost: 0, days: 7, text: "", src: "", fix: "" },
    ];
    expect(pitDays(S)).toBe(22);
    expect(elapsed(S)).toBe(expDays(S) + 22);
  });

  it("timeScale：期条以 90 天为刻度，暖色带为 30-90 天常规区间", () => {
    expect(timeScale(0).base).toBe(0);
    expect(timeScale(45).base).toBeCloseTo(50, 6);
    expect(timeScale(200).base).toBe(100);
    expect(timeScale(45).rangeAt).toBeCloseTo((REAL_MIN / REAL_MAX) * 100, 6);
    expect(timeScale(45).rangeW).toBeCloseTo(((REAL_MAX - REAL_MIN) / REAL_MAX) * 100, 6);
  });

  it("流程元数据自洽：24 屏、下标递增、real 与 days 区间一致、NODE_DAYS 覆盖 12 节点", () => {
    expect(SCREENS).toHaveLength(24);
    expect(SCREENS[0].k).toBe("start");
    expect(SCREENS[SCREENS.length - 1].k).toBe("final");
    SCREENS.forEach((m, i) => {
      expect(screenIdx(m.k)).toBe(i);
      expect(screenMeta(m.k)).toBe(m);
      if (m.days) {
        expect(m.real).not.toBe("—");
        expect(m.days[0]).toBeLessThanOrEqual(m.days[1]);
      }
    });
    /* 不摆时间条的屏（选身份 / 填表 / 算账 / 成交落价 / 总账）不编天数 */
    expect(SCREENS.filter((m) => !m.days).map((m) => m.k)).toEqual([
      "start", "role", "cash", "custom", "blocked", "nego3", "feeNego", "loanType", "funds", "final",
    ]);
    /* 同期段：抽天数但不累加（资格与看房同期、砍价在看房里谈、网签与签约同趟、筹钱同期） */
    expect(SCREENS.filter((m) => m.par).map((m) => m.k)).toEqual(["qa", "nego1", "nego2", "borrow", "signNet"]);
    expect(NODE_DAYS).toHaveLength(12);
    expect(screenMeta("blocked").node).toBe(2);
    expect(NODE_DAYS).toHaveLength(SCREENS[SCREENS.length - 1].node + 1);
  });
});

describe("限购判定 judgeQA 与问答树 buildQA", () => {
  it("沪籍：外环外不限套数；外环内限购 2 套（投资二套 1 套仍可购）", () => {
    const s1 = state("first", "B");
    s1.ans = { hukou: "sh" };
    expect(judgeQA(s1).ok).toBe(true);

    const outer = state("first", "C"); // 外环外
    outer.ans = { hukou: "sh" };
    expect(judgeQA(outer).ok).toBe(true);

    const inv = state("invest", "B"); // 名下 1 套 < 2
    inv.ans = { hukou: "sh" };
    expect(judgeQA(inv).ok).toBe(true);
  });

  it("非沪籍持居住证满 5 年：全市限购 1 套（名下 1 套即不符合）", () => {
    const s1 = state("first", "B");
    s1.ans = { hukou: "non-sh", permit: "yes" };
    expect(judgeQA(s1).ok).toBe(true);

    const s2 = state("invest", "B");
    s2.ans = { hukou: "non-sh", permit: "yes" };
    expect(judgeQA(s2).ok).toBe(false);
  });

  it("非沪籍社保不满 1 年：外环内外都无资格", () => {
    const inner = state("first", "B");
    inner.ans = { hukou: "non-sh", permit: "no", years: "l1" };
    expect(judgeQA(inner).ok).toBe(false);
    const outer = state("first", "C");
    outer.ans = { hukou: "non-sh", permit: "no", years: "l1" };
    expect(judgeQA(outer).ok).toBe(false);
  });

  it("非沪籍社保满 1 年：外环外不限；外环内名下 0 套可购、1 套限购", () => {
    const outer = state("first", "C");
    outer.ans = { hukou: "non-sh", permit: "no", years: "m1-3" };
    expect(judgeQA(outer).ok).toBe(true);

    const zero = state("first", "B");
    zero.ans = { hukou: "non-sh", permit: "no", years: "m1-3" };
    expect(judgeQA(zero).ok).toBe(true);

    const one = state("invest", "B");
    one.ans = { hukou: "non-sh", permit: "no", years: "m1-3" };
    expect(judgeQA(one).ok).toBe(false);
  });

  it("非沪籍社保满 3 年：外环内限购 2 套（1 套仍可再购）", () => {
    const S = state("invest", "B");
    S.ans = { hukou: "non-sh", permit: "no", years: "m3p" };
    expect(judgeQA(S).ok).toBe(true);
  });

  it("buildQA：沪籍只问户籍；非沪籍加居住证；未满 5 年再加社保年限", () => {
    const S = createInitialState();
    S.ans = { hukou: "sh" };
    expect(buildQA(S)).toEqual(["hukou"]);
    S.ans = { hukou: "non-sh", permit: "yes" };
    expect(buildQA(S)).toEqual(["hukou", "permit"]);
    S.ans = { hukou: "non-sh", permit: "no" };
    expect(buildQA(S)).toEqual(["hukou", "permit", "years"]);
    expect(Object.keys(QA_DEFS)).toEqual(["hukou", "permit", "years"]);
  });
});

describe("多轮砍价 nego2Options", () => {
  it("第一轮 chip 决定底线是否越线（NEGO_R1 三档幅度固定）", () => {
    expect(NEGO_R1.hard.chip).toBe(0.06);
    expect(NEGO_R1.soft.chip).toBe(0.03);
    expect(NEGO_R1.chat.chip).toBe(0);
  });

  it("第一轮 chat（未越线，B 房底线 5%）：再压 1 个点 / 按 0% 成交 / 直接压到底线", () => {
    const S = state("first", "B");
    S.negoR1 = "chat";
    expect(nego2Options(S).map((o) => [o.k, o.slash])).toEqual([["push", 0.01], ["hold", 0], ["bottom", 0.05]]);
    expect(findN2Option(S, "bottom")!.slash).toBe(0.05);
    expect(findN2Option(S, "nope")).toBeNull();
  });

  it("已压到房东底线时不再摆「再压 1 个点」与重复的「直接压到底线」", () => {
    const S = state("first", "B"); // 底线 5%
    S.negoR1 = "hard"; // chip 6% > 5%
    const opts = nego2Options(S);
    expect(opts.map((o) => o.k)).toEqual(["hold"]);
    expect(opts[0].slash).toBe(0.06);
  });

  it("push 不越过房东底线（B 房 soft 3% → push 4% < 底线 5%）", () => {
    const S = state("first", "B");
    S.negoR1 = "soft";
    const opts = nego2Options(S);
    expect(opts.find((o) => o.k === "push")!.slash).toBe(0.04);
    expect(opts.every((o) => o.slash <= 0.05)).toBe(true);
  });
});

describe("签约深坑：mineList / settleMines", () => {
  it("清单 12 项拆两屏各 6 项；没写进合同（含「先不写」）都算埋雷", () => {
    expect(SIGN_ITEMS).toHaveLength(12);
    expect(SIGN_ITEMS.filter((it) => it.half === "sign")).toHaveLength(6);
    expect(SIGN_ITEMS.filter((it) => it.half === "signNet")).toHaveLength(6);
    expect(HAND_ITEMS).toHaveLength(4);

    const S = createInitialState();
    expect(mineList(S)).toHaveLength(12);
    S.con = { chan: "do" };
    expect(mineList(S).map((m) => m.k)).not.toContain("chan");
    S.con = { chan: "no" };
    const chan = mineList(S).find((m) => m.k === "chan")!;
    expect(chan.explicit).toBe(true);
    expect(chan.at).toBe("transfer");
    expect(S.con).toBeDefined();
  });

  it("omit.at 必须晚于所在屏：签字屏的雷不在签字屏爆", () => {
    const signKeys = SIGN_ITEMS.filter((it) => it.half === "sign").map((it) => it.k);
    for (const it of SIGN_ITEMS) {
      expect(screenIdx(it.omit.at), it.k).toBeGreaterThan(screenIdx(it.half === "sign" ? "sign" : "signNet"));
    }
    expect(signKeys).toHaveLength(6);
  });

  it("到站结算：埋的雷爆成学费单（含天数与压力），同屏只结一次", () => {
    const S = createInitialState();
    S.con = {};
    const stress0 = S.stress;
    settleMines(S, "transfer"); // 只有 chan 到站
    expect(S.lessons.map((l) => l.k)).toEqual(["chan"]);
    expect(S.burst).toHaveLength(1);
    expect(S.burst[0].cost).toBe(12000); /* SIGN_ITEMS 里是万元（1.2 万），落账转元 */
    expect(S.burst[0].days).toBe(15);
    expect(S.stress).toBe(Math.min(100, stress0 + 22));

    settleMines(S, "transfer"); // 重复进场不重复结算
    expect(S.lessons).toHaveLength(1);
  });

  it("未到站 / 已写清：不产生学费单", () => {
    const S = createInitialState();
    S.con = {};
    settleMines(S, "sign");
    expect(S.burst).toHaveLength(0);
    expect(S.lessons).toHaveLength(0);

    const done = createInitialState();
    SIGN_ITEMS.forEach((it) => { done.con[it.k] = "do"; });
    settleMines(done, "settle");
    expect(done.burst).toHaveLength(0);
  });
});

describe("出款点金额 payAmount", () => {
  it("定金 / 首付先付 / 补足剩余首付与首付分期同口径", () => {
    const S = state("first", "B");
    S.slash = 0.05;
    derive(S);
    expect(payAmount(S, "deposit")).toBe(S.deposit);
    expect(payAmount(S, "firstPay")).toBe(firstPayFor(S));
    expect(payAmount(S, "restPay")).toBe(Math.max(0, round2(S.down - S.deposit - firstPayFor(S))));
    expect(payAmount(S, "restPay")).toBe(0); // 20% 档网签即付清
  });

  it("缴税 = 契税 + 中介费 + 登记费 + 到手价转嫁；尾款扣押 = 合同价 1%", () => {
    const S = state("first", "F");
    S.netDeal = true;
    derive(S);
    const m = money(S);
    expect(payAmount(S, "transfer")).toBe(round2(m.deedTax + m.agentFee + m.reg + m.sellerTax));
    expect(payAmount(S, "holdback")).toBe(round2(S.deal * 0.01));
    expect(PAY_KINDS.holdback.noCash).toBe(true);
    expect(PAY_KINDS.holdback.next).toBeNull();
  });

  it("筹钱三条渠道上限合计 70 万；缺口超出上限只能换房", () => {
    expect(BORROW_CAPS).toEqual({ family: 30, gjj: 20, credit: 20 });
    expect(BORROW_CAP).toBe(70);
    const S = state("first", "E");
    derive(S); // E 房 1600 万：需现金远超现金 + 70 万
    S.cash = 500000;
    expect(borrowOverflow(S)).toBe(true);
    const rich = state("first", "B");
    derive(rich);
    rich.cash = rich.need + 1;
    expect(borrowOverflow(rich)).toBe(false);
  });
});