/**
 * 购房模拟器 · 场景分组「装修」v6「一个坑 + 上划节奏」.
 *
 * 口径对齐设计稿 docs/2026-09-15-装修模块-高保真设计稿.html v6：
 *  - 预算屏（renovStart）：半包 / 全包三档，选中停留展示档位底牌；
 *  - 设计屏（renovDesign）：三档设计师决策（不可上划跳过；可改选）；
 *  - 合同屏（renovContract）：13 项清单不预先标价，合同价条随写入上涨（不可上划跳过）；
 *    13 项全有结论时价条转绿；未决的 risk 项可一键写清（renovWriteRisk）；
 *  - 上划卡（10 个阶段共用）：一句现场 + 工期/工种 + 一句提醒，3 秒一屏；
 *    全包显示「最容易踩的点」，半包显示「验收 / 主材时间表」；
 *  - 总账（renovDone）：签合同时的价 → 结账时的价；计划工期 → 实际工期（双段条）；
 *    增项复盘 + 阶段柱图（柱高 = 名义工期，红 = 这一步爆雷）。
 * 纯函数，仅依赖 SimState 与 renov-data/render 工具。
 */

import { fmt, fmtN } from "./calc";
import { SimState } from "./constants";
import {
  contractAddOf,
  contractPriceOf,
  decidedCountOf,
  findRenovDef,
  paidTotalOf,
  RENOV_CONTRACT,
  RENOV_PKGS,
  RENOV_PLAN_BASE,
  RENOV_STAGES,
  RENOV_TIERS,
  renovDelayDays,
  renovPlanAbs,
  riskAddOf,
  riskLeftOf,
  wanFmt,
  writtenListOf,
  yuanFmt,
} from "./renov-data";
import type { RenovBill, RenovContractItem, RenovStageDef } from "./renov-data";
import { realOf } from "./render";
import type {
  BurstItem,
  ClRowItem,
  GradeItem,
  SceneBlock,
  SwipeCell,
} from "./scenes-common";

/** 第 N 天 → 真实日期文案（X月X日；今天为第 1 天）. */
function md(day: number): string {
  const d = realOf(day);
  return d.getMonth() + 1 + "月" + d.getDate() + "日";
}

/** 日期行（装修 N / 12 · 第 X 天 · X月X日 · 上一步 +N 天；质保屏显示完工日）. */
function dayLine(S: SimState, def: RenovStageDef): string {
  const shown = def.k === "Warr" ? S.renovDoneDay || S.renovDay : S.renovDay;
  const moved = S.renovMoved && def.k !== "Warr" ? " · 上一步 +" + S.renovMoved + " 天" : "";
  return "装修 " + def.idx + " / 12 · 第 " + shown + " 天 · " + md(shown) + moved;
}

/** 当前提醒（半包 = 验收 / 主材时间表 sky；全包 = 最容易踩的点 warm）. */
function tipOf(S: SimState, def: RenovStageDef): { label: string; tip: string; cls: "warm" | "sky" } {
  const half = S.renovPkg === "half";
  return half
    ? { label: "验收 / 主材时间表：", tip: def.help, cls: "sky" }
    : { label: "最容易踩的点：", tip: def.key, cls: "warm" };
}

/** 增项单警示块（many 时只显前 2 张完整明细 + 其余合计，控屏高）.
 *  半包走的是「自购主材踩坑」，标题与副标都要换口径——不是装修公司的增项单. */
function burstBlock(S: SimState): SceneBlock {
  const half = S.renovPkg === "half";
  const bills = S.renovBurst;
  const tc = bills.reduce((a, b) => a + b.cost, 0);
  const td = bills.reduce((a, b) => a + b.days, 0);
  const many = bills.length > 1;
  const shown = many ? bills.slice(0, 2) : bills;
  const rest = many ? bills.slice(2) : [];
  const items: BurstItem[] = shown.map((b) => ({
    no: b.no,
    stage: b.stage,
    day: b.day,
    lines: b.lines.map((l) => ({ k: l[0], v: yuanFmt(l[1]) })),
    sum: yuanFmt(b.cost) + (b.days ? " · +" + b.days + " 天" : ""),
  }));
  const big = bills.slice().sort((a, b) => b.cost - a.cost)[0];
  return {
    t: "burst",
    title: half ? "🛒 自购踩坑 " + bills.length + " 笔" : "🧾 增项单 " + bills.length + " 张",
    count: bills.length,
    src: half ? "自购主材 · 合同外的账" : "合同里没写的 · 比合同价贵 30% 以上",
    items,
    restText: rest.length ? "其余 " + rest.length + " 笔：" + rest.map((b) => b.lines[0][0]).join("、") : undefined,
    restSum: rest.length ? yuanFmt(rest.reduce((a, b) => a + b.cost, 0)) : undefined,
    hint: big.hint,
    total: yuanFmt(tc) + (td ? " · 返工 +" + td + " 天" : ""),
  };
}

/** 装修预算屏：面积 × 单价 心算 + 半包 / 全包三档（选中停留展示底牌）. */
export function sceneRenovStart(S: SimState): SceneBlock[] {
  const area = S.areaNum || parseInt(S.house!.area, 10) || 90;
  const sel = S.renovPkg;
  const items: GradeItem[] = RENOV_PKGS.map((p) => ({
    k: p.k,
    name: p.name,
    tag: p.tag,
    tagCls: p.badge,
    price: "约 " + wanFmt(area * p.perSq) + " 万",
    desc: p.desc,
    tail: sel === p.k ? p.tail : undefined,
    on: sel === p.k,
    action: "renovPick:" + p.k,
  }));
  return [
    { t: "eyebrow", text: "装修准备" },
    { t: "title", text: "定装修预算", hero: "🏗️" },
    { t: "sub", text: S.house!.name + " · " + area + "㎡ · 上海 · 半包 1000 / 全包 2000 元/㎡ 起" },
    {
      t: "rows",
      items: [{ k: area + "㎡ × " + (sel ? (RENOV_PKGS.find((p) => p.k === sel)?.perSq ?? "—") + " 元/㎡" : "— 元/㎡"), v: sel ? fmt(S.renovBudget) + " 万" : "待定", total: true }],
    },
    { t: "grades", items },
    {
      t: "cta",
      items: [{
        action: "renovBegin",
        title: sel ? "按 " + fmt(S.renovBudget) + " 万开工" : "先选一种",
        cls: sel ? "btn-ink" : "btn-disabled",
      }],
    },
    { t: "note", text: "装修支出单独记账，不影响购房现金。" },
  ];
}

/** 设计屏（决策点 ②）：三种价格，三种图纸深度（不可上划跳过）. */
export function sceneRenovDesign(S: SimState): SceneBlock[] {
  const def = findRenovDef(S.scene)!;
  const tip = tipOf(S, def);
  const items: GradeItem[] = RENOV_TIERS.map((t) => ({
    k: t.k,
    name: t.name,
    tag: t.badge,
    tagCls: "",
    price: t.price ? yuanFmt(t.price) : "0 元",
    desc: t.desc,
    tail: S.renovTier === t.k ? t.tail : undefined,
    on: S.renovTier === t.k,
    action: "renovTier:" + t.k,
  }));
  return [
    {
      t: "swipe",
      day: dayLine(S, def),
      name: "选设计师",
      one: def.one,
      tipLabel: tip.label,
      tip: tip.tip,
      tipCls: tip.cls,
    },
    { t: "grades", items },
    {
      t: "cta",
      items: [{
        action: "renovNext:renovContract",
        title: S.renovTier ? "图纸定稿 · 去签合同" : "先选一位设计师",
        cls: S.renovTier ? "btn-ink" : "btn-disabled",
      }],
    },
  ];
}

/** 合同清单单项行（不预先标价——「合同价看着低」正是这个坑本身）.
 *  半包下 halfOwn 项属「主材自购」：只列清单，不计入装修公司合同价. */
function clRow(S: SimState, it: RenovContractItem): ClRowItem {
  const half = S.renovPkg === "half";
  const own = half && it.halfOwn;
  const v = S.renovCon[it.k];
  const writeTxt = half && it.halfWrite ? it.halfWrite : it.write;
  const noLabel = half && it.halfNoLabel ? it.halfNoLabel : (it.noLabel || "明确不做");
  const noNote = half && it.halfNoNote ? it.halfNoNote : it.noNote;
  const pill = v === "do"
    ? (own ? "已列自购清单" : "已写进合同" + (it.doPrice ? " " + yuanFmt(it.doPrice) : ""))
    : v === "no" ? noLabel : "没提";
  const pillCls = v === "do"
    ? (own ? "pill-warn" : "pill-do")
    : v === "no" ? (it.noKind === "risk" ? "pill-todo" : "pill-no") : "pill-todo";
  return {
    k: it.k,
    name: it.name,
    pill,
    pillCls,
    why: it.why,
    write: v === "do" ? writeTxt : undefined,
    noNote: v === "no" ? noNote : undefined,
    doLabel: own ? "列入自购清单" : "写进合同",
    doAction: "renovCl:" + it.k + ":do",
    doOn: v === "do",
    noLabel,
    noAction: "renovCl:" + it.k + ":no",
    noOn: v === "no",
  };
}

/** 合同屏（决策点 ③，唯一的深坑）：13 项清单 + 合同价条 + 进度（不可上划跳过）. */
export function sceneRenovContract(S: SimState): SceneBlock[] {
  const half = S.renovPkg === "half";
  const def = findRenovDef(S.scene)!;
  const done = decidedCountOf(S.renovCon);
  const left = RENOV_CONTRACT.length - done;
  const written = writtenListOf(S.renovCon);
  const risks = riskLeftOf(S.renovCon);
  const riskAdd = riskAddOf(S.renovCon, S.renovPkg);
  const secs: string[] = [];
  RENOV_CONTRACT.forEach((it) => {
    if (secs.indexOf(it.sec) < 0) {
      secs.push(it.sec);
    }
  });
  const blocks: SceneBlock[] = [
    { t: "sub", text: dayLine(S, def) },
    {
      t: "pricebar",
      label: "合同价（还没签）" + (half ? " · 不含自购主材" : ""),
      value: "¥" + wanFmt(contractPriceOf(S)) + " 万",
      note: written.length
        ? "已写进去 " + written.length + " 项：" + written.slice(0, 3).join("、") + (written.length > 3 ? " 等" : "")
        : "看起来不贵——因为下面 " + RENOV_CONTRACT.length + " 项，一项都没写进去。",
      /* 13 项全有结论 = 正反馈（绿）；写清不该被染成警告色 */
      ok: left === 0,
    },
  ];
  if (half) {
    blocks.push({ t: "note", bold: "账外：", text: "门窗、柜子、瓷砖、灯具自购约 8-15 万，不进这份合同价。" });
  }
  blocks.push({ t: "prog", label: "已定", done, total: RENOV_CONTRACT.length, pct: Math.round((done / RENOV_CONTRACT.length) * 100) });
  if (risks.length) {
    blocks.push({
      t: "cta",
      items: [{ action: "renovWriteRisk", title: "先写清不能省的 " + risks.length + " 项", cls: "btn-out" }],
    });
    blocks.push({
      t: "note",
      bold: "这 " + risks.length + " 项最容易扯皮：",
      text: risks.map((it) => it.name).join("、") + "。写进去合同价 +" + wanFmt(riskAdd) + " 万；其余 " + (left - risks.length) + " 项可以自己判断。",
    });
  }
  blocks.push(...secs.map<SceneBlock>((s) => ({
    t: "clSec",
    title: s,
    count: RENOV_CONTRACT.filter((x) => x.sec === s).length + " 项",
    rows: RENOV_CONTRACT.filter((x) => x.sec === s).map((it) => clRow(S, it)),
  })));
  blocks.push({
    t: "note",
    bold: left ? "还有 " + left + " 项没提：" : RENOV_CONTRACT.length + " 项都有结论：",
    text: left
      ? "合同价只算已经定下的部分。"
      : "写进合同的按价走，明确不做的不会再产生费用。",
  });
  blocks.push({
    t: "cta",
    items: [
      { action: "renovNext:renovDemo", title: left ? "按这份清单签约（还有 " + left + " 项没提）" : "按这份清单签约 · 开工", cls: "btn-ink" },
      { action: "renovNext:renovDemo", title: "先签，以后再说（合同价最低）", cls: "btn-out" },
    ],
  });
  return blocks;
}

/** 上划卡（10 个阶段共用，3 秒一屏）：一句现场 + 工期/工种 + 一句提醒. */
export function sceneRenovCard(S: SimState): SceneBlock[] {
  const def = findRenovDef(S.scene);
  if (!def) {
    return [{ t: "sub", text: "" }];
  }
  const tip = tipOf(S, def);
  const cells: SwipeCell[] = [
    { k: "这一步工期", v: def.days + "天", note: def.daysText },
    { k: "谁在做", v: def.who },
  ];
  const blocks: SceneBlock[] = [{ t: "sub", text: dayLine(S, def) }];
  if (S.renovBurst.length) {
    blocks.push(burstBlock(S));
  }
  blocks.push({
    t: "swipe",
    name: def.name,
    one: def.one,
    cells,
    tipLabel: tip.label,
    tip: tip.tip,
    tipCls: tip.cls,
    hint: true,
    action: "renovNext:renov" + RENOV_STAGES[def.idx < RENOV_STAGES.length ? def.idx : def.idx - 1].k,
  });
  blocks.push({ t: "cta", items: [{ action: "renovNext:renov" + RENOV_STAGES[def.idx < RENOV_STAGES.length ? def.idx : def.idx - 1].k, title: def.cta, cls: "btn-out" }] });
  return blocks;
}

/** 装修完成总账屏：签合同时的价 → 结账时的价；计划工期 → 实际工期 + 阶段柱图 + 增项复盘. */
export function sceneRenovDone(S: SimState): SceneBlock[] {
  const plan = contractPriceOf(S);
  const paid = paidTotalOf(S);
  const extra = S.renovExtra;
  const pct = plan ? (extra / plan) * 100 : 0;
  const allDo: Record<string, string> = {};
  RENOV_CONTRACT.forEach((it) => {
    allDo[it.k] = "do";
  });
  const ifAll = S.renovBudget + S.renovDesignFee + contractAddOf(allDo, S.renovPkg);
  const doneDay = S.renovDoneDay || S.renovDay;
  const half = S.renovPkg === "half";
  const srcLabel = half ? "自己买主材踩的" : "合同里没写的";
  const planAbs = renovPlanAbs(S.renovStartDay); /* 计划完工日（绝对天口径：交易完成日 + 装修计划历时） */
  const extraDays = renovDelayDays(doneDay, S.renovStartDay); /* 增项返工拖出来的天数（绝对天口径） */
  const monthTxt = (extraDays / 30).toFixed(1).replace(/\.0$/, "");
  const tden = Math.max(planAbs, doneDay, 1);
  const gmax = Math.max(...RENOV_STAGES.filter((s) => s.k !== "Warr").map((s) => s.days));
  const rankBills = S.renovBills.slice().sort((a, b) => b.cost - a.cost);
  const topBills = rankBills.slice(0, 3);
  const restBills = rankBills.slice(3);
  /* 超支口径：全包「合同边界没写死」，半包「自购主材的账外成本」 */
  const whyLine = !extra
    ? "一分没多花：" + RENOV_CONTRACT.length + " 项合同清单全部写清 / 明确不做，装到哪一步都不用再掏钱。"
    : half
      ? "多出来的 " + yuanFmt(extra) + " 不是装修公司加价——是你自己买主材踩的 " + S.renovBills.length + " 笔。半包的坑不在合同上，在你跑建材市场的那几周。"
      : "多出来的 " + yuanFmt(extra) + "（+" + pct.toFixed(0) + "%）都是合同边界没写死的代价：" + S.renovBills.length + " 张增项单，装到那一步才来。把 " + RENOV_CONTRACT.length + " 项都写进合同：约 ¥" + wanFmt(ifAll) + " 万" + (paid > ifAll ? "，比现在少 " + yuanFmt(paid - ifAll) : "") + "。";

  const blocks: SceneBlock[] = [
    { t: "title", text: "装修完成", hero: "🏡" },
    { t: "sub", text: S.house!.name + " · " + S.house!.area + " · 第 " + doneDay + " 天（" + md(doneDay) + "）入住" },
    {
      t: "pricebar",
      label: "签合同时的价 → 结账时的价",
      value: "¥" + wanFmt(plan) + " 万 → ¥" + wanFmt(paid) + " 万",
      note: whyLine,
      bad: extra > 0,
    },
    {
      t: "pricebar",
      label: "计划总工期 → 实际总工期",
      value: planAbs + " 天 → " + doneDay + " 天",
      bar: { base: (planAbs / tden) * 100, over: (extraDays / tden) * 100 },
      note: extraDays
        ? "多 " + extraDays + " 天（≈ " + monthTxt + " 个月），全是 " + (half ? "自购踩坑 " + S.renovBills.length + " 笔" : S.renovBills.length + " 张增项单") + "拖出来的：等货、返工、整改各占一段。房子多空这些天，房租和房贷一样照走。"
        : "一天没多：边界写死，" + planAbs + " 天按计划走完，房子正好空这一段。",
    },
  ];

  /* 装修到底有多复杂：阶段 / 工种数 + 阶段柱图（柱高 = 名义工期，爆过单的阶段标红） */
  blocks.push({
    t: "rows",
    items: [
      { k: "阶段 / 工种", v: "12 个阶段 · 9 个工种 / 供应商" },
      { k: "柱图怎么读", v: "柱高 = 名义工期，红 = 这一步爆雷" },
    ],
  });
  blocks.push({
    t: "gantt",
    items: RENOV_STAGES.filter((s) => s.k !== "Warr").map((s) => {
      const hot = S.renovBills.some((b) => b.stage === s.name);
      return { h: Math.round(16 + (s.days / gmax) * 22), hot };
    }),
    labels: ["设计", "主材", "木瓦", "安装", "通风"],
  });

  if (S.renovBills.length) {
    blocks.push({
      t: "rows",
      items: [{ k: srcLabel + " " + S.renovBills.length + " 笔", v: yuanFmt(extra) }].concat(
        topBills.map<import("./scenes-common").RowItem>((b) => ({ k: b.stage + "阶段 · " + b.text, v: yuanFmt(b.cost) })),
      ),
    });
    if (restBills.length) {
      blocks.push({
        t: "rows",
        items: [{ k: "其余 " + restBills.length + " 笔（" + restBills.map((b) => b.stage).join("、") + "）", v: yuanFmt(restBills.reduce((a, b) => a + b.cost, 0)) }],
      });
    }
    blocks.push({
      t: "note",
      bold: "下次怎么避免：",
      text: topBills.map((b) => b.src + " → " + b.hint).join("；"),
    });
  } else {
    blocks.push({
      t: "banner",
      cls: "sky",
      title: "0 张增项单",
      desc: "合同清单 " + RENOV_CONTRACT.length + " 项逐项有结论，装到哪一步都没有「再掏钱」。",
    });
  }

  const takeaway = half
    ? "主材清单（自己买、自己比）· 验收 / 主材时间表 · 一套自己量的尺寸"
    : (S.renovTier && S.renovTier !== "free" ? "施工图 / 点位图 / 柜体图 · " : "") + (extra ? "增项单的教训" : "合同清单 " + RENOV_CONTRACT.length + " 项");
  blocks.push(
    { t: "note", bold: "你带走了：", text: takeaway },
    {
      t: "note",
      bold: "复盘：",
      text: "装修的麻烦不在干活，在签合同那 10 分钟——写清楚了，后面 100 天都省心。（工期为模拟口径：基础 " + RENOV_PLAN_BASE + " 天 + 增项返工）",
    },
    { t: "cta", items: [{ action: "renovFinish", title: "重来一次 · 换一条路", cls: "btn-ink" }] },
  );
  return blocks;
}

/** 供 scenes.ts 分发：上划卡场景 key 列表（10 个非决策阶段）. */
export const RENOV_CARD_SCENES: string[] = RENOV_STAGES
  .filter((d) => !d.pickTier && !d.contract)
  .map((d) => "renov" + d.k);
