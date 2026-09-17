/**
 * 购房模拟器 · 页面渲染数据构建单测（buildGuard / 装修流程条与双条 / 付款确认弹窗 / realOf）.
 *
 * 覆盖状态带的节点线 / 钱条 / 期条与多花提示、装修 12 阶段流程条与钱工双条、
 * 五个出款点弹窗的现金三段与「下一节点」口径，以及「第 N 天 → 真实日期」的换算。
 */
import { describe, expect, it } from "vitest";
import { createInitialState, HOUSES, ROLES } from "../../pages/house-simulator/utils/constants";
import type { SceneKey, SimState } from "../../pages/house-simulator/utils/constants";
import { derive } from "../../pages/house-simulator/utils/calc";
import { REAL_MAX, REAL_MIN, SCREENS, screenMeta } from "../../pages/house-simulator/utils/flow";
import {
  buildGuard, buildRenovMeters, buildRenovSteps, emptyModal, payModal, realOf, renovStageLabel,
  TIME_SCALE,
} from "../../pages/house-simulator/utils/render";

/** 基础状态：刚需首套 · B 房（400 万 · 满五唯一）· 组合贷 · 现金 70 万. */
function base(): SimState {
  const S = createInitialState();
  S.scene = "select";
  S.role = ROLES.first;
  S.house = HOUSES.find((h) => h.id === "B")!;
  S.cashSet = true;
  S.cash = 700000;
  S.loanType = "combo";
  S.agentRate = 0.02;
  derive(S);
  return S;
}

/** 装修期状态：f30 主流档 · 26.4 万合同价 · 10.3 万增项 · 第 180 天. */
function renov(day: number): SimState {
  const S = base();
  S.scene = "renovPaint";
  S.renovPkg = "f30";
  S.renovBudget = 264000;
  S.renovDesignFee = 0;
  S.renovStartDay = 16;
  S.renovDay = day;
  S.renovExtra = 103000;
  return S;
}

describe("buildGuard：购房状态带", () => {
  it("装修屏返回 null（走装修自己的流程条与双条）", () => {
    const S = base();
    S.scene = "renovDemo";
    expect(buildGuard(S)).toBeNull();
    S.scene = "renovDone";
    expect(buildGuard(S)).toBeNull();
  });

  it("当前屏名带进度下标；总账屏改为「交易完成 · 已拿钥匙」", () => {
    const S = base();
    S.scene = "nego1";
    expect(buildGuard(S)!.cur).toBe("砍价 · 第一轮 " + (SCREENS.findIndex((m) => m.k === "nego1") + 1) + "/24");
    S.scene = "final";
    expect(buildGuard(S)!.cur).toBe("交易完成 · 已拿钥匙");
  });

  it("12 段节点线：已过 = done、当前 = cur、未到 = future；总账全 done", () => {
    const S = base();
    S.scene = "nego1"; // node 3
    const g = buildGuard(S)!;
    expect(g.segs).toHaveLength(12);
    expect(g.segs.map((s) => s.cls)).toEqual([
      "done", "done", "done", "cur", "future", "future", "future", "future", "future", "future", "future", "future",
    ]);
    expect(g.names.filter((n) => n.on)).toHaveLength(1);
    expect(g.names[3].on).toBe(true);

    S.scene = "final";
    const done = buildGuard(S)!;
    expect(done.segs.every((s) => s.cls === "done")).toBe(true);
    expect(done.names.every((n) => !n.on)).toBe(true);
  });

  it("钱条：预算未定 → 文案为「预算未定」；已算账 → 「已出款 / 需现金」", () => {
    const S = createInitialState();
    const blank = buildGuard(S)!;
    expect(blank.money.text).toBe("预算未定");
    expect(blank.money.sub).toBe("");

    S.role = ROLES.first;
    S.house = HOUSES.find((h) => h.id === "B")!;
    S.scene = "sign";
    derive(S);
    S.paid = 190000;
    const g = buildGuard(S)!;
    expect(g.money.text).toBe("¥19.00 万");
    expect(g.money.sub).toContain("/ 需现金 " + (S.need / 10000).toFixed(2) + " 万");
    expect(g.money.base).toBeCloseTo((190000 / (S.need + 0)) * 100, 6);
  });

  it("钱条带「已筹」口径；期条带坑天数与常规区间刻度", () => {
    const S = base();
    S.scene = "borrow";
    S.borrowed = 300000;
    S.day = 20;
    const g = buildGuard(S)!;
    expect(g.money.sub).toContain("（已筹 30.00 万）");
    expect(g.time.text).toBe("已走 20 天");
    expect(g.time.sub).toContain("/ 常规 1-3 个月");
    expect(g.time.sub.indexOf("含坑")).toBe(-1);
    expect(g.time.base).toBeCloseTo((20 / REAL_MAX) * 100, 6);
    /* 暖色带从 30 天刻度起，紧跟黑色段之后 */
    expect(g.time.warmMargin).toBeCloseTo((REAL_MIN / REAL_MAX) * 100 - (20 / REAL_MAX) * 100, 6);
    expect(g.time.warmWidth).toBeCloseTo(((REAL_MAX - REAL_MIN) / REAL_MAX) * 100, 6);

    S.lessons = [{
      k: "chan", short: "产调", stage: "过户递交", cost: 1.2, days: 15,
      text: "", src: "", fix: "",
    }];
    const pitted = buildGuard(S)!;
    expect(pitted.time.sub).toContain("（含坑拖出 15 天）");
    expect(pitted.loss).not.toBe("");
    expect(pitted.day).toBe("第 20 天");
  });

  it("走过 90 天以上：期条满格且不再显示常规暖色带", () => {
    const S = base();
    S.scene = "handover";
    S.day = 120;
    const g = buildGuard(S)!;
    expect(g.time.base).toBe(100);
    expect(g.time.warmWidth).toBe(0);
  });

  it("多花提示：有学费才显示；到手价也计入多花笔数", () => {
    const S = base();
    S.scene = "final";
    expect(buildGuard(S)!.loss).toBe("");
    S.lessons = [{
      k: "chan", short: "产调", stage: "过户递交", cost: 1.2, days: 15,
      text: "", src: "", fix: "",
    }];
    expect(buildGuard(S)!.loss).toContain("多花 1 笔");
    S.netDeal = true;
    derive(S);
    S.house = HOUSES.find((h) => h.id === "F")!;
    derive(S);
    expect(buildGuard(S)!.loss).toContain("多花 2 笔"); // 学费单 + 「到手价」
  });
});

describe("装修流程条 buildRenovSteps", () => {
  it("12 项阶段条：当前阶段标 cur、已过标 done 与 ✓；主材紧跟拆除", () => {
    const S = renov(20);
    S.scene = "renovElec";
    const r = buildRenovSteps(S);
    expect(r.steps).toHaveLength(12);
    expect(r.stepPos).toBe("装修 5 / 12");
    expect(r.dayText).toBe("第 20 天");
    expect(r.steps.filter((s) => s.cls === "done")).toHaveLength(4);
    expect(r.steps.filter((s) => s.cls === "cur")).toHaveLength(1);
    expect(r.steps[3].label).toBe("主材");
    expect(r.steps[4].label).toBe("水电");
    expect(r.steps[4].cls).toBe("cur");
    expect(r.steps[0].mark).toBe("✓");
  });

  it("开场前（renovStart）无进度、装修完成（renovDone）无未到阶段", () => {
    const S = renov(20);
    S.scene = "renovStart";
    const before = buildRenovSteps(S);
    expect(before.stepPos).toBe("开工前 · 定预算");
    expect(before.steps.every((s) => s.cls === "")).toBe(true);
    expect(before.steps.every((s) => s.mark === "")).toBe(true);

    S.scene = "renovDone";
    const done = buildRenovSteps(S);
    expect(done.stepPos).toBe("装修 12 / 12");
    expect(done.steps.filter((s) => s.cls === "")).toHaveLength(0); // 没有未到阶段
    expect(done.steps.filter((s) => s.mark === "✓").length).toBeGreaterThanOrEqual(11);
  });

  it("购房屏也返回 12 项（页面侧不用它，但接口稳定）", () => {
    const S = base();
    S.scene = "sign";
    expect(buildRenovSteps(S).steps).toHaveLength(12);
    expect(buildRenovSteps(S).stepPos).toBe("开工前 · 定预算");
  });

  it("renovStageLabel：装修屏给阶段名，购房屏回落到「装修」", () => {
    const S = base();
    S.scene = "renovTileWood";
    expect(renovStageLabel(S)).toBe("木瓦");
    S.scene = "renovAir";
    expect(renovStageLabel(S)).toBe("通风");
    S.scene = "sign";
    expect(renovStageLabel(S)).toBe("装修");
  });
});

describe("装修双条 buildRenovMeters", () => {
  it("购房屏返回 null", () => {
    const S = base();
    S.scene = "deed";
    expect(buildRenovMeters(S)).toBeNull();
  });

  it("钱条 = 结账价 / 合同价（含增项分段）；工期条 = 实际 / 计划（含超期分段）", () => {
    const S = renov(180); // 计划 16 + 104 = 120 天，超期 60 天
    const m = buildRenovMeters(S)!;
    expect(m.money.text).toBe("¥36.7 万"); // 26.4 万 + 10.3 万增项
    expect(m.money.sub).toBe("/ 合同 26.4 万");
    expect(m.money.base).toBeCloseTo((264000 / 367000) * 100, 6);
    expect(m.money.over).toBeCloseTo((103000 / 367000) * 100, 6);

    expect(m.time.text).toBe("180 天");
    expect(m.time.sub).toBe("/ 计划 120 天");
    expect(m.time.base).toBeCloseTo((120 / 180) * 100, 6);
    expect(m.time.over).toBeCloseTo((60 / 180) * 100, 6);
    expect(m.loss).toContain("增项");
    expect(m.loss).toContain("¥103,000");
  });

  it("一天没多：工期条无超期段（over = 0）", () => {
    const S = renov(120); // 计划 120 天
    const m = buildRenovMeters(S)!;
    expect(m.time.over).toBe(0);
    expect(m.time.text).toBe("120 天");
  });

  it("质保 / 总账屏按完工入住日快照算（renovDoneDay 优先）", () => {
    const S = renov(200);
    S.renovDoneDay = 140;
    S.scene = "renovWarr";
    expect(buildRenovMeters(S)!.time.text).toBe("140 天");
    S.scene = "renovDone";
    expect(buildRenovMeters(S)!.time.text).toBe("140 天");
    S.scene = "renovPaint";
    expect(buildRenovMeters(S)!.time.text).toBe("200 天");
  });

  it("无增项不显示损失口径；半包改成「自购踩坑」口径", () => {
    const S = renov(120);
    S.renovExtra = 0;
    S.renovBills = [];
    expect(buildRenovMeters(S)!.loss).toBe("");

    const half = renov(120);
    half.renovPkg = "half";
    half.renovBills = [{
      no: "#01", stage: "主材", day: 40, lines: [["误工费", 3200]], cost: 3200, days: 12,
      text: "", src: "", hint: "",
    }];
    const m = buildRenovMeters(half)!;
    expect(m.loss).toContain("自购踩坑 1 笔");
    expect(m.loss).toContain("合同外的账");
  });
});

describe("付款确认弹窗 payModal", () => {
  it("空态：类型为空、无付款数据", () => {
    expect(emptyModal()).toEqual({ type: "", pay: null });
  });

  it("五个出款点：判定为「本次支付」并给出支付后剩余", () => {
    const S = base();
    S.scene = "sign";
    S.cash = 2000000;
    const m = payModal(S, "deposit", S.deposit);
    expect(m.type).toBe("pay");
    const p = m.pay!;
    expect(p.kind).toBe("deposit");
    expect(p.title).toBe("定金 · 居间协议");
    expect(p.payLabel).toBe("本次支付");
    expect(p.now).toBe("200.00");
    expect(p.pay).toBe((S.deposit / 10000).toFixed(2));
    expect(p.after).toBe(((S.cash - S.deposit) / 10000).toFixed(2));
    expect(p.nowLabel).toBe("现有现金");
    expect(p.afterLabel).toBe("支付后剩余");
    expect(p.note.length).toBeGreaterThan(0);
  });

  it("定金与网签付款单独带违约警示；缴税 / 扣押尾款不摆警示", () => {
    const S = base();
    S.scene = "sign";
    expect(payModal(S, "deposit", S.deposit).pay!.warn).toContain("定金");
    expect(payModal(S, "firstPay", 100000).pay!.warn).toContain("20%");
    expect(payModal(S, "restPay", 100000).pay!.warn).toContain("20%");
    expect(payModal(S, "transfer", 165000).pay!.warn).toBe("");
    expect(payModal(S, "holdback", 38000).pay!.warn).toBe("");
  });

  it("「下一节点」口径：定金 / 首付先付 → 贷款审批；补足 → 过户递交；缴税 → 交房", () => {
    const S = base();
    S.scene = "signNet";
    const dep = payModal(S, "deposit", S.deposit).pay!;
    expect(dep.nextName).toBe(screenMeta("loanChk").name);
    expect(dep.nextReal).toBe("常规周期 " + screenMeta("loanChk").real);
    expect(dep.nextWait).toContain(screenMeta("loanChk").waitWho!);

    const rest = payModal(S, "restPay", 100000).pay!;
    expect(rest.nextName).toBe(screenMeta("transfer").name);
    const tax = payModal(S, "transfer", 165000).pay!;
    expect(tax.nextName).toBe(screenMeta("handover").name);
  });

  it("尾款扣押不从买方现金里扣：第三格「现金不变」，下一节点为装修", () => {
    const S = base();
    S.scene = "settle";
    S.cash = 800000;
    const p = payModal(S, "holdback", 38000).pay!;
    expect(p.payLabel).toBe("扣留尾款");
    expect(p.afterLabel).toBe("现金不变");
    expect(p.now).toBe(p.after);
    expect(p.note).toContain("从卖方应得的房款里扣留");
    expect(p.nextName).toBe("装修");
    expect(p.nextReal).toBe("交房后即可开工");
    expect(p.nextWait).toContain("装修模块");
  });
});

describe("时间刻度与真实日期", () => {
  it("期条刻度常量 = 常规 1-3 个月（30 / 90 天）", () => {
    expect(TIME_SCALE).toEqual({ min: REAL_MIN, max: REAL_MAX });
    expect(TIME_SCALE).toEqual({ min: 30, max: 90 });
  });

  it("realOf：第 1 天为零点当天、第 8 天差 7 个自然日、时分秒清零", () => {
    const a = realOf(1);
    const b = realOf(8);
    expect(Math.round((b.getTime() - a.getTime()) / 86400000)).toBe(7);
    expect(a.getHours()).toBe(0);
    expect(a.getMinutes()).toBe(0);
    expect(a.getSeconds()).toBe(0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    expect(a.getTime()).toBe(today.getTime());
  });

  it("购房屏的时间条口径与 realOf 一致：第 N 天 = 今天 + (N-1)", () => {
    const S = base();
    S.scene = "deed" as SceneKey;
    S.day = 14;
    const g = buildGuard(S)!;
    expect(g.day).toBe("第 14 天");
    expect(Math.round((realOf(14).getTime() - realOf(1).getTime()) / 86400000)).toBe(13);
  });
});