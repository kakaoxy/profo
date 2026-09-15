/**
 * 购房模拟器 · 场景分组「装修」（信息迷雾版）.
 *
 * 覆盖 17 屏：装修预算决策（renovStart）/ 13 个装修阶段（设计量房 → 售后质保，
 * 每阶段可能随机触发"具体问题"式事件：直接定 vs 做功课，盲选埋雷后续阶段爆）/
 * 装修完成总账（renovDone：预算 vs 实际 + 装修记事复盘）。
 * 装修决策在 final 账单屏完成（开始装修 / 直接入住）；工期与增项全部动态累加。
 * 纯函数，仅依赖 SimState 与 renov-data/scenes-common 工具。
 */

import { fmt, fmtN } from "./calc";
import { DAYS, SimState } from "./constants";
import { RENOV_ALL, RENOV_STAGES, findRenovDef } from "./renov-data";
import type { RenovStageDef } from "./renov-data";
import { bubble } from "./scenes-common";
import type { OptItem, RowItem, SceneBlock } from "./scenes-common";

/** 爆雷警示条文案（支出 + 返工耗时）. */
function burstDesc(m: { text: string; cost: number; days: number }): string {
  return m.text + "（支出 ¥" + fmtN(m.cost) + (m.days ? " · 返工 " + m.days + " 天" : "") + "）";
}

/** 装修预算决策屏（开工前先定总预算，装修支出独立于购房现金记账）. */
export function sceneRenovStart(S: SimState): SceneBlock[] {
  const area = S.areaNum || parseInt(S.house!.area, 10) || 90;
  const mk = (perSq: number, name: string, desc: string): OptItem => ({
    action: "renovBudgetGo:" + perSq,
    title: name + " · 约 " + fmt(area * perSq) + " 万",
    desc: desc,
  });
  return [
    { t: "eyebrow", text: "装修准备" },
    { t: "title", text: "定装修预算", hero: "🏗️" },
    { t: "sub", text: S.house!.name + " · " + S.house!.area + " · 装修是买房之外的第二本账" },
    {
      t: "banner",
      cls: "warm",
      title: "预算怎么定",
      desc: "行业常见口径 1000-2500 元/㎡（硬装+主材，不含家电家具）。先按面积定档位——装修公司报的『全包价』只是起点，真正的总花费由后面每一个决策决定。",
    },
    {
      t: "opts",
      items: [
        mk(1000, "经济型", "约 1000 元/㎡：主材够用、造型从简，适合出租或过渡。"),
        mk(1500, "舒适型", "约 1500 元/㎡：主流档位，板材五金达标，适度设计。"),
        mk(2200, "品质型", "约 2200 元/㎡：用料讲究、定制多，工期也更长。"),
      ],
    },
    { t: "note", text: "本模拟中装修支出单独记账，不影响购房现金。" },
  ];
}

/**
 * 装修阶段通用屏（13 阶段共用）：
 * 爆雷警示（如有）→ 表面叙事 → 随机事件（问题 + 选项）或已选结果 → 中性提示 → CTA。
 */
export function sceneRenovStage(S: SimState): SceneBlock[] {
  const def: RenovStageDef | null = findRenovDef(S.scene);
  if (!def) {
    return [{ t: "sub", text: "" }];
  }
  const blocks: SceneBlock[] = [
    { t: "eyebrow", text: "装修 " + def.idx + " / 13" },
    { t: "title", text: def.name },
    { t: "sub", text: "工期约 " + def.daysText + " · 第 " + S.renovDay + " 天" },
  ];
  /* 到站爆雷：进入阶段时已结算的隐患（装修是排队踩坑的过程） */
  for (const m of S.renovBurst) {
    blocks.push({ t: "banner", cls: "warm", title: "🚨 爆雷", desc: burstDesc(m) });
  }
  blocks.push({ t: "chat", items: [bubble(def.who, def.chat)] });

  const ev = def.events.find((e) => e.id === S.renovEvent);
  if (ev && !S.renovChoice) {
    /* 事件呈现：具体问题 + 自然回应选项（不出现"要不要做功课"式元提问） */
    blocks.push({ t: "chat", items: [bubble(ev.who, ev.chat)] });
    blocks.push({
      t: "opts",
      items: ev.opts.map((o) => ({ action: "renovChoice:" + ev.id + ":" + o.key, title: o.title, desc: o.desc })),
    });
  } else if (ev && S.renovChoice) {
    const opt = ev.opts.find((o) => o.key === S.renovChoice);
    if (opt) {
      const free = !!opt.freeIfStudied && S.renovLearned.indexOf(opt.freeIfStudied) >= 0;
      const cost = free ? 0 : opt.cost;
      blocks.push({ t: "chat", items: [bubble("你", opt.title)] });
      if (opt.learned) {
        blocks.push({ t: "banner", cls: "sky", title: "📖 功课没白做 · 真实的信息", desc: opt.learned });
      }
      const result = free && opt.resultStudied ? opt.resultStudied : opt.result;
      blocks.push({
        t: "banner",
        cls: opt.learned ? "sky" : "warm",
        title: opt.learned ? "本阶段结果" : "⏳ 按原计划推进",
        desc: result + (cost ? "（支出 ¥" + fmtN(cost) + "）" : "") + (opt.days ? "（+ " + opt.days + " 天）" : ""),
      });
    }
  }
  blocks.push({ t: "note", bold: "提醒：", text: def.note });
  blocks.push({ t: "cta", items: [{ action: "renovNext:renov" + def.to, title: def.cta, cls: "btn-ink" }] });
  return blocks;
}

/** 装修完成总账屏（预算 vs 实际 + 装修记事复盘 + 13 阶段打卡）. */
export function sceneRenovDone(S: SimState): SceneBlock[] {
  const doneDay = S.renovDoneDay || S.renovDay;
  const rnDays = doneDay - (DAYS.final ?? 0);
  const rows: RowItem[] = [
    { k: "装修预算", v: fmt(S.renovBudget) + " 万" },
    { k: "增项 / 返工支出", v: "¥" + fmtN(S.renovSpend) },
    { k: "实际总花费", v: fmt(S.renovBudget + S.renovSpend) + " 万", total: true },
  ];
  if (S.renovSpend > 0 && S.renovBudget > 0) {
    rows.push({ k: "增项占比", v: ((S.renovSpend / S.renovBudget) * 100).toFixed(1) + "%" });
  }
  rows.push(
    { k: "开工 → 完工入住", v: "历时约 " + rnDays + " 天" },
    { k: "定房 → 完工", v: "全程 " + doneDay + " 天" },
  );
  const blocks: SceneBlock[] = [
    { t: "title", text: "装修完成", hero: "🏡" },
    { t: "sub", text: S.house!.name + " · 13 个阶段全部走完 · 总算能住进去了" },
    { t: "rows", items: rows },
  ];
  /* 装修记事：一路上的决策与爆雷（复盘全靠它） */
  if (S.renovLog.length) {
    blocks.push({ t: "rows", items: S.renovLog.map((l) => ({ k: "【" + l.stage + "】", v: l.text })) });
  }
  blocks.push({ t: "check", title: "装修全流程 · 13 个阶段全走完", items: RENOV_ALL.map((n) => "✓ " + n) });
  blocks.push(
    {
      t: "note",
      bold: "复盘一句话：",
      text: "装修的麻烦不在干活，在决策——每一项『看到的便宜』背后都有『真实的账单』。功课做在前面，增项就追不上你。",
    },
    {
      t: "note",
      bold: "口径说明：",
      text: "工期为模拟口径：基础工期 + 做功课与返工的额外耗时。真实装修 90㎡ 常见 3-6 个月、增项 10-30%；本表只演示『谁在什么环节偷懒，钱就在哪爆』。",
    },
    { t: "banner", cls: "sky", title: "住进去了", desc: "水电图、合同、发票、质保卡收进一个文件袋——下一个五年，它们就是你的底气。" },
    { t: "cta", items: [{ action: "renovFinish", title: "查看总账单 · 结束模拟", cls: "btn-ink" }] },
  );
  return blocks;
}

/** 供 scenes.ts 分发：装修阶段场景 key 列表（renovStart/renovDone 单独处理）. */
export const RENOV_STAGE_SCENES: string[] = RENOV_STAGES.map((d) => "renov" + d.k);
