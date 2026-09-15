/**
 * 购房模拟器 · 事件分发「装修阶段：预算决策 → 13 阶段（信息迷雾 + 随机事件 + 爆雷）→ 完成总账」.
 *
 * 从 handlers-flow.ts 拆出：final 屏的装修决策（renovGo/renovSkip）、预算屏档位
 * （renovBudgetGo）、阶段内事件选项（renovChoice）、阶段推进（renovNext）、完成回账单
 * （renovFinish）。全部分支就地修改 SimState，并通过 HandlerCtx 回调页面。
 *
 * 信息迷雾机制（口径见 renov-data.ts / renov-events.ts）：
 *  - 进入阶段（renovArrive）：先结算该阶段爆雷（mines），再按概率随机触发事件；
 *  - 事件以"具体问题"呈现，选项是自然回应：直接定 → 常埋雷；做功课 → 多花天数
 *    换真实信息（learned）；
 *  - 阶段推进（renovNext）：基础工期经模拟日历快进，做功课/返工耗时由各步就地累加；
 *  - 售后质保（Warr）：快照完工日（renovDoneDay）→ 叙事推进一年 → 结算质保期爆雷。
 */

import { fmt, fmtN } from "./calc";
import { DAYS, SimState } from "./constants";
import type { SceneKey } from "./constants";
import type { HandlerCtx } from "./handlers";
import { findRenovDef, RENOV_EVENT_PROB } from "./renov-data";
import type { RenovMine } from "./renov-data";

/** 轻提示. */
function toast(title: string): void {
  wx.showToast({ title, icon: "none" });
}

/** 随机源（可注入以便单测确定化；默认 Math.random）. */
let renovRng: () => number = Math.random;

/** 单测注入确定性随机源. */
export function setRenovRng(rng: () => number): void {
  renovRng = rng;
}

/**
 * 进入某装修阶段（进场结算）：
 * 1. 售后质保阶段先快照完工入住日（renovDoneDay），再叙事推进一年；
 * 2. 结算到站爆雷：支出计入 renovSpend、返工计入 renovDay、压力累加、记入记事；
 * 3. 按阶段概率（默认 RENOV_EVENT_PROB）从事件池随机触发 1 个事件，未命中则本阶段无事件。
 */
export function renovArrive(S: SimState, tail: string): void {
  const def = findRenovDef(tail);
  S.renovChoice = null;
  if (tail === "Warr") {
    S.renovDoneDay = S.renovDay; /* 快照完工入住日（供总账屏统计装修历时） */
    S.renovDay += 365; /* 售后质保叙事推进一年 */
  }
  const burst = S.renovMines.filter((m) => m.at === tail);
  S.renovBurst = burst;
  if (burst.length) {
    S.renovMines = S.renovMines.filter((m) => m.at !== tail);
    for (const m of burst) {
      S.renovSpend += m.cost;
      S.renovDay += m.days;
      S.stress += m.stress;
      S.renovLog.push({ stage: def?.name ?? tail, text: "🚨 " + m.log + "（支出 ¥" + fmtN(m.cost) + (m.days ? " · 返工 " + m.days + " 天" : "") + "）" });
    }
  }
  /* 随机事件：单次取随机数，[0, prob) 内按比例落位到事件池（便于测试确定化） */
  const prob = def?.prob ?? RENOV_EVENT_PROB;
  const r = renovRng();
  if (def && def.events.length && r < prob) {
    S.renovEvent = def.events[Math.floor((r / prob) * def.events.length)].id;
  } else {
    S.renovEvent = null;
  }
}

/** 装修阶段分发（前置与流程阶段均未命中后调用）. */
export function handleRenov(ctx: HandlerCtx, S: SimState, action: string): void {
  /* 交易完成 → 装修决策 */
  if (action === "renovGo") {
    if (S.renovDone) {
      return; /* 装修流程已结束（装完或跳过），忽略重复入口 */
    }
    toast("🏗️ 开始装修");
    ctx.nextScene("renovStart"); /* 先定装修预算，再进 13 阶段 */
    return;
  }
  if (action === "renovSkip") {
    S.renovDone = true;
    S.renovSkipped = true;
    toast("🏡 直接入住 · 日后有需要再装");
    ctx.nextScene("final");
    return;
  }

  /* 预算屏：选定档位（元/㎡ × 面积）→ 量房开工 */
  if (action.indexOf("renovBudgetGo:") === 0) {
    const perSq = parseInt(action.split(":")[1], 10);
    if (!perSq || !S.house) {
      return;
    }
    const area = S.areaNum || parseInt(S.house.area, 10) || 90;
    S.renovBudget = area * perSq;
    S.renovDay = (DAYS.final ?? 16) + 1; /* 交易完成次日量房 */
    S.renovLog = [];
    toast("💰 装修预算 " + fmt(S.renovBudget) + " 万 · 量房开始");
    renovArrive(S, "Design");
    ctx.nextScene("renovDesign");
    return;
  }

  /* 事件选项：就地结算耗时/支出/压力/埋雷/功课，重渲染本屏展示结果 */
  if (action.indexOf("renovChoice:") === 0) {
    const parts = action.split(":");
    const def = findRenovDef(S.scene);
    const ev = def?.events.find((e) => e.id === parts[1]);
    const opt = ev?.opts.find((o) => o.key === parts[2]);
    if (!def || !ev || !opt || S.renovChoice) {
      return; /* 未找到选项 / 已选择过（防重复提交） */
    }
    S.renovChoice = opt.key;
    const free = !!opt.freeIfStudied && S.renovLearned.indexOf(opt.freeIfStudied) >= 0;
    const cost = free ? 0 : opt.cost;
    if (opt.days) {
      S.renovDay += opt.days; /* 做功课的工期代价当场推进 */
    }
    if (cost) {
      S.renovSpend += cost;
    }
    S.stress += opt.stress;
    if (opt.mine) {
      const m: RenovMine = { ...opt.mine };
      S.renovMines.push(m); /* 盲选埋雷：不提示，at 阶段爆 */
    }
    if (opt.learned) {
      S.renovLearned.push(def.k); /* 记录做过功课（质保期等处联动） */
    }
    S.renovLog.push({
      stage: def.name,
      text: opt.log + (cost ? "（支出 ¥" + fmtN(cost) + "）" : "") + (opt.days ? "（+ " + opt.days + " 天）" : ""),
    });
    const bits: string[] = [];
    if (opt.days) {
      bits.push("+" + opt.days + " 天");
    }
    if (cost) {
      bits.push("支出 ¥" + fmtN(cost));
    }
    if (free) {
      bits.push("合同+质保金生效 · 免维修费");
    }
    toast(bits.length ? "⏳ " + bits.join(" · ") : "✔ 已记录");
    ctx.render(); /* 停留本屏：展示选择结果与解锁信息 */
    return;
  }

  /* 阶段推进：基础工期走模拟日历快进；到站先爆雷再随机触发事件 */
  if (action.indexOf("renovNext:") === 0) {
    const to = action.split(":")[1] as SceneKey;
    const cur = findRenovDef(S.scene);
    if (!cur || to === "renovDone") {
      ctx.nextScene(to); /* 总账屏无工期，直接进入 */
      return;
    }
    const fromDay = S.renovDay;
    const toDay = fromDay + cur.days;
    S.renovDay = toDay;
    if (to === "renovWarr") {
      /* 售后质保：叙事推进一年，不弹日历（月历快进不适合跨年跨度） */
      renovArrive(S, "Warr");
      toast("📅 时间来到一年后 · 售后质保期");
      ctx.nextScene(to);
      return;
    }
    ctx.openCalModal(to, fromDay, toDay);
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
