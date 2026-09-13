/**
 * 购房模拟器 · HUD 构建（buildHud）单测.
 *
 * 覆盖现金警示口径：判据是「当前现金 vs 尚待支付的现金」，而非一整笔 need——
 * 定金在签约屏付讫、首付在监管屏扣除，已发生扣款的屏必须把已付款项从 need 中摘除，
 * 否则会把已付款项重复计入，出现「钱够却报现金不足」的假警示。
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createInitialState, HOUSES, ROLES } from "../../pages/house-simulator/utils/constants";
import { derive } from "../../pages/house-simulator/utils/calc";
import { buildHud } from "../../pages/house-simulator/utils/render";
import { handleAction, HandlerCtx } from "../../pages/house-simulator/utils/handlers";

/* wx API 存根（handlers 内 toast 使用）. */
beforeAll(() => {
  (globalThis as unknown as Record<string, unknown>).wx = { showToast: () => {} };
});

/** 事件回调桩：HUD 用例只用 lcPay/escrowOk 的状态位移，不关心页面回调. */
const call = {
  setData: () => {},
  nextScene: () => {},
  render: () => {},
  resetAll: () => {},
  closeModal: () => {},
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
    handleAction(call, S, "escrowOk");
    S.scene = "transfer";
    expect(S.cash).toBeLessThan(S.need);
    expect(S.cash).toBeGreaterThan(S.need - S.down);
    expect(buildHud(S).cashLow).toBe(false);
  });
});
