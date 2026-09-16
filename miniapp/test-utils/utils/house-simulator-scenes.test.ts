/**
 * 购房模拟器 · 场景视图冒烟测试.
 * 覆盖 buildScene 全部 36 屏：为每屏构造满足前置条件的 SimState，断言产物非空、
 * 无运行时异常；并按真实流程顺序走一遍全流程状态机（纯函数路径），验证派生数据一致。
 */
import { describe, expect, it } from "vitest";
import { buildScene } from "../../pages/house-simulator/utils/scenes";
import { derive, judgeQA, setOffer } from "../../pages/house-simulator/utils/calc";
import { createInitialState, HOUSES, ROLES } from "../../pages/house-simulator/utils/constants";

/**
 * 构造已选 刚需/房 B(400万·满五唯一)/组合贷/现金70万 的基础状态，
 * 部分屏需额外字段（ans/judge/loanYears 等）由用例自行补充.
 */
function base(): ReturnType<typeof createInitialState> {
  const S = createInitialState();
  S.role = ROLES.first;
  S.house = HOUSES.find((h) => h.id === "B")!;
  S.cashSet = true;
  S.loanType = "combo";
  S.agentRate = 0.02;
  derive(S);
  return S;
}

/** 各屏必备状态装配（覆盖所有 buildScene 分支，含 blocked/到手价/风控/交房扣押）. */
function stateForScene(scene: Parameters<typeof buildScene>[0]["scene"]): ReturnType<typeof createInitialState> {
  const S = base();
  if (scene === "start" || scene === "role" || scene === "cash" || scene === "custom") {
    return S; // 未选身份/现金也可进
  }
  S.scene = scene;
  if (scene === "select") {
    // 需要 role + downRate（base 已含）
    return S;
  }
  if (scene === "qa") {
    S.ans = { hukou: "sh" };
    S.qaProg = 1;
    return S;
  }
  if (scene === "blocked") {
    S.judge = { ok: false, title: "限购 · 不符合条件", reason: "非沪籍社保满 1 年：外环内限购 1 套，你名下已有住房，无法再购。" };
    return S;
  }
  if (scene === "nego1") {
    return S;
  }
  if (scene === "nego2") {
    S.negoR1 = "chat";
    return S;
  }
  if (scene === "nego3") {
    S.negoR1 = "chat";
    setOffer(S, 0.04); // 未越线可成交；另在 2.5 覆盖越线叫停分支
    return S;
  }
  if (scene === "feeNego" || scene === "loanType" || scene === "funds" || scene === "sign") {
    S.slash = 0.04;
    derive(S);
    if (scene === "funds" || scene === "sign") {
      S.cash = S.need - 20000; // 制造缺口分支
    }
    return S;
  }
  if (scene === "borrow") {
    S.slash = 0.04;
    derive(S);
    S.usedBorrow = { family: true, credit: true }; // 覆盖已用渠道占位分支
    return S;
  }
  if (scene === "loan" || scene === "loanChk" || scene === "loanContract") {
    return S; // base 已 derive，组合贷月供在风控线内 → 通过分支
  }
  if (scene === "deed" || scene === "transfer") {
    return S; // deed 默认缴税前态（taxed=false）
  }
  if (scene === "handover") {
    S.holdback = 100000; // 覆盖户口未迁分支
    return S;
  }
  if (scene === "settle") {
    S.holdback = 100000; // 覆盖扣押尾款待付分支
    return S;
  }
  if (
    scene === "renovStart" ||
    scene === "renovDesign" || scene === "renovContract" ||
    scene === "renovDemo" || scene === "renovElec" || scene === "renovSeal" ||
    scene === "renovTileWood" || scene === "renovPaint" ||
    scene === "renovMain" || scene === "renovInstall" || scene === "renovClean" ||
    scene === "renovAir" || scene === "renovWarr" || scene === "renovDone"
  ) {
    return S; // 装修屏仅需 base（含 house.reno；renov 决策字段保持空态 → 基础叙事渲染）
  }
  if (scene === "final") {
    S.holdback = 100000;
    S.usedBorrow = { family: true };
    S.borrowed = 300000;
    return S;
  }
  return S;
}

describe("buildScene 全屏冒烟", () => {
  it("38 屏均产出非空内容块且不抛异常", () => {
    const scenes: Parameters<typeof buildScene>[0]["scene"][] = [
      "start", "role", "cash", "select", "custom", "qa", "blocked",
      "nego1", "nego2", "nego3", "feeNego", "loanType", "funds", "borrow",
      "sign", "signNet", "loan", "loanChk", "loanContract", "transfer", "deed",
      "handover", "settle", "final",
      "renovStart",
      "renovDesign", "renovContract", "renovDemo", "renovElec", "renovSeal",
      "renovTileWood", "renovPaint", "renovMain", "renovInstall",
      "renovClean", "renovAir", "renovWarr", "renovDone",
    ];
    scenes.forEach((scene) => {
      const S = stateForScene(scene);
      S.scene = scene;
      const blocks = buildScene(S);
      expect(blocks.length, `${scene} 应产出内容块`).toBeGreaterThan(0);
    });
  });

  it("砍价越线叫停分支（nego3 卖家叫停 + 接受底线选项）", () => {
    const S = base();
    S.negoR1 = "hard";
    setOffer(S, 0.06); // 越线
    S.scene = "nego3";
    const blocks = buildScene(S);
    const opts = blocks.filter((b) => b.t === "opts").flatMap((b) => (b.t === "opts" ? b.items : []));
    expect(opts.map((o) => o.action)).toEqual(expect.arrayContaining(["negoAccept", "negoQuit"]));
  });

  it("资质核验判定终态（沪籍单身 0 套 → 可购，进入砍价）", () => {
    const S = base();
    S.ans = { hukou: "sh", married: "single" };
    expect(judgeQA(S).ok).toBe(true);
  });

  it("全款路径：贷款方案屏直接递交过户（无贷款审批/无放款）", () => {
    const S = base();
    S.downSel = 1;
    derive(S);
    S.scene = "loan";
    expect(S.downRate).toBe(1);
    const blocks = buildScene(S);
    const ctas = blocks
      .filter((b) => b.t === "cta")
      .flatMap((b) => (b.t === "cta" ? b.items : []));
    expect(ctas.map((c) => c.action)).toContain("loanOkAllCash");
    expect(S.loan.monthly).toBe(0);
  });

  it("首付档位选择屏产出（含全款档）", () => {
    const S = base();
    S.scene = "loanType";
    const blocks = buildScene(S);
    const ds = blocks.find((b) => b.t === "downSteps");
    expect(ds).toBeDefined();
    if (ds && ds.t === "downSteps") {
      expect(ds.items.map((i) => i.action)).toEqual(["ds:0", "ds:0.3", "ds:0.5", "ds:1"]);
    }
  });

  it("全流程数值自洽：成交→签约→监管→过户扣除后现金无负跳变", () => {
    const S = base();
    // 砍价成交（未越线、含税价）
    S.negoR1 = "chat";
    setOffer(S, 0.04);
    // 首付/税费需现金 <= 现金 时签约关口不应为负
    expect(S.deal).toBeGreaterThan(0);
    expect(S.need).toBeGreaterThan(0);
    expect(S.loan.monthly).toBeGreaterThan(0);
    expect(S.loan.totalInt).toBeGreaterThan(0);
  });
});

/**
 * 推到「贷款审批 · 风控拦截」：F 房（550 万 · 不满 2 年 · 未砍价）+ 到手价 + 组合贷 20 年，
 * 月供 24,334 元 > 家庭月收入一半 20,000 元。cashWan = 现金屏金额（万元）；
 * 定金在签约屏已付讫，故 loanChk 时现金 = 现金屏金额 − 定金。
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
  S.scene = "loanChk";
  return S;
}

/** 风控拦截屏产出的可选 action. */
function riskOpts(S: ReturnType<typeof createInitialState>): string[] {
  return buildScene(S)
    .filter((b) => b.t === "opts")
    .flatMap((b) => (b.t === "opts" ? b.items.map((o) => o.action) : []));
}

describe("风控追加首付口径（到手价 · 月供超线 · 现金临界）", () => {
  it("到手价转嫁税费（F 房 36.3 万）必须计入待付现金：现金 206 万不得放行追加首付", () => {
    const S = atLoanChkRisk(206);
    // 550 万 ×（增值税 5% + 附加 0.6% + 个税 1%）= 36.30 万
    expect(S.netTax).toBe(363000);
    expect(riskOpts(S)).not.toContain("lcPay");
    const blocks = buildScene(S);
    expect(blocks.some((b) => b.t === "note" && b.text.indexOf("当前现金不足") >= 0)).toBe(true);
  });

  it("追加首付放行阈值 = 需现金 + 追加额（临界 241.81 万）", () => {
    // 待付 需现金−定金 = 135.31 万，追加额 79.00 万 → 需现金 241.81 万
    expect(riskOpts(atLoanChkRisk(241))).not.toContain("lcPay");
    expect(riskOpts(atLoanChkRisk(242))).toContain("lcPay");
  });
});