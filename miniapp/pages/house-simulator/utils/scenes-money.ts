/**
 * 购房模拟器 · 场景分组「贷款方式 · 算账 · 筹钱 · 签约 · 网签」.
 *
 * 覆盖 5 屏：贷款方式（含首付档位）/ 算账 / 筹钱 / 签约·居间协议 / 网签·买卖合同。
 * 文案与结构逐条对齐 docs/2026-09-17-购房模块-高保真设计稿.html v1：
 * 签约 12 项深坑拆两屏（sign = 签字前查清 6 项，signNet = 合同里写死 6 项），
 * 每项只留三样：为什么 / 写清什么 / 不写的代价（「先不写」会埋雷，到那一步爆成学费单）。
 */

import { borrowOverflow, fmt, gap, gjjCap, handCash, houseOf, money, stageDays } from "./calc";
import { downRateFor, GJJ_POLICY_NOTE, LOAN_TYPES } from "./constants";
import type { SceneKey, SimState } from "./constants";
import { BORROW_CAP, BORROW_CAPS, screenMeta, SIGN_ITEMS } from "./flow";
import type { SignItem } from "./flow";
import { dayBlock, pitBlock } from "./scenes-common";
import type { ClRowItem, OptItem, SceneBlock, SceneView } from "./scenes-common";
import { netBlocked } from "./scenes-start";

/** 屏首：第 N 天 + 双层时间条. */
function head(S: SimState, k: SceneKey): SceneBlock {
  const d = screenMeta(k);
  return dayBlock(S, d, stageDays(S, d));
}

/** 出款点按钮动作（付款确认弹窗）. */
export function payAction(kind: string): string {
  return "pay:" + kind;
}

/* ============================ 12 贷款方式 ============================ */

/** 贷款方式屏：首付比例与利率随方式和套数变. */
export function sceneLoanType(S: SimState): SceneView {
  const h = houseOf(S)!;
  const m = money(S);
  const keys = ["comm", "combo", "gjj"] as const;
  /* 公积金家庭上限（沪公积金管委会〔2026〕1号）：首套 240 万 / 二套 200 万（含补充公积金） */
  const cap = gjjCap(S);
  const opts: OptItem[] = keys.map((k) => {
    const t = LOAN_TYPES[k];
    const rate = downRateFor(S.role!.k, h.ring, k);
    const shortfall = Math.max(0, S.deal - S.deal * rate - (k === "gjj" ? cap : Infinity));
    return {
      action: "lt:" + k,
      title: t.name,
      price: "首付 " + (rate * 100).toFixed(0) + "%",
      desc: t.desc,
      note: "最低首付约 " + fmt(S.deal * rate) + " 万" + (shortfall > 0 ? " · 公积金上限 " + fmt(cap) + " 万，另需现金补 " + fmt(shortfall) + " 万" : ""),
      on: S.loanType === k,
    };
  });
  /* 最低档 = 政策最低（身份 × 环线 × 贷款方式），不能拿「当前实际首付」当最低档：
   选了 30% 之后若还引用 S.downRate，最低档会跟着变成「最低 30%」，看起来像没有 15% 这一档 */
  const minRate = downRateFor(S.role!.k, h.ring, S.loanType);
  const steps = [
    { action: "ds:0", label: "最低 " + (minRate * 100).toFixed(0) + "%", amount: fmt(S.deal * minRate) + " 万", active: S.downSel === 0 },
    { action: "ds:0.3", label: "30%", amount: fmt(S.deal * 0.3) + " 万", active: S.downSel === 0.3 },
    { action: "ds:0.5", label: "50%", amount: fmt(S.deal * 0.5) + " 万", active: S.downSel === 0.5 },
    { action: "ds:1", label: "全款 100%", amount: fmt(S.deal) + " 万", active: S.downSel === 1 },
  ];
  return {
    blocks: [
      head(S, "loanType"),
      { t: "title", text: "贷款方式 · 先定门槛" },
      { t: "sub", text: "成交价 ¥" + fmt(S.deal) + " 万 · 当前首付 " + fmt(m.downCash) + " 万（含定金 " + fmt(S.deposit) + " 万）" },
      { t: "opts", items: opts },
      { t: "sect", title: "首付还能往上加", x: "贷款越少，利息越少" },
      { t: "downSteps", min: (minRate * 100).toFixed(0) + "%", items: steps },
      /* 选了「纯公积金」才摆政策口径（额度/补充/上浮）：其余方式不刷屏 */
      ...(S.loanType === "gjj" ? [{ t: "note" as const, bold: "公积金口径：", text: GJJ_POLICY_NOTE }] : []),
      ...pitBlock(screenMeta("loanType")),
    ],
    primary: { title: "选好了，去算账", action: "next", wait: "", disabled: false },
  };
}

/* ============================ 13 算账 ============================ */

/** 算账屏：首付口径 = 房款首付 + 全部税费，一次算完. */
export function sceneFunds(S: SimState): SceneView {
  const m = money(S);
  const g = gap(S);
  const rows: SceneBlock = {
    t: "rows",
    items: [
      { k: "成交价", v: "¥" + fmt(m.deal) + " 万" },
      {
        k: "房款首付（" + (S.downRate * 100).toFixed(0) + "% · " + (S.downSel === 1 ? "全款" : LOAN_TYPES[S.loanType].name) + "，含定金 " + fmt(S.deal * 0.05) + " 万）",
        v: "¥" + fmt(m.down) + " 万",
      },
      ...(m.shortfall > 0
        ? [{ k: "贷款额度不足（纯公积金上限 " + fmt(gjjCap(S)) + " 万，需现金补）", v: "¥" + fmt(m.shortfall) + " 万" }]
        : []),
      { k: "契税（" + deedRateOfPercent(S) + "）", v: "¥" + fmt(m.deedTax) + " 万" },
      { k: "登记费", v: "¥80.00" },
      { k: "中介费（" + (S.agentRate * 100).toFixed(0) + "%）", v: "¥" + fmt(m.agentFee) + " 万" },
      ...(S.netDeal ? [{ k: "卖方税费转嫁（你答应了「到手价」）", v: "¥" + fmt(m.sellerTax) + " 万" }] : []),
      { k: "首付需现金（含全部税费）", v: "¥" + fmt(m.need) + " 万", total: true },
    ],
  };
  const blocks: SceneBlock[] = [
    head(S, "funds"),
    { t: "title", text: "这笔账，先算清楚" },
    rows,
    {
      t: "pit", sky: g <= 0, fixLabel: "",
      title: g > 0 ? "还差 " + fmt(g) + " 万" : "✓ 资金充足",
      fix: g > 0
        ? "手头 " + fmt(handCash(S)) + " 万" + (S.borrowed ? " + 已筹 " + fmt(S.borrowed) + " 万" : "") + "，不够覆盖「房款首付 + 全部税费」。"
        : "手头 " + fmt(handCash(S)) + " 万" + (S.borrowed ? " + 已筹 " + fmt(S.borrowed) + " 万" : "") + "，扣除首付税费后结余 " + fmt(S.cash - m.need) + " 万。",
    },
  ];
  if (S.netDeal) {
    blocks.push({
      t: "pit",
      title: "砍价时随口应了一句「到手价」，卖方税费 ¥" + fmt(m.sellerTax) + " 万由此转嫁给你。",
      fix: "谈价先问「含税还是到手」，再落价。",
    });
  }
  blocks.push(...pitBlock(screenMeta("funds")));
  blocks.push({
    t: "cta",
    items: [{ action: "backLoanType", title: "‹ 回到贷款方式", cls: "btn-out" }],
  });
  return {
    blocks,
    /* 主按钮必须走 fundsNext：缺口判定在处理器里（资金充足直接去签约，不进筹钱屏） */
    primary: g > 0
      ? { title: "先筹钱，再签约", action: "fundsNext", wait: "筹钱 1-2 周", disabled: false }
      : { title: "资金充足，去签约", action: "fundsNext", wait: "签约 1-3 天", disabled: false },
  };
}

/** 契税档位文案（按面积 × 家庭套数）. */
function deedRateOfPercent(S: SimState): string {
  const area = S.areaNum || 0;
  const rate = area <= 140 ? 0.01 : S.role && S.role.k === "invest" ? 0.02 : 0.015;
  return (rate * 100).toFixed(1) + "%";
}

/* ============================ 14 筹钱 ============================ */

/** 筹钱屏：不同来路的钱，代价完全不同. */
export function sceneBorrow(S: SimState): SceneView {
  const g = gap(S);
  /* 缺口是否超出三渠道合计上限：单位换算收在 calc.borrowOverflow 里 */
  const over = borrowOverflow(S);
  const opts: OptItem[] = [
    {
      action: "bor:family", title: "向亲友借款", desc: "视缺口借入，无利息压力。",
      tag: "最多 " + BORROW_CAPS.family + " 万", disabled: over,
    },
    {
      action: "bor:gjj", title: "提取公积金", desc: "二手房通常不能直接提取付首付，此处仅作额度演示。",
      tag: "最多 " + BORROW_CAPS.gjj + " 万", disabled: over,
    },
    {
      action: "bor:credit", title: "信用贷 / 消费贷", desc: "门槛低放款快，但资金用途属监管红线。",
      tag: "⚠️ 红线", tagCls: "hot", disabled: over,
    },
    {
      action: "changeHouse", title: "换套便宜点的", desc: "回选房重新挑一套总价更低的。",
      tag: "借款将退还",
    },
  ].map((o) => {
    /* 已用的渠道：支出金额 + 选中态（再点一次退回该渠道） */
    const key = o.action.indexOf("bor:") === 0 ? o.action.slice(4) : "";
    const used = key ? S.usedBorrow[key] || 0 : 0;
    return used > 0 ? { ...o, tag: "已筹 " + fmt(used) + " 万 · 点一下退回", on: true } : o;
  });
  const blocks: SceneBlock[] = [
    head(S, "borrow"),
    /* 没有缺口时不摆「缺口 X 万 / 缺口已补齐」这类字眼（用户只关心还差多少、怎么补） */
    { t: "title", text: g > 0 ? "怎么补上这 " + fmt(g) + " 万？" : "资金已备齐" },
    {
      t: "sub",
      text: "手头 " + fmt(handCash(S)) + " 万" + (S.borrowed ? " · 已筹 " + fmt(S.borrowed) + " 万" : "")
        + (g > 0 ? " · 缺口 " + fmt(g) + " 万" : "")
        + " · 三条借款渠道合计上限 " + BORROW_CAP + " 万",
    },
    { t: "opts", items: opts },
  ];
  if (over) {
    blocks.push({
      t: "pit", fixLabel: "",
      title: "缺口超出可借上限",
      fix: "硬撑不现实。换一套总价更低的房源，比借钱更划算。",
    });
  }
  if (S.borrowed > 0) {
    blocks.push({ t: "note", bold: "已筹：", text: fmt(S.borrowed) + " 万" + (g <= 0 ? " · 已够覆盖首付与税费" : " · 仍差 " + fmt(g) + " 万") });
  }
  blocks.push(...pitBlock(screenMeta("borrow")));
  let primary: SceneView["primary"];
  if (g <= 0) {
    primary = { title: "签约 · 付定金", action: "next", wait: "约 1-3 天", disabled: false };
  } else if (over) {
    primary = { title: "缺口过大 · 换套便宜点的", action: "changeHouse", wait: "", disabled: false };
  } else {
    primary = { title: "还差 " + fmt(g) + " 万 · 先选一条渠道", action: "next", wait: "", disabled: true };
  }
  return { blocks, primary };
}

/* ============================ 15/16 签约 · 网签（12 项深坑）============================ */

/** 签约清单一项 → 清单行. */
function clRow(S: SimState, it: SignItem): ClRowItem {
  const v = S.con[it.k];
  const costTxt = it.omit.cost ? "¥" + fmt(it.omit.cost * 10000) + " 万" : it.omit.risk || "有风险";
  return {
    k: it.k,
    name: it.name,
    pill: v === "do" ? "已写进合同" : v === "no" ? "不写 · " + costTxt : "没提",
    pillCls: v === "do" ? "pill-do" : v === "no" ? "pill-todo" : "pill-no",
    why: it.why,
    write: v === "do" ? it.write : undefined,
    noNote: v === "no" ? it.omit.text : undefined,
    doLabel: "写进合同",
    doAction: "cl:" + it.k + ":do",
    doOn: v === "do",
    noLabel: "先不写",
    noAction: "cl:" + it.k + ":no",
    noOn: v === "no",
  };
}

/** 本屏爆出的学费单. */
export function tuitionBlock(S: SimState): SceneBlock[] {
  if (!S.burst.length) {
    return [];
  }
  const cost = S.burst.reduce((a, b) => a + b.cost, 0);
  const days = S.burst.reduce((a, b) => a + b.days, 0);
  return [{
    t: "tuition",
    title: "🧾 学费单 " + S.burst.length + " 张",
    src: "合同里没写清 · 到这一步才来",
    items: S.burst.map((b) => ({
      name: b.short,
      amount: b.cost ? "¥" + fmt(b.cost) : b.risk || "有风险",
      text: b.text,
    })),
    total: "本次合计 ¥" + fmt(cost) + (days ? " · +" + days + " 天" : ""),
  }];
}

/** 签约两屏的公共骨架（清单 + 进度 + 结论 + 主按钮 + 快速路径）. */
function checkScreen(S: SimState, key: "sign" | "signNet", items: SignItem[]): SceneView {
  const done = items.filter((it) => S.con[it.k]).length;
  const secs: string[] = [];
  for (const it of items) {
    if (secs.indexOf(it.sec) < 0) {
      secs.push(it.sec);
    }
  }
  const blocks: SceneBlock[] = [head(S, key), ...tuitionBlock(S)];
  if (key === "sign") {
    blocks.push({
      t: "pricebar",
      label: "签字时锁定的钱（定金）",
      value: "¥" + fmt(S.deal * 0.05) + " 万",
      note: "成交价 5% · 不超合同价 20% · 一旦签字：买方违约不退，卖方违约双倍返还",
    });
  } else {
    blocks.push({
      t: "pricebar",
      label: "网签后违约的代价",
      value: "¥" + fmt(S.deal * 0.2) + " 万",
      note: "房价 20% · 已经不再是「定金没了」那么简单",
    });
  }
  blocks.push({ t: "prog", label: "已定", done, total: items.length, pct: Math.round((done / items.length) * 100) });
  for (const sec of secs) {
    const rows = items.filter((it) => it.sec === sec).map((it) => clRow(S, it));
    blocks.push({ t: "clSec", title: sec, count: rows.filter((r) => r.doOn || r.noOn).length + " / " + rows.length, rows });
  }
  blocks.push(
    done === items.length
      ? { t: "note", text: "这一屏写清了：没写的项目，到那一步就会以「学费单」的形式回来。" }
      : { t: "pit", fixLabel: "", title: "还有 " + (items.length - done) + " 项没结论——没写的，到那一步才来。" },
    { t: "cta", items: [{ action: "fastSign", title: "都不写，先签（最快）", cls: "btn-out" }] },
  );
  return {
    blocks,
    primary: key === "sign"
      ? { title: "签署居间协议 · 付定金 " + fmt(S.deal * 0.05) + " 万", action: payAction("deposit"), wait: "", disabled: false }
      : { title: "确认网签 · 支付首付先付部分", action: payAction("firstPay"), wait: "备方案 1-3 天", disabled: false },
  };
}

/** 签约 · 居间协议屏（签字前查清 6 项 + 合同里写死 6 项的前两屏）. */
export function sceneSign(S: SimState): SceneView {
  return checkScreen(S, "sign", SIGN_ITEMS.filter((it) => it.half === "sign"));
}

/** 网签 · 买卖合同屏（资格不过 → 网签备案真的过不去）. */
export function sceneSignNet(S: SimState): SceneView {
  if (!S.judge || !S.judge.ok) {
    return netBlocked(S);
  }
  return checkScreen(S, "signNet", SIGN_ITEMS.filter((it) => it.half === "signNet"));
}