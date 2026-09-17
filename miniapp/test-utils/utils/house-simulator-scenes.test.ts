/**
 * 购房模拟器 · 场景视图（buildScene）冒烟与结构单测.
 *
 * 覆盖 38 屏（购房 24 + 装修 14）：每屏都能产出非空内容块且不抛异常；
 * 并锁住关键分支的出口动作（砍价越线叫停、到手价三选、贷款风控补救、交割 4 项、
 * 总账「0 笔多花 / 多花清单」两个走向、装修入口消失）。
 */
import { describe, expect, it } from "vitest";
import { buildScene } from "../../pages/house-simulator/utils/scenes";
import type { SceneBlock, SceneView } from "../../pages/house-simulator/utils/scenes";
import { defaultCustom, derive, fmt, gap, judgeQA, money, syncCustom } from "../../pages/house-simulator/utils/calc";
import { createInitialState, HOUSES, ROLES } from "../../pages/house-simulator/utils/constants";
import type { SceneKey, SimState } from "../../pages/house-simulator/utils/constants";
import { SCREENS } from "../../pages/house-simulator/utils/flow";

/** 购房屏（24）+ 装修屏（14）= 38 屏. */
const PURCHASE_SCENES: SceneKey[] = SCREENS.map((m) => m.k);
const RENOV_SCENES: SceneKey[] = [
  "renovStart", "renovDesign", "renovContract", "renovDemo", "renovMain", "renovElec", "renovSeal",
  "renovTileWood", "renovPaint", "renovInstall", "renovClean", "renovAir", "renovWarr", "renovDone",
];

/** 基础状态：刚需首套 · B 房（400 万 · 满五唯一）· 组合贷 · 现金 70 万 · 已 derive. */
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

/** 各屏必备前置状态（覆盖所有 buildScene 分支）. */
function stateFor(scene: SceneKey): SimState {
  const S = base();
  S.scene = scene;
  switch (scene) {
    case "qa":
      S.ans = { hukou: "sh" };
      return S;
    case "blocked":
      S.judge = judgeQA(S);
      return S;
    case "nego2":
    case "nego3":
      S.negoR1 = "chat";
      S.slash = 0; // 未越线、按挂牌价成交
      derive(S);
      return S;
    case "signNet":
      S.judge = { ok: true, title: "可购买", reason: "沪籍外环内限购 2 套；你名下 0 套。" };
      return S;
    case "handover":
    case "settle":
      S.hand = { util: false, hukou: false, key: true, fund: true };
      S.handHold = true;
      return S;
    case "final":
      S.renovDone = false;
      return S;
    case "renovDesign":
      S.renovPkg = "f30";
      return S;
    case "renovContract":
      S.renovPkg = "f30";
      S.renovTier = "free";
      return S;
    default:
      return S;
  }
}

/** 内容块类型（断言辅助）. */
function types(v: SceneView): string[] {
  return v.blocks.map((b) => b.t);
}

/** 所有 opts 块的 action 列表. */
function optActions(v: SceneView): string[] {
  const out: string[] = [];
  for (const b of v.blocks) {
    if (b.t === "opts") {
      b.items.forEach((o) => out.push(o.action));
    }
  }
  return out;
}

/** 所有 cta 块的 action 列表. */
function ctaActions(v: SceneView): string[] {
  const out: string[] = [];
  for (const b of v.blocks) {
    if (b.t === "cta") {
      b.items.forEach((c) => out.push(c.action));
    }
  }
  return out;
}

function find(v: SceneView, t: SceneBlock["t"]): SceneBlock[] {
  return v.blocks.filter((b) => b.t === t);
}

describe("buildScene 全屏冒烟", () => {
  it("38 屏均产出非空内容块、每块都有合法类型、不抛异常", () => {
    const scenes = PURCHASE_SCENES.concat(RENOV_SCENES);
    expect(scenes).toHaveLength(38);
    expect(new Set(scenes).size).toBe(38); // 无重复屏
    const valid = new Set([
      "eyebrow", "title", "sub", "prog", "chat", "rows", "houses", "opts", "chips", "chipsRows",
      "timebar", "wait", "pit", "sect", "g3", "trail", "clSec", "tuition", "lrn", "gantt", "rail",
      "pricebar", "note", "riskLog", "swipe", "grades", "burst", "banner", "form-cash", "form-custom",
      "form-years", "downSteps", "cta",
    ]);
    for (const scene of scenes) {
      const S = stateFor(scene);
      const v = buildScene(S);
      expect(v.blocks.length, scene).toBeGreaterThan(0);
      for (const b of v.blocks) {
        expect(valid.has(b.t), scene + " → " + b.t).toBe(true);
      }
    }
  });

  it("购房屏都有双层时间条与「第 N 天」（开场 / 总账两屏不摆）；装修屏不摆购房状态带元素", () => {
    for (const scene of PURCHASE_SCENES) {
      const S = stateFor(scene);
      const v = buildScene(S);
      if (scene === "start" || scene === "final") {
        expect(types(v).indexOf("timebar"), scene).toBe(-1);
        continue;
      }
      expect(types(v).indexOf("timebar"), scene).toBeGreaterThanOrEqual(0);
      const bar = find(v, "timebar")[0];
      if (bar.t === "timebar") {
        expect(bar.day, scene).toBe("第 " + S.day + " 天");
        expect(Array.isArray(bar.strips), scene).toBe(true);
        if (scene === "blocked") {
          expect(bar.strips).toHaveLength(0); // real = — 的屏不编天数
        }
      }
    }
    for (const scene of RENOV_SCENES) {
      const v = buildScene(stateFor(scene));
      expect(types(v).indexOf("timebar"), scene).toBe(-1);
    }
  });
});

describe("开场 / 身份 / 现金 / 选房 / 自定义", () => {
  it("开场屏：12 节点一览 + 开始主按钮", () => {
    const v = buildScene(stateFor("start"));
    expect(types(v)).toContain("trail");
    expect(v.primary!.action).toBe("next");
    expect(v.primary!.disabled).toBe(false);
  });

  it("身份屏：3 个身份选项；未选身份主按钮禁用", () => {
    const S = stateFor("role");
    S.role = null;
    const v = buildScene(S);
    expect(optActions(v)).toEqual(["role:first", "role:trade", "role:invest"]);
    expect(v.primary!.disabled).toBe(true);
    expect(buildScene(stateFor("role")).primary!.disabled).toBe(false);
  });

  it("现金屏：5 个金额档 + 输入框；未亮家底主按钮禁用", () => {
    const S = stateFor("cash");
    S.cashSet = false;
    const v = buildScene(S);
    expect(types(v)).toContain("form-cash");
    const chips = find(v, "chips")[0];
    if (chips.t === "chips") {
      expect(chips.items.map((c) => c.action)).toEqual(["cash:50", "cash:70", "cash:100", "cash:200", "cash:300"]);
    }
    expect(v.primary!.disabled).toBe(true);
  });

  it("看房屏：6 套预设 + 自定义卡；未选房源主按钮禁用", () => {
    const v = buildScene(stateFor("select"));
    const cards = find(v, "houses")[0];
    if (cards.t === "houses") {
      expect(cards.items).toHaveLength(7); // A-F + 自定义
      expect(cards.items.map((c) => c.id)).toEqual(["A", "B", "C", "D", "E", "F", "custom"]);
    }
    const S = stateFor("select");
    S.house = null;
    expect(buildScene(S).primary!.disabled).toBe(true);
  });

  it("自定义屏：四组口径 chipsRows + 税费口径预览 + 回选房次级按钮", () => {
    const v = buildScene(stateFor("custom"));
    const labels = find(v, "chipsRows").flatMap((b) => (b.t === "chipsRows" ? b.rows.map((r) => r.k) : []));
    expect(labels).toEqual(["环线", "持有年限", "是否唯一", "取得方式"]);
    const rings = find(v, "chipsRows")
      .flatMap((b) => (b.t === "chipsRows" ? b.rows : []))
      .find((r) => r.k === "环线")!;
    expect(rings.items.map((c) => c.action)).toEqual(["ring:内", "ring:外"]);
    expect(ctaActions(v)).toContain("backSelect");
    expect(types(v)).toContain("rows"); // 税费口径预览
  });
});

describe("资格核验 / 资格结果", () => {
  it("问答屏逐题渲染选项（户籍 → 居住证 → 社保年限）", () => {
    const v1 = buildScene(stateFor("qa"));
    expect(optActions(v1)).toEqual(["qa:hukou:sh", "qa:hukou:non-sh"]);
    expect(v1.primary).toBeNull();

    const S2 = stateFor("qa");
    S2.ans = { hukou: "non-sh" };
    S2.qaProg = 1;
    expect(optActions(buildScene(S2))).toEqual(["qa:permit:yes", "qa:permit:no"]);

    const S3 = stateFor("qa");
    S3.ans = { hukou: "non-sh", permit: "no" };
    S3.qaProg = 2;
    expect(optActions(buildScene(S3))).toEqual(["qa:years:l1", "qa:years:m1-3", "qa:years:m3p"]);
  });

  it("资格结果屏：通过 / 被限购两种结论 + 换房与重核出口", () => {
    const ok = buildScene(stateFor("blocked"));
    const okPit = find(ok, "pit")[0];
    if (okPit.t === "pit") {
      expect(okPit.title.indexOf("✓ ")).toBe(0);
    }
    expect(ctaActions(ok)).toEqual(["backSelect", "requalify"]);
    expect(ok.primary!.title).toBe("去砍价");

    const S = stateFor("blocked");
    S.role = ROLES.invest;
    S.ans = { hukou: "non-sh", permit: "yes" };
    S.judge = judgeQA(S);
    const bad = buildScene(S);
    const badPit = find(bad, "pit")[0];
    if (badPit.t === "pit") {
      expect(badPit.title).toContain("✕ ");
    }
    expect(bad.primary!.title).toBe("仍然继续（会卡在网签）");
  });
});

describe("砍价 / 到手价 / 中介费", () => {
  it("第一轮出价：三档幅度（-6% / -3% / 先聊聊）+ 底线提示", () => {
    const v = buildScene(stateFor("nego1"));
    expect(optActions(v)).toEqual(["n1:hard", "n1:soft", "n1:chat"]);
    expect(v.primary).toBeNull();
    expect(types(v)).toContain("chat");
  });

  it("第二轮未越线：动态选项含「就按 X% 成交」；越线只剩接受底价 / 换房", () => {
    const ok = buildScene(stateFor("nego2"));
    const okOpts = optActions(ok);
    expect(okOpts.some((a) => a.indexOf("n2:") === 0)).toBe(true);

    const S = stateFor("nego2");
    S.negoCap = true;
    S.slash = S.house!.negotiable;
    derive(S);
    const called = buildScene(S);
    expect(optActions(called)).toEqual(["n2Accept", "backSelect"]);
  });

  it("成交屏：有卖方税费 → 到位价三选（同意 / 先问清 / 按含税价）；无卖方税费 → 直接进入算账", () => {
    const F = buildScene(stateFor("nego3")).blocks; // B 房满五唯一 → 无转嫁
    expect(F.length).toBeGreaterThan(0);
    expect(stateFor("nego3").vat + stateFor("nego3").sellerTax).toBe(0);
    expect(buildScene(stateFor("nego3")).primary!.action).toBe("next");

    const S = stateFor("nego3");
    S.house = HOUSES.find((h) => h.id === "F")!; // F 房不满 2 年
    S.slash = 0;
    derive(S);
    const v = buildScene(S);
    expect(optActions(v)).toEqual(["net:yes", "net:ask", "net:no"]);
    expect(v.primary).toBeNull();
  });

  it("中介费屏：2% 与 1% 两档，价差写在标签里", () => {
    const v = buildScene(stateFor("feeNego"));
    expect(optActions(v)).toEqual(["fee:0.02", "fee:0.01"]);
  });
});

describe("贷款方式 / 算账 / 筹钱", () => {
  it("贷款方式屏：三种方式 + 四档首付（含全款）", () => {
    const v = buildScene(stateFor("loanType"));
    expect(optActions(v)).toEqual(["lt:comm", "lt:combo", "lt:gjj"]);
    const ds = find(v, "downSteps")[0];
    if (ds.t === "downSteps") {
      expect(ds.items.map((i) => i.action)).toEqual(["ds:0", "ds:0.3", "ds:0.5", "ds:1"]);
    }
  });

  it("算账屏：资金充足 / 缺口两种结论；主按钮都走 fundsNext（充足时不进筹钱屏）", () => {
    const richS = stateFor("funds");
    richS.cash = 5000000; /* 现金远超需现金 → 资金充足 */
    const rich = buildScene(richS);
    /* 不能是 next：next 只是按流程顺序推进，会把「资金充足」的用户丢进筹钱屏 */
    expect(rich.primary!.action).toBe("fundsNext");
    expect(rich.primary!.title).toContain("资金充足");
    expect(ctaActions(rich)).toContain("backLoanType");

    const S = stateFor("funds");
    S.slash = 0.05;
    derive(S);
    S.cash = 100000; // 制造缺口
    const short = buildScene(S);
    expect(short.primary!.title).toContain("先筹钱");
    expect(short.primary!.action).toBe("fundsNext");
  });

  it("筹钱屏：没有缺口时不摆「缺口 X 万 / 缺口已补齐」字眼", () => {
    const S = stateFor("borrow");
    S.cash = 5000000; /* 现金远超需现金 → 无缺口 */
    const v = buildScene(S);
    const texts = JSON.stringify(v.blocks);
    expect(texts).not.toContain("缺口 0.00 万");
    expect(texts).not.toContain("缺口已补齐");
    expect(v.primary!.title).toContain("签约");
    const title = find(v, "title")[0];
    if (title.t === "title") {
      expect(title.text).toBe("资金已备齐");
    }
  });

  it("筹钱屏：三条渠道 + 换房出口；缺口超上限时主按钮变「换套便宜点的」", () => {
    const v = buildScene(stateFor("borrow"));
    expect(optActions(v)).toEqual(["bor:family", "bor:gjj", "bor:credit", "changeHouse"]);

    const S = stateFor("borrow");
    S.house = HOUSES.find((h) => h.id === "E")!;
    S.slash = 0.04;
    derive(S);
    S.cash = 500000; // 缺口远超 70 万上限
    const over = buildScene(S);
    expect(over.primary!.action).toBe("changeHouse");
  });
});

describe("签约 / 网签（12 项深坑）", () => {
  it("签字屏：两组共 6 项清单 + 定金价条 + 快速路径；主按钮走付款确认", () => {
    const v = buildScene(stateFor("sign"));
    const secs = find(v, "clSec");
    expect(secs).toHaveLength(2);
    expect(secs.reduce((a, s) => a + (s.t === "clSec" ? s.rows.length : 0), 0)).toBe(6);
    expect(v.primary!.action).toBe("pay:deposit");
    expect(ctaActions(v)).toContain("fastSign");
    const bar = find(v, "pricebar")[0];
    if (bar.t === "pricebar") {
      expect(bar.label).toContain("定金");
    }
  });

  it("网签屏：另有 6 项清单 + 违约金价条；资格不过时改为「无法网签」拦截卡", () => {
    const v = buildScene(stateFor("signNet"));
    const rows = find(v, "clSec").reduce((a, s) => a + (s.t === "clSec" ? s.rows.length : 0), 0);
    expect(rows).toBe(6);
    expect(v.primary!.action).toBe("pay:firstPay");

    const S = stateFor("signNet");
    S.judge = { ok: false, title: "限购 · 不符合条件", reason: "非沪籍社保满 1 年：外环内限购 1 套，名下已有住房。" };
    const blocked = buildScene(S);
    const pit = find(blocked, "pit")[0];
    if (pit.t === "pit") {
      expect(pit.title).toContain("无法网签");
    }
    expect(blocked.primary).toBeNull();
    expect(ctaActions(blocked)).toEqual(["backSelect", "requalify"]);
  });

  it("清单项状态：没提 / 已写进合同 / 不写（带代价）三态各有文案", () => {
    const S = stateFor("sign");
    const v0 = buildScene(S);
    const first = find(v0, "clSec")[0];
    if (first.t === "clSec") {
      expect(first.rows.every((r) => r.pill === "没提")).toBe(true);
    }
    S.con = { chan: "do", owner: "no" };
    const v = buildScene(S);
    const row = find(v, "clSec").flatMap((s) => (s.t === "clSec" ? s.rows : []));
    expect(row.find((r) => r.k === "chan")!.pill).toBe("已写进合同");
    expect(row.find((r) => r.k === "owner")!.pill).toContain("不写 ·");
    expect(row.find((r) => r.k === "owner")!.noNote).toBeTruthy();
  });

  it("学费单：本屏爆雷时摆 tuition 块（金额 + 拖天数）", () => {
    const S = stateFor("sign");
    S.burst = [{
      k: "chan", short: "产调（抵押 / 查封 / 居住权）", stage: "过户递交", cost: 12000, days: 15,
      text: "过户才发现房子还抵押着。", src: "签约清单「产调」你没提", fix: "签字前让中介出产调。",
    }];
    const v = buildScene(S);
    const t = find(v, "tuition")[0];
    if (t.t === "tuition") {
      expect(t.items).toHaveLength(1);
      expect(t.total).toContain("¥1.20"); // 1.2 万 → 元口径 12,000
      expect(t.total).toContain("+15 天");
    }
  });
});

describe("贷款方案 / 审批 / 合同", () => {
  it("贷款方案屏：年限三档 + 月供占收入比", () => {
    const v = buildScene(stateFor("loan"));
    const chips = find(v, "chips").find((c) => c.t === "chips" && c.key === "years");
    if (chips && chips.t === "chips") {
      expect(chips.items.map((c) => c.action)).toEqual(["ly:10", "ly:20", "ly:30"]);
    }
  });

  it("审批屏：在风控线内给通过主按钮；超线给追加首付 / 拉长年限 / 换房 / 硬上四选", () => {
    const ok = buildScene(stateFor("loanChk"));
    expect(ok.primary!.action).toBe("next");

    const S = stateFor("loanChk");
    S.loanYears = 10;
    derive(S);
    const risk = buildScene(S);
    const acts = optActions(risk);
    expect(acts).toContain("lc:pay");
    expect(acts).toContain("lc:long");
    expect(acts).toContain("lc:change");
    expect(acts).toContain("lc:stick");
    expect(risk.primary).toBeNull();
    expect(types(risk)).toContain("wait"); // 等待屏明细

    S.loanYears = 30;
    derive(S);
    expect(optActions(buildScene(S))).not.toContain("lc:long"); // 已 30 年不再建议拉长
  });

  it("贷款合同屏：补足剩余首付价条；全款改为「补足尾款」文案", () => {
    const S = stateFor("loanContract");
    const v = buildScene(S);
    expect(v.primary!.action).toBe("pay:restPay");
    const title = find(v, "title")[0];
    if (title.t === "title") {
      expect(title.text).toContain("补足首付");
    }
    S.downSel = 1;
    derive(S);
    const cash = buildScene(S);
    const t2 = find(cash, "title")[0];
    if (t2.t === "title") {
      expect(t2.text).toContain("补足尾款");
    }
  });
});

describe("过户 / 缴税领证 / 交房 / 交割 / 总账", () => {
  it("过户屏：等待屏明细 + 节点线 + 上划卡", () => {
    const v = buildScene(stateFor("transfer"));
    expect(types(v)).toContain("wait");
    expect(types(v)).toContain("rail");
    expect(types(v)).toContain("swipe");
    expect(v.primary!.action).toBe("next");
  });

  it("缴税领证屏：税费账单 + 缴税付款确认；到手价时单列转嫁金额", () => {
    const v = buildScene(stateFor("deed"));
    expect(v.primary!.action).toBe("pay:transfer");
    const rows = find(v, "rows").flatMap((r) => (r.t === "rows" ? r.items : []));
    expect(rows.some((r) => r.k.indexOf("契税") === 0)).toBe(true);
    expect(rows.some((r) => r.total)).toBe(true);

    const S = stateFor("deed");
    S.house = HOUSES.find((h) => h.id === "F")!;
    S.netDeal = true;
    derive(S);
    const withNet = find(buildScene(S), "rows").flatMap((r) => (r.t === "rows" ? r.items : []));
    expect(withNet.some((r) => r.k.indexOf("卖方税费实付") === 0)).toBe(true);
  });

  it("交房屏：4 项交割清单 + 核对（全部结清）与扣押尾款两个出口", () => {
    const v = buildScene(stateFor("handover"));
    const rows = find(v, "rows").flatMap((r) => (r.t === "rows" ? r.items : []));
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.vCls === "ok" || r.vCls === "bad")).toBe(true);
    expect(optActions(v)).toEqual(["ho:ok", "ho:hold"]);
    expect(v.primary).toBeNull();
  });

  it("交割屏：扣押尾款时才摆付款确认主按钮，否则直接查看总账", () => {
    const hold = buildScene(stateFor("settle"));
    expect(hold.primary!.action).toBe("pay:holdback");

    const S = stateFor("settle");
    S.handHold = false;
    S.hand = {};
    const plain = buildScene(S);
    expect(plain.primary!.action).toBe("next");
    expect(plain.primary!.title).toContain("总账单");
  });

  it("总账屏：有学费 → 多花清单；无学费 → 0 笔多花横幅；未装修给装修入口", () => {
    const clean = buildScene(stateFor("final"));
    expect(clean.primary!.action).toBe("reset");
    expect(types(clean)).toContain("banner");
    expect(optActions(clean)).toContain("renovGo");
    expect(optActions(clean)).toContain("renovSkip");

    const S = stateFor("final");
    S.lessons = [{
      k: "chan", short: "产调", stage: "过户递交", cost: 12000, days: 15,
      text: "过户才发现房子还抵押着。", src: "签约清单「产调」你没提", fix: "签字前出产调。",
    }];
    const lossy = buildScene(S);
    expect(types(lossy)).toContain("lrn");
    const lrn = find(lossy, "lrn")[0];
    if (lrn.t === "lrn") {
      expect(lrn.count).toContain("1 笔");
      expect(lrn.rows).toHaveLength(1);
      expect(lrn.rows[0].t).toContain("过户才发现房子还抵押着");
    }
  });

  it("总账屏：装修已结束时不再给入口（跳过 / 装完两种结果卡）", () => {
    const skipped = stateFor("final");
    skipped.renovDone = true;
    skipped.renovSkipped = true;
    const v1 = buildScene(skipped);
    expect(optActions(v1)).not.toContain("renovGo");
    expect(ctaActions(v1)).not.toContain("renovGo");

    const done = stateFor("final");
    done.renovDone = true;
    done.renovDoneDay = 140;
    const v2 = buildScene(done);
    const banner = find(v2, "banner");
    expect(banner.some((b) => b.t === "banner" && (b.title ?? "").indexOf("装修完成") >= 0)).toBe(true);
  });

  it("风险确认记录：riskLog 有记录时总账屏列出交易凭证", () => {
    const S = stateFor("final");
    S.riskLog = [{
      type: "deposit", title: "居间签约 · 定金罚则确认", ts: "2026-09-17 10:00:00",
      detail: "签署《房地产买卖居间协议》并支付定金 19.00 万。",
    }];
    const v = buildScene(S);
    expect(types(v)).toContain("riskLog");
  });
});

describe("装修场景分组", () => {
  it("预算屏：四档预算 + 未选档位时主入口不可用", () => {
    const v = buildScene(stateFor("renovStart"));
    const grades = find(v, "grades")[0];
    if (grades.t === "grades") {
      expect(grades.items.map((g) => g.action)).toEqual([
        "renovPick:half", "renovPick:f20", "renovPick:f30", "renovPick:f40",
      ]);
    }
    expect(ctaActions(v)).toContain("renovBegin");
  });

  it("设计屏：三档设计师（免费 / 独立 / 全案）", () => {
    const v = buildScene(stateFor("renovDesign"));
    const grades = find(v, "grades")[0];
    if (grades.t === "grades") {
      expect(grades.items.map((g) => g.action)).toEqual(["renovTier:free", "renovTier:d100", "renovTier:d400"]);
    }
  });

  it("合同屏：13 项清单分四组 + 一键写清 + 签约入口", () => {
    const v = buildScene(stateFor("renovContract"));
    const secs = find(v, "clSec");
    expect(secs).toHaveLength(4);
    expect(secs.reduce((a, s) => a + (s.t === "clSec" ? s.rows.length : 0), 0)).toBe(13);
    expect(ctaActions(v)).toContain("renovWriteRisk");
    expect(ctaActions(v).filter((a) => a === "renovNext:renovDemo")).toHaveLength(2);
  });

  it("上划卡：每个装修阶段卡都带上划动作（质保屏收官指向自身以进总账）", () => {
    for (const scene of RENOV_SCENES.filter((s) => s !== "renovStart" && s !== "renovDesign" && s !== "renovContract" && s !== "renovDone")) {
      const v = buildScene(stateFor(scene));
      const swipe = find(v, "swipe")[0];
      expect(swipe, scene).toBeDefined();
      if (swipe.t === "swipe") {
        expect(swipe.action, scene).toContain("renovNext:");
        if (scene === "renovWarr") {
          expect(swipe.action, scene).toBe("renovNext:renovWarr"); // 收官 → 总账
        } else {
          expect(swipe.action, scene).not.toBe("renovNext:" + scene);
        }
      }
    }
  });

  it("增项爆单：到站爆单屏摆 burst 块（单号 / 明细 / 合计）", () => {
    const S = stateFor("renovDemo");
    S.renovPkg = "f30";
    S.renovExtra = 21100;
    S.renovBurst = [{
      no: "#01", stage: "拆除", day: 34, lines: [["铲墙 · 铲到红砖（增项价）", 13500]],
      cost: 13500, days: 0, text: "合同里没写，按增项价补 13,500。", src: "合同清单「铲墙」你没提", hint: "拆之前要一张拆改分项单。",
    }];
    S.renovBills = S.renovBurst.slice();
    const v = buildScene(S);
    const burst = find(v, "burst")[0];
    if (burst.t === "burst") {
      expect(burst.count).toBe(1);
      expect(burst.items[0].no).toBe("#01");
      expect(burst.total).toContain("¥13,500");
    }
  });

  it("装修总账：摆「签合同时的价 → 结账时的价」与完成入口", () => {
    const S = stateFor("renovDone");
    S.renovPkg = "f30";
    S.renovBudget = 264000;
    S.renovExtra = 103000;
    const v = buildScene(S);
    expect(v.blocks.length).toBeGreaterThan(0);
    expect(ctaActions(v)).toContain("renovFinish");
    const bars = find(v, "pricebar");
    expect(bars.length).toBeGreaterThan(0);
  });
});

/**
 * 选中态（on）：停留在本屏的选项 / 房源卡必须有可见的选中变化。
 * 视图侧（index.wxml + styles/flow.wxss）据此渲染「粗墨边 + 阴影 + ✓ 已选 胶囊」，
 * 这里锁住数据：同一时刻只有当前选中项 on=true（用户不会再有「点了没选上」的错觉）。
 */
describe("选中态（on）：停留本屏的选项必须一眼看得出选没选中", () => {
  it("身份屏：未选时全 off；选定后仅该身份 on", () => {
    const S = stateFor("role");
    S.role = null;
    const before = find(buildScene(S), "opts")[0];
    if (before.t === "opts") {
      expect(before.items).toHaveLength(3);
      expect(before.items.every((o) => !o.on)).toBe(true);
    }
    S.role = ROLES.trade;
    const after = find(buildScene(S), "opts")[0];
    if (after.t === "opts") {
      expect(after.items.filter((o) => o.on).map((o) => o.action)).toEqual(["role:trade"]);
    }
  });

  it("看房屏：选中的房源卡 on，同一时刻只有一张；改选自定义房源后只有自定义卡 on", () => {
    const S = stateFor("select");
    const first = find(buildScene(S), "houses")[0];
    if (first.t === "houses") {
      expect(first.items.filter((h) => h.on).map((h) => h.id)).toEqual(["B"]);
    }
    S.custom = syncCustom(defaultCustom());
    S.house = null;
    derive(S);
    const second = find(buildScene(S), "houses")[0];
    if (second.t === "houses") {
      expect(second.items.filter((h) => h.on).map((h) => h.id)).toEqual(["custom"]);
    }
  });

  it("贷款方式屏 / 中介费屏：当前选项 on（改选即转移）", () => {
    const S = stateFor("loanType");
    S.loanType = "comm";
    const lt = find(buildScene(S), "opts")[0];
    if (lt.t === "opts") {
      expect(lt.items.filter((o) => o.on).map((o) => o.action)).toEqual(["lt:comm"]);
    }
    const F = stateFor("feeNego");
    F.agentRate = 0.01;
    const fee = find(buildScene(F), "opts")[0];
    if (fee.t === "opts") {
      expect(fee.items.filter((o) => o.on).map((o) => o.action)).toEqual(["fee:0.01"]);
    }
  });

  it("筹钱屏：已用渠道 on，且标签写明已筹金额（再点一次退回）", () => {
    const S = stateFor("borrow");
    S.cash = 100000; /* 制造缺口 */
    S.usedBorrow = { family: 300000 };
    S.borrowed = 300000;
    const opts = find(buildScene(S), "opts")[0];
    if (opts.t === "opts") {
      const on = opts.items.filter((o) => o.on);
      expect(on.map((o) => o.action)).toEqual(["bor:family"]);
      expect(on[0].tag).toContain("已筹");
    }
  });
});

describe("首付档位（downSteps）：最低档写政策最低，不跟着当前选择漂移", () => {
  it("选 30% 后：最低档仍是「最低 20%」（首套组合贷）且金额/选中态正确", () => {
    const S = stateFor("loanType");
    S.downSel = 0.3;
    derive(S);
    expect(S.downRate).toBe(0.3); /* 实际首付 = 30%（最低档不能被它带跑） */
    const ds = find(buildScene(S), "downSteps")[0];
    if (ds.t === "downSteps") {
      expect(ds.min).toBe("20%"); /* 模板渲染成「最低 20%」，不重复「最低」二字 */
      expect(ds.items[0].label).toBe("最低 20%");
      expect(ds.items[0].amount).toBe(fmt(S.deal * 0.2) + " 万");
      expect(ds.items[0].active).toBe(false);
      expect(ds.items.filter((i) => i.active).map((i) => i.action)).toEqual(["ds:0.3"]);
    }
  });

  it("切回最低档（ds:0）：首付回到政策最低 15%（首套商贷），最低档高亮", () => {
    const S = stateFor("loanType");
    S.loanType = "comm";
    S.downSel = 0;
    derive(S);
    const ds = find(buildScene(S), "downSteps")[0];
    if (ds.t === "downSteps") {
      expect(ds.min).toBe("15%");
      expect(ds.items[0].label).toBe("最低 15%");
      expect(ds.items[0].active).toBe(true);
    }
    S.downSel = 0.3;
    derive(S);
    const after = find(buildScene(S), "downSteps")[0];
    if (after.t === "downSteps") {
      expect(after.min).toBe("15%"); /* 选 30% 也不影响最低档口径 */
      expect(after.items[0].amount).toBe(fmt(S.deal * 0.15) + " 万");
    }
  });
});

describe("筹钱屏：渠道可用性按缺口是否超出三渠道上限判定（单位口径回归）", () => {
  it("缺口 21.61 万（< 上限 70 万）：三条渠道可用，不出现「缺口超出可借上限」", () => {
    const S = stateFor("borrow");
    S.cash = money(S).need - 216100; /* 缺口 21.61 万（元制 216,100） */
    expect(gap(S)).toBe(216100);
    const v = buildScene(S);
    const opts = find(v, "opts")[0];
    if (opts.t === "opts") {
      const channels = opts.items.filter((o) => o.action.indexOf("bor:") === 0);
      expect(channels).toHaveLength(3);
      expect(channels.every((o) => !o.disabled)).toBe(true); /* 全被置灰 = 单位比错的症状 */
    }
    expect(JSON.stringify(v.blocks)).not.toContain("缺口超出可借上限");
    expect(v.primary!.title).toContain("先选一条渠道");
  });

  it("缺口 71 万（> 上限 70 万）：渠道置灰 + 提示换房", () => {
    const S = stateFor("borrow");
    S.cash = money(S).need - 710000; /* 缺口 71 万（刚过三渠道上限 70 万） */
    expect(gap(S)).toBe(710000);
    const v = buildScene(S);
    const opts = find(v, "opts")[0];
    if (opts.t === "opts") {
      const channels = opts.items.filter((o) => o.action.indexOf("bor:") === 0);
      expect(channels.every((o) => o.disabled)).toBe(true);
    }
    expect(JSON.stringify(v.blocks)).toContain("缺口超出可借上限");
    expect(v.primary!.title).toContain("换套便宜点的");
  });
});
