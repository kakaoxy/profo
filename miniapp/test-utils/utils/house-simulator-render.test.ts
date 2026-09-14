/**
 * 购房模拟器 · HUD 构建（buildHud）单测.
 *
 * 覆盖现金警示口径：判据是「当前现金 vs 尚待支付的现金」，而非一整笔 need——
 * 定金在签约屏付讫、首付在监管屏扣除，已发生扣款的屏必须把已付款项从 need 中摘除，
 * 否则会把已付款项重复计入，出现「钱够却报现金不足」的假警示。
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createInitialState, HOUSES, ROLES, SimState } from "../../pages/house-simulator/utils/constants";
import { derive } from "../../pages/house-simulator/utils/calc";
import { buildHud, calModal, buildCalGrid, realOf } from "../../pages/house-simulator/utils/render";
import { handleAction, HandlerCtx } from "../../pages/house-simulator/utils/handlers";

/* wx API 存根（handlers 内 toast 使用）. */
beforeAll(() => {
  (globalThis as unknown as Record<string, unknown>).wx = { showToast: () => {} };
});

/** 事件回调桩：HUD 用例只用 lcPay/escrowOk→payOk 的状态位移，不关心页面回调. */
const call = {
  data: { modal: { pay: { kind: "escrow" } } },
  setData: () => {},
  nextScene: () => {},
  render: () => {},
  resetAll: () => {},
  closeModal: () => {},
  /* payOk 只读 data.modal.pay.kind 扣款，桩里固定为 escrow 即可. */
  openPayModal: () => {},
  openCalModal: () => {},
} as unknown as HandlerCtx;

/**
 * F 房（550 万 · 不满 2 年 · 未砍价）+ 到手价 + 组合贷 20 年（月供超风控线）。
 * cashWan = 现金屏金额（万元）；定金已在签约屏付讫，故此刻现金 = 金额 − 定金。
 */
function atLoanChkRisk(cashWan: number): ReturnType<typeof createInitialState> {
  const S = createInitialState();
  S.role = ROLES.first;
  S.house = HOUSES.find((h) => h.id === "F")!;
  S.cashSet = true;
  S.loanType = "combo";
  S.agentRate = 0.02;
  S.netDeal = true;
  S.slash = 0;
  S.loanYears = 20;
  derive(S);
  S.cash = cashWan * 10000 - S.deposit;
  return S;
}

describe("HUD 现金警示（尚待支付口径）", () => {
  it("借款后 HUD 右上角展示累计借款；未借款不显示", () => {
    const S = createInitialState();
    expect(buildHud(S).borrowed).toBe(false);
    S.borrowed = 300000;
    const hud = buildHud(S);
    expect(hud.borrowed).toBe(true);
    expect(hud.borrowedText).toBe("30.00万");
  });

  it("签约屏：定金未付，判据为需现金全额", () => {
    const S = atLoanChkRisk(242);
    S.scene = "sign";
    expect(S.cash).toBeGreaterThan(S.need);
    expect(buildHud(S).cashLow).toBe(false);
    S.cash = S.need - 1;
    expect(buildHud(S).cashLow).toBe(true);
  });

  it("监管屏：定金已扣，只比 需现金 − 定金，钱够不得假警示", () => {
    const S = atLoanChkRisk(242);
    S.scene = "loanChk";
    handleAction(call, S, "lcPay"); // 追加首付 79 万 → 需现金 241.81 万
    S.scene = "escrow";
    expect(S.cash).toBeLessThan(S.need); // 214.50 万 < 241.81 万：按 need 全额比会误报
    expect(S.cash).toBeGreaterThan(S.need - S.deposit); // 214.50 万 > 待付 214.31 万
    expect(buildHud(S).cashLow).toBe(false);
  });

  it("过户屏：首付已入监管，只比 需现金 − 首付", () => {
    const S = atLoanChkRisk(289);
    S.scene = "loanChk";
    handleAction(call, S, "lcPay");
    handleAction(call, S, "escrowOk"); // 弹付款确认（不扣款）
    handleAction(call, S, "payOk"); // 确认支付 → 冲抵定金扣首付尾款
    S.scene = "transfer";
    expect(S.cash).toBeLessThan(S.need);
    expect(S.cash).toBeGreaterThan(S.need - S.down);
    expect(buildHud(S).cashLow).toBe(false);
  });
});

describe("模拟日历 · 时间快进（calModal / buildCalGrid）", () => {
  it("申贷 → 审批结果：gap=7 天（贷款审批 7 天），目标名「贷款审批结果」", () => {
    const S = createInitialState();
    S.scene = "loan";
    const m = calModal(S, "loanChk");
    expect(m.type).toBe("cal");
    expect(m.cal!.toName).toBe("贷款审批结果");
    expect(m.cal!.gap).toBe(7);
    expect(m.cal!.done).toBe(false);
    expect(m.cal!.progress).toBe(0);
    expect(m.cal!.phase.length).toBeGreaterThan(0);
    expect(m.cal!.note.length).toBeGreaterThan(0);
    expect(m.cal!.risk.length).toBeGreaterThan(0);
  });

  it("过户缴税 → 出证：gap=7 天（过户审税 7 天）", () => {
    const S = createInitialState();
    S.scene = "transfer";
    const m = calModal(S, "deed");
    expect(m.cal!.toName).toBe("领证");
    expect(m.cal!.gap).toBe(7);
  });

  it("前期无等待：网签→贷款 gap=0、funds→borrow gap=0（页面侧拦截不再弹日历）", () => {
    const S = createInitialState();
    S.scene = "funds";
    expect(calModal(S, "borrow").cal!.gap).toBe(0);
    const s2 = createInitialState();
    s2.scene = "signNet";
    expect(calModal(s2, "loan").cal!.gap).toBe(0);
  });

  it("day 1 起点与 day 8 终点分别落在真实日期：间隔 7 个自然日", () => {
    const a = realOf(1);
    const b = realOf(8);
    expect(Math.round((b.getTime() - a.getTime()) / 86400000)).toBe(7);
  });

  it("buildCalGrid：42 格网格，定位日期 cur 唯一高亮，跨月换月重建", () => {
    const d = realOf(14);
    const g = buildCalGrid(d);
    expect(g.cells.length).toBe(42);
    expect(g.cells.filter((c) => c.d === d.getDate() && c.cur).length).toBe(1);
    expect(g.month).toContain("年");
    // 跨月：月末 +2 天 → 月份不同
    const e = new Date(d.getFullYear(), d.getMonth(), 28);
    const g2 = buildCalGrid(e);
    const g3 = buildCalGrid(new Date(e.getFullYear(), e.getMonth() + 1, 7));
    expect(g3.month).not.toBe(g2.month);
  });
});
