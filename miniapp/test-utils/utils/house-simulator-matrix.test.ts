/**
 * 购房模拟器 · 全矩阵走查（3 身份 × 5 现金档 × 6 预设房源 = 90 组合）.
 *
 * 用确定性策略自动走完购房全流程（选房 → 资格 → 砍价 → 算账 → 筹钱 → 签约 → 网签 →
 * 贷款 → 过户 → 交房 → 结算），验证：无死胡同（每步都有出口）、全程现金不为负、
 * 借满仍缺或月供超线时能靠「换更便宜的房子」走通（而不是卡死）。
 * 经历周期随机抽取统一固定（Math.random → 0.5），保证可复现。
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../../pages/house-simulator/utils/constants";
import type { RoleKey, SimState } from "../../pages/house-simulator/utils/constants";
import { gap, overRisk, settleMines, elapsed } from "../../pages/house-simulator/utils/calc";
import { handleAction } from "../../pages/house-simulator/utils/handlers";
import type { HandlerCtx, HandlerData } from "../../pages/house-simulator/utils/handlers";
import { emptyModal, payModal } from "../../pages/house-simulator/utils/render";
import type { PayKind } from "../../pages/house-simulator/utils/flow";

beforeAll(() => {
  (globalThis as unknown as Record<string, unknown>).wx = {
    showToast: () => {},
    getStorageSync: () => [],
    setStorageSync: () => {},
    removeStorageSync: () => {},
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** 测试桩页面：镜像 index.ts 的薄方法（nextScene 负责记账与结算）. */
class FakePage implements HandlerCtx {
  data: HandlerData = { formCash: "", custPrice: "", custArea: "", custBase: "", modal: emptyModal() };
  constructor(public S: SimState) {}
  setData(patch: Record<string, unknown>): void {
    Object.assign(this.data, patch);
  }
  render(): void {}
  nextScene(k: SimState["scene"]): void {
    this.S.scene = k;
    if (this.S.walked.indexOf(k) < 0) {
      this.S.walked.push(k);
    }
    settleMines(this.S, k);
    this.S.day = elapsed(this.S);
  }
  resetAll(): void {}
  openPayModal(kind: PayKind): void {
    this.setData({ modal: payModal(this.S, kind, 0) });
  }
  closeModal(): void {
    this.setData({ modal: emptyModal() });
  }
  confirmRisk(): void {}
}

type WalkResult = "final" | "blocked" | "stuck";

interface WalkOutcome {
  result: WalkResult;
  S: SimState;
  /** 全程最低现金（断言「现金不为负」用）. */
  minCash: number;
}

/**
 * 自动走完一条组合：确定性策略 + 记录最低现金。
 * 借满仍缺 / 月供超线时换更便宜的房子（A）重走（bounced）。
 */
function walk(roleKey: RoleKey, cashWan: number, houseId: string): WalkOutcome {
  const p = new FakePage(createInitialState());
  const S = p.S;
  const id = { current: houseId, bounced: false };
  let minCash = S.cash;

  const act = (a: string): void => {
    handleAction(p, S, a);
    minCash = Math.min(minCash, S.cash);
  };

  act("next"); // 开场 → 身份
  act("role:" + roleKey);
  act("next"); // → 现金
  act("cash:" + cashWan);
  act("next"); // → 选房

  for (let step = 0; step < 120; step++) {
    switch (S.scene) {
      case "final":
        return { result: "final", S, minCash };
      case "select": {
        if (id.bounced) {
          id.current = "A"; // 换最便宜的房子重走
        }
        act("house:" + id.current);
        id.bounced = false;
        act("next"); // 选房 + 已选房源 → 资格核验
        break;
      }
      case "qa":
        act("qa:hukou:sh"); // 沪籍：外环外不限、外环内限购 2 套（投资 1 套仍可购）
        break;
      case "blocked":
        act("next");
        break;
      case "nego1":
        act("n1:soft"); // 试探出价 3%：不越过任何预设房源的底线
        break;
      case "nego2":
        act(S.negoCap ? "n2Accept" : "n2:hold");
        break;
      case "nego3":
        act(S.vat + S.sellerTax > 0 ? "net:no" : "next"); // 不接受卖方税费转嫁
        break;
      case "feeNego":
        act("fee:0.01");
        break;
      case "loanType":
        act("lt:combo");
        act("next");
        break;
      case "funds":
        act("fundsNext"); // 缺口 → 筹钱；充足 → 签约
        break;
      case "borrow": {
        if (gap(S) <= 0) {
          act("next"); // 缺口已补齐 → 签约
          break;
        }
        if (!S.usedBorrow.family) {
          act("bor:family");
          break;
        }
        if (!S.usedBorrow.gjj) {
          act("bor:gjj");
          break;
        }
        if (!S.usedBorrow.credit) {
          act("bor:credit");
          break;
        }
        act("changeHouse"); // 三渠道借满仍缺 → 换更便宜的房子
        id.bounced = true;
        break;
      }
      case "sign":
        act("pay:deposit");
        act("payOk");
        break;
      case "signNet":
        act("pay:firstPay");
        act("payOk");
        break;
      case "loan":
        act("next");
        break;
      case "loanChk":
        if (S.loanRejected || overRisk(S)) {
          act(S.loanYears < 30 ? "lc:long" : "lc:change"); // 拉长年限，或换更便宜的房子
          if (String(S.scene) === "select") {
            id.bounced = true;
          }
        } else {
          act("next");
        }
        break;
      case "loanContract":
        act("pay:restPay");
        act("payOk");
        break;
      case "transfer":
        act("next");
        break;
      case "deed":
        act("pay:transfer");
        act("payOk");
        break;
      case "handover":
        act("ho:ok");
        break;
      case "settle":
        if (S.handHold) {
          act("pay:holdback");
          act("payOk");
        } else {
          act("next");
        }
        break;
      default:
        /* 装修屏：本矩阵只走购房流程（直接入住） */
        if (S.scene.indexOf("renov") === 0) {
          act("renovSkip");
          break;
        }
        return { result: "stuck", S, minCash }; // 未覆盖场景 = 死胡同
    }
  }
  return { result: "stuck", S, minCash };
}

describe("全矩阵走查：3 身份 × 5 现金档 × 6 预设房源 = 90 组合", () => {
  const roles: RoleKey[] = ["first", "trade", "invest"];
  const cashes = [50, 70, 100, 200, 300];
  const ids = ["A", "B", "C", "D", "E", "F"];

  for (const role of roles) {
    for (const cashW of cashes) {
      for (const id of ids) {
        it(`走通：${role} · ${cashW} 万 · 房源 ${id}`, () => {
          vi.spyOn(Math, "random").mockReturnValue(0.5); // 经历周期抽取固定
          const { result, S, minCash } = walk(role, cashW, id);
          expect(result, `${role}/${cashW}/${id} → ${result} @scene=${S.scene}`).toBe("final");
          expect(S.scene).toBe("final");
          expect(S.cash, `${role}/${cashW}/${id} 结算现金穿底`).toBeGreaterThanOrEqual(0);
          expect(S.deal).toBeGreaterThan(0);
          expect(S.paid).toBeGreaterThan(0);
          expect(S.day).toBeGreaterThanOrEqual(1);
          /* 换房（lc:change）也走同一口径：已出款全额退回、借款原路还掉 → 全程不穿底 */
          expect(minCash, `${role}/${cashW}/${id} 途中现金穿底`).toBeGreaterThanOrEqual(0);
        });
      }
    }
  }
});

describe("矩阵边界与死胡同防护", () => {
  it("限购拦截是唯一允许的未走通态，且带「换房 / 重核」出口", () => {
    const p = new FakePage(createInitialState());
    const S = p.S;
    handleAction(p, S, "next");
    handleAction(p, S, "role:invest");
    handleAction(p, S, "next");
    handleAction(p, S, "cash:300");
    handleAction(p, S, "next");
    handleAction(p, S, "house:B");
    handleAction(p, S, "next");
    handleAction(p, S, "qa:hukou:non-sh");
    handleAction(p, S, "qa:permit:yes");
    expect(S.scene).toBe("blocked");
    expect(S.judge!.ok).toBe(false);
    handleAction(p, S, "next"); // 仍可继续（会在网签被拦）
    expect(S.scene).toBe("nego1");
  });

  it("换房（lc:change）：清掉上一套状态并冲减已筹借款", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const p = new FakePage(createInitialState());
    const S = p.S;
    // first · 300 万 · E 房（1600 万）：借满 70 万才够首付，月供仍超风控线 → 只能换房
    const seq = [
      "next", "role:first", "next", "cash:300", "next", "house:E", "next", "qa:hukou:sh", "next",
      "n1:soft", "n2:hold", "net:no", "fee:0.01", "lt:combo", "next", "fundsNext",
      "bor:family", "bor:gjj", "next", "pay:deposit", "payOk", "pay:firstPay", "payOk", "next",
    ];
    for (const a of seq) {
      handleAction(p, S, a);
    }
    expect(S.scene).toBe("loanChk");
    expect(S.borrowed).toBeGreaterThan(0);
    expect(S.paid).toBeGreaterThan(0); // 定金 + 首付先付已出款
    const cashBefore = S.cash;
    handleAction(p, S, "lc:change");
    expect(S.scene).toBe("select");
    expect(S.borrowed).toBe(0); // 已筹借款退还
    expect(S.paid).toBe(0);
    expect(S.firstPay).toBe(0);
    expect(S.deal).toBe(0);
    expect(S.con).toEqual({});
    /* 换房 = 交易中断：已出款（定金 / 首付先付）全额退回、借款原路还掉，
       现金回到「亮家底」时的手头存款（本组合 300 万），不会穿底 */
    expect(S.cash).toBe(3000000);
  });

  it("极端低现金：借满仍缺 → 换 A 房走通，且借款全额退还", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const { result, S } = walk("first", 50, "E");
    expect(result).toBe("final");
    expect(S.borrowed).toBe(0); // 换房时已退还
    expect(S.cash).toBeGreaterThanOrEqual(0);
  });

  it("全款路径（首付档 100%）也能走通：无月供、现金不为负", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const p = new FakePage(createInitialState());
    const S = p.S;
    const seq = [
      "next", "role:first", "next", "cash:500", "next", "house:A", "next", "qa:hukou:sh", "next",
      "n1:soft", "n2:hold", "next", "fee:0.01", "lt:combo", "ds:1", "next", "next",
      "pay:deposit", "payOk", "pay:firstPay", "payOk", "pay:restPay", "payOk",
      "next", "pay:transfer", "payOk", "ho:ok", "next",
    ];
    for (const a of seq) {
      handleAction(p, S, a);
      expect(S.cash, a).toBeGreaterThanOrEqual(0);
    }
    expect(S.scene).toBe("final");
    expect(S.downRate).toBe(1);
    expect(S.loan.monthly).toBe(0);
    expect(S.paid).toBeCloseTo(5000000 - S.cash, 0);
  });
});