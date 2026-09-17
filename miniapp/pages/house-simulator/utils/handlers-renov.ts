/**
 * 购房模拟器 · 事件分发「装修阶段 v6：预算档位 → 12 阶段（3 处决策 + 上划卡）→ 完成总账」.
 *
 * 从 handlers-flow.ts 拆出。口径对齐设计稿 v6「一个坑 + 上划节奏」：
 *  - 决策点只有 3 处：预算档位（renovPick）、设计师档位（renovTier）、13 项合同清单（renovCl）；
 *  - 其余阶段为上划卡，推进统一走 renovNext（CTA 与页面「上划手势」共用）；
 *  - 签约（离开合同屏）时结算：没提的项埋「增项单雷」，到对应阶段按增项价爆单；
 *  - 明确不做（noKind=risk）的项当场埋「风险雷」（如空鼓 / 跳闸 / 渗水）；
 *    同一项反复点「不做」只埋一张（pushMine 按 scope 去重），改点「写进合同」撤回该雷；
 *  - 半包：halfOwn 项只列自购清单（不计合同价），签约时另埋 3 笔「自购主材」雷；
 *  - 设计师档位可改选；「先写清不能省的 N 项」（renovWriteRisk）只覆盖还没结论的项。
 *
 * 钱的三个数：合同价 = renovBudget + renovDesignFee + 写进合同的项（contractAddOf）；
 *             增项 = renovExtra（爆单累计）；结账价 = 合同价 + 增项（paidTotalOf）。
 * 全部分支就地修改 SimState，并通过 HandlerCtx 回调页面。
 */

import { fmt, fmtN } from "./calc";
import { SimState } from "./constants";
import type { HandlerCtx } from "./handlers";
import { findRenovDef, RENOV_CONTRACT, RENOV_HALF_MINES, RENOV_PKGS, RENOV_TIERS } from "./renov-data";
import type { RenovBill } from "./renov-data";

/** 轻提示. */
function toast(title: string): void {
  wx.showToast({ title, icon: "none" });
}

/** 埋雷：合同没写 / 明确不做的项，到 at 阶段爆单. 同一 scope 只埋一张（反复点「不做」不翻倍）. */
function pushMine(
  S: SimState,
  m: { at: string; days: number; lines: [string, number][]; text: string; src: string; hint: string },
  how: string,
  scope: string | null,
): void {
  if (scope && S.renovMines.some((x) => x.scope === scope)) {
    return;
  }
  S.renovMines.push({
    at: m.at,
    days: m.days || 0,
    lines: m.lines,
    text: m.text,
    src: (how ? how + " · " : "") + m.src,
    hint: m.hint,
    scope,
  });
}

/**
 * 进入某装修阶段（进场结算）：
 * 1. 售后质保阶段快照完工入住日（renovDoneDay）——质保 365 天只是展示口径，不再往工期累加；
 * 2. 结算到站雷：每笔生成增项单（RenovBill），支出计入 renovExtra、返工计入 renovDay、
 *    压力累加（步长 6：13 张全踩 = 8+78 才够到 😱）、记入记事，供本屏增项单警示条展示。
 */
export function renovArrive(S: SimState, tail: string): void {
  const def = findRenovDef(tail);
  if (tail === "Warr") {
    S.renovDoneDay = S.renovDay; /* 快照完工入住日（供总账屏统计装修历时） */
  }
  const hits = S.renovMines.filter((m) => m.at === tail);
  S.renovBurst = [];
  if (!hits.length) {
    return;
  }
  S.renovMines = S.renovMines.filter((m) => m.at !== tail);
  for (const m of hits) {
    const cost = m.lines.reduce((a, l) => a + l[1], 0);
    S.renovExtra += cost;
    S.renovDay += m.days;
    S.stress += 6;
    const bill: RenovBill = {
      no: "#" + String(S.renovBills.length + 1).padStart(2, "0"),
      stage: def?.name ?? tail,
      day: S.renovDay,
      lines: m.lines,
      cost,
      days: m.days,
      text: m.text,
      src: m.src,
      hint: m.hint,
    };
    S.renovBills.push(bill);
    S.renovBurst.push(bill);
    S.renovLog.push({
      stage: bill.stage,
      text: "🧾 " + m.text + "（¥" + fmtN(cost) + (m.days ? " · 返工 " + m.days + " 天" : "") + "）",
    });
  }
}

/** 签约结算（离开合同屏时调用）：没提的项 → 增项单雷（合同价因此看着更低）；
 *  半包再加 3 笔「自购主材」雷——13 项写清只保证不被装修公司加价，主材自购的坑与合同无关. */
export function settleContract(S: SimState): void {
  const omitItems = RENOV_CONTRACT.filter((it) => !S.renovCon[it.k] && it.omit);
  for (const it of omitItems) {
    pushMine(S, it.omit!, "", it.k);
  }
  if (S.renovPkg === "half") {
    RENOV_HALF_MINES.forEach((m, i) => pushMine(S, m, "半包 · 自购主材", "half:" + i));
  }
  S.renovLog.push({
    stage: "签合同",
    text: omitItems.length
      ? omitItems.length + " 项边界没提（合同价因此看着更低）——装到那一步才来加钱"
      : "13 项全部有结论：写进合同的按价走，不做的不再产生费用",
  });
}

/** 装修阶段分发（前置与流程阶段均未命中后调用）. */
export function handleRenov(ctx: HandlerCtx, S: SimState, action: string): void {
  /* 交易完成 → 装修决策 */
  if (action === "renovGo") {
    if (S.renovDone) {
      return; /* 装修流程已结束（装完或跳过），忽略重复入口 */
    }
    toast("🏗️ 开始装修");
    ctx.nextScene("renovStart"); /* 先定装修预算，再进 12 阶段 */
    return;
  }
  if (action === "renovSkip") {
    S.renovDone = true;
    S.renovSkipped = true;
    toast("🏡 直接入住 · 日后有需要再装");
    ctx.nextScene("final");
    return;
  }

  /* 预算屏：选定档位（就地更新合同基础价，停留本屏展示档位底牌） */
  if (action.indexOf("renovPick:") === 0) {
    const k = action.slice("renovPick:".length);
    const pkg = RENOV_PKGS.find((p) => p.k === k);
    if (!pkg || !S.house) {
      return;
    }
    const area = S.areaNum || parseInt(S.house.area, 10) || 90;
    S.renovPkg = pkg.k;
    S.renovBudget = area * pkg.perSq;
    ctx.render();
    return;
  }

  /* 预算屏 CTA：按选定档位开工（未选档位不响应） */
  if (action === "renovBegin") {
    if (!S.renovPkg) {
      return;
    }
    S.renovStartDay = S.day; /* 交易完成日（经历周期口径，装修工期与计划条的基准） */
    S.renovDay = S.day + 1; /* 交易完成次日开工 */
    S.renovLog = [];
    S.renovMoved = 0;
    S.renovLog.push({
      stage: "预算",
      text: "定了 " + (RENOV_PKGS.find((p) => p.k === S.renovPkg)?.name ?? "") + "：约 " + fmt(S.renovBudget) + " 万",
    });
    toast("🏗️ 按 " + fmt(S.renovBudget) + " 万开工");
    renovArrive(S, "Design");
    ctx.nextScene("renovDesign");
    return;
  }

  /* 设计屏：选定设计师档位（就地更新设计费，停留本屏；可改选，合同价随之重算） */
  if (action.indexOf("renovTier:") === 0) {
    const k = action.slice("renovTier:".length);
    const tier = RENOV_TIERS.find((t) => t.k === k);
    if (!tier) {
      return;
    }
    S.renovTier = tier.k;
    S.renovDesignFee = tier.price;
    S.renovLog = S.renovLog.filter((l) => l.stage !== "设计"); /* 改主意只留最后一次 */
    S.renovLog.push({
      stage: "设计",
      text: "定了 " + tier.name + (tier.price ? "（¥" + fmtN(tier.price) + "）" : "（免费）"),
    });
    ctx.render();
    return;
  }

  /* 合同清单：一键写清「不能省」的项（noKind=risk）——只覆盖还没结论的项，
     已选「不做」的项保留用户的选择（要改就点那一行的「写进合同」） */
  if (action === "renovWriteRisk") {
    const left = RENOV_CONTRACT.filter((it) => it.noKind === "risk" && !S.renovCon[it.k]);
    if (!left.length) {
      return;
    }
    for (const it of left) {
      S.renovCon[it.k] = "do";
    }
    ctx.render();
    return;
  }

  /* 合同清单：单项决策（do=写进合同 / no=明确不做；risk 项不做埋雷，改主意则撤雷） */
  if (action.indexOf("renovCl:") === 0) {
    const parts = action.split(":");
    const it = RENOV_CONTRACT.find((x) => x.k === parts[1]);
    const v = parts[2];
    if (!it || (v !== "do" && v !== "no")) {
      return;
    }
    S.renovCon[it.k] = v;
    if (v === "do") {
      S.renovMines = S.renovMines.filter((m) => m.scope !== it.k); /* 改主意写进合同：撤回已埋的雷 */
    } else if (it.noKind === "risk" && it.noMine) {
      pushMine(S, it.noMine, "你选了「" + (it.noLabel || "不做") + "」", it.k);
    }
    ctx.render(); /* 停留本屏：合同价条与进度就地更新（不回顶） */
    return;
  }

  /* 阶段推进（CTA / 上划手势共用）：签约结算 → 基础工期推进 → 到站爆单 */
  if (action.indexOf("renovNext:") === 0) {
    const to = action.slice("renovNext:".length) as SimState["scene"];
    const cur = findRenovDef(S.scene);
    if (!cur) {
      return;
    }
    /* 决策屏门槛：设计档位必须先选 */
    if (cur.pickTier && !S.renovTier) {
      return;
    }
    if (cur.contract) {
      settleContract(S);
    }
    if (cur.k === "Warr") {
      /* 质保收官 → 装修总账（无工期推进） */
      ctx.nextScene("renovDone");
      return;
    }
    S.renovDay += cur.days;
    S.renovMoved = cur.days;
    renovArrive(S, to.replace(/^renov/, ""));
    ctx.nextScene(to);
    return;
  }

  if (action === "renovFinish") {
    S.renovDone = true;
    S.renovSkipped = false;
    toast("🏡 装修全流程走完 · 乔迁大吉");
    ctx.nextScene("final");
    return;
  }
}
