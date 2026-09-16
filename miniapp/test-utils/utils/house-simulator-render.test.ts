/**
 * 购房模拟器 · HUD 构建（buildHud）单测.
 *
 * 覆盖现金警示口径：判据是「当前现金 vs 尚待支付的现金」，而非一整笔 need——
 * 定金在签约屏付讫、首付先付在网签屏付、剩余首付在贷款合同屏补足、税费在领证屏缴，
 * 已发生扣款的屏必须把已付款项从 need 中摘除，否则会把已付款项重复计入，
 * 出现「钱够却报现金不足」的假警示。
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createInitialState, HOUSES, ROLES } from "../../pages/house-simulator/utils/constants";
import { derive } from "../../pages/house-simulator/utils/calc";
import { buildHud, buildSteps, calModal, buildCalGrid, realOf, agreementModal } from "../../pages/house-simulator/utils/render";
import { handleAction, HandlerCtx } from "../../pages/house-simulator/utils/handlers";

/* wx API 存根（handlers 内 toast 使用）. */
beforeAll(() => {
  (globalThis as unknown as Record<string, unknown>).wx = { showToast: () => {} };
});

/** 事件回调桩：HUD 用例只用 lcPay/lcContractOk→payOk 的状态位移，不关心页面回调. */
const call = {
  data: { modal: { pay: { kind: "restPay" } } },
  setData: () => {},
  nextScene: () => {},
  render: () => {},
  resetAll: () => {},
  closeModal: () => {},
  /* payOk 只读 data.modal.pay.kind 扣款，桩里固定为 restPay 即可. */
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

  it("贷款合同屏：定金已扣，只比 需现金 − 定金，钱够不得假警示", () => {
    const S = atLoanChkRisk(242);
    S.scene = "loanChk";
    handleAction(call, S, "lcPay"); // 追加首付 → 需现金抬升
    S.scene = "loanContract"; // 桩 nextScene 为空操作，手动模拟审批通过进入贷款合同屏
    expect(S.cash).toBeLessThan(S.need); // 按 need 全额比会误报
    expect(S.cash).toBeGreaterThan(S.need - S.deposit); // 定金已付，待付额更低
    expect(buildHud(S).cashLow).toBe(false);
  });

  it("领证缴税前：首付已全部支付，只比 税费", () => {
    const S = atLoanChkRisk(289);
    S.scene = "loanChk";
    handleAction(call, S, "lcPay");
    S.scene = "loanContract";
    handleAction(call, S, "lcContractOk"); // 弹付款确认（不扣款）
    handleAction(call, S, "payOk"); // 确认支付 → 补足剩余首付入监管
    S.scene = "deed"; // 缴税前：只剩税费待缴
    expect(S.cash).toBeLessThan(S.need);
    expect(S.cash).toBeGreaterThan(S.taxes + S.netTax);
    expect(buildHud(S).cashLow).toBe(false);
  });
});

describe("居间协议核对清单（agreementModal）", () => {
  it("8 处条款逐项列出：覆盖产权/共有人/付款/贷款/过户/交房/尾款节点，且不写具体金额与日期", () => {
    const m = agreementModal();
    expect(m.type).toBe("agreement");
    expect(m.agreement!.items).toHaveLength(8);
    const titles = m.agreement!.items.map((it) => it.title);
    expect(titles).toContain("产权状况（产调）");
    expect(titles).toContain("共有权人签字");
    expect(titles).toContain("最晚首付支付时间");
    expect(titles).toContain("贷款金额");
    expect(titles).toContain("贷款额度不足时现金补足的最晚时间");
    expect(titles).toContain("最晚过户时间");
    expect(titles).toContain("最晚交房时间");
    expect(titles).toContain("尾款及尾款支付条件");
    // 每项都有「签署时注意什么」的提示，且不出现数字金额/日期
    for (const it of m.agreement!.items) {
      expect(it.tip.length).toBeGreaterThan(0);
      expect(it.tip).not.toMatch(/[0-9]/);
    }
  });

  it("初始未勾选：全否、all=false（确认按钮不可用）", () => {
    const m = agreementModal();
    expect(m.agreement!.checked).toHaveLength(8);
    expect(m.agreement!.checked.every((c) => c === false)).toBe(true);
    expect(m.agreement!.all).toBe(false);
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

  it("递交过户 → 审税出证：gap=7 天（审税 7 天），目标名「领证」", () => {
    const S = createInitialState();
    S.scene = "transfer";
    const m = calModal(S, "deed");
    expect(m.cal!.toName).toBe("领证");
    expect(m.cal!.gap).toBe(7);
  });

  it("装修流程条：buildSteps 在装修场景返回 12 项阶段并标记进度", () => {
    const S = createInitialState();
    S.scene = "renovElec"; // 水电 = 第 4 阶段
    S.renovDay = 20;
    const r = buildSteps(S);
    expect(r.steps).toHaveLength(12);
    expect(r.stepPos).toBe("装修 4 / 12");
    expect(r.dayText).toBe("第 20 天");
    expect(r.steps.filter((s) => s.cls === "done")).toHaveLength(3); // 前 3 阶段（设计/签约/拆除）已完成
    expect(r.steps.filter((s) => s.cls === "cur")).toHaveLength(1); // 当前为第 4 阶段（水电）
    expect(r.steps[3].label).toBe("水电"); // 当前阶段标记在水电
    const t = createInitialState();
    t.scene = "sign";
    expect(buildSteps(t).steps).toHaveLength(12);
  });

  it("装修完成回最终账单：dayText 按完工入住日快照（S.renovDoneDay）计；跳过装修仍按交易完成日（第 16 天）", () => {
    const S = createInitialState();
    S.scene = "final";
    S.renovDone = true;
    S.renovSkipped = false;
    S.renovDoneDay = 140;
    expect(buildSteps(S).dayText).toBe("第 140 天");
    const t = createInitialState();
    t.scene = "final";
    t.renovDone = true;
    t.renovSkipped = true;
    expect(buildSteps(t).dayText).toBe("第 16 天");
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
