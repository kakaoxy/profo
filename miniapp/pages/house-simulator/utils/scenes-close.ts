/**
 * 购房模拟器 · 场景分组「过户 · 缴税领证 · 交房 · 交割结算 · 总账」.
 *
 * 覆盖 5 屏（20/21/22/23/24）：过户递交（等待屏）/ 缴税领证（上划卡 + 税费账单）/
 * 交房交割（4 项核对 + 尾款扣押）/ 交割结算 / 完成总账（该掏的→实际掏的 + 经历周期对比 + 学费清单）。
 * 文案与结构逐条对齐 docs/2026-09-17-购房模块-高保真设计稿.html v1。
 * 交易完成后接装修模块（装修 14 屏口径见 scenes-renov.ts），总账屏保留装修入口与装修总账。
 */

import { fmt, fmtN, money, lossRows, stageDays, pitDays, expDays } from "./calc";
import { NODES, SimState } from "./constants";
import { HAND_ITEMS, NODE_DAYS, REAL_MAX, screenMeta, SIGN_ITEMS } from "./flow";
import { contractPriceOf, paidTotalOf } from "./renov-data";
import { bubble, dayBlock, pitBlock, waitBlock } from "./scenes-common";
import type { OptItem, RowItem, SceneBlock, SceneView } from "./scenes-common";
import { payAction, tuitionBlock } from "./scenes-money";
import type { SceneKey } from "./constants";

/** 屏首：第 N 天 + 双层时间条. */
function head(S: SimState, k: SceneKey): SceneBlock {
  const d = screenMeta(k);
  return dayBlock(S, d, stageDays(S, d));
}

/** 12 段节点线（已完成 / 当前 / 未到）：过户与领证屏上划卡下方用. */
function rail(S: SimState): SceneBlock {
  const cur = screenMeta(S.scene).node;
  return {
    t: "rail",
    segs: NODES.map((_, i) => (i < cur ? "done" : i === cur ? "cur" : "future")),
  };
}

/** 上划卡（购房版）：一句现场 + 坑（不设上划动作：主按钮才是唯一出口，避免绕过付款确认）. */
function card(k: SceneKey): SceneBlock {
  const d = screenMeta(k);
  return { t: "swipe", name: d.name, one: d.one, cells: [], pit: d.pit, fix: d.fix };
}

/* ============================ 20 过户递交 ============================ */

/** 过户递交屏：材料已递交，交易中心核价审税. */
export function sceneTransfer(S: SimState): SceneView {
  const row = okBlock([
    { k: "交易中心", v: "已受理 · 出具收件收据" },
    { k: "审税状态", v: "审税中（约 7 天）" },
    { k: "到场核验", v: "买卖双方本人到场" },
  ]);
  return {
    blocks: [
      head(S, "transfer"),
      ...tuitionBlock(S),
      card("transfer"),
      rail(S),
      row,
      ...waitBlock(screenMeta("transfer")),
    ],
    primary: { title: "材料已递交 · 等待审税", action: "next", wait: "审税 7-15 天", disabled: false },
  };
}

/* ============================ 21 缴税领证 ============================ */

/** 缴税领证屏：缴清税费、领新产证、产证拍照给银行. */
export function sceneDeed(S: SimState): SceneView {
  const m = money(S);
  const rows: SceneBlock = okBlock([
    { k: "契税（" + (m.deal ? ((m.deedTax / m.deal) * 100).toFixed(1) : "0") + "%）", v: "¥" + fmt(m.deedTax) + " 万" },
    { k: "登记费（不动产登记费）", v: "¥80.00" },
    { k: "中介费（" + (S.agentRate * 100).toFixed(0) + "%）", v: "¥" + fmt(m.agentFee) + " 万" },
    ...(S.netDeal ? [{ k: "卖方税费实付（到手价转嫁）", v: "¥" + fmt(m.sellerTax) + " 万" }] : []),
    {
      k: "买方一次性税费",
      v: "¥" + fmt(m.deedTax + m.agentFee + m.reg + m.sellerTax) + " 万",
      total: true,
    },
  ]);
  return {
    blocks: [head(S, "deed"), ...tuitionBlock(S), card("deed"), rail(S), rows, ...pitBlock(screenMeta("deed"))],
    primary: { title: "缴税并领取新产证", action: payAction("transfer"), wait: "出证 1-3 天", disabled: false },
  };
}

/* ============================ 22 交房交割 ============================ */

/** 交房交割屏：4 项逐条核 + 尾款扣押（最后的牌）. */
export function sceneHandover(S: SimState): SceneView {
  const hold = S.deal * 0.01;
  const done = HAND_ITEMS.filter((it) => S.hand[it.k]).length;
  const rows: RowItem[] = HAND_ITEMS.map((it) => ({
    k: it.name,
    sub: it.why,
    v: S.hand[it.k] ? it.ok : it.bad,
    vCls: S.hand[it.k] ? "ok" : "bad",
  }));
  return {
    blocks: [
      head(S, "handover"),
      ...tuitionBlock(S),
      { t: "chat", items: [bubble("中介 小王", "产证、放款都齐了。交房前我把交割清单过一遍，别让前任留坑。")] },
      { t: "prog", label: "已核", done, total: HAND_ITEMS.length, pct: Math.round((done / HAND_ITEMS.length) * 100) },
      { t: "rows", items: rows },
      {
        t: "opts",
        items: [
          { action: "ho:ok", title: "逐项核对，全部结清", tag: "痛快收房", tagCls: "cool", desc: "水电煤物业当场过户，钥匙当面移交。" },
          {
            action: "ho:hold", title: "发现欠费 / 户口未迁", price: "扣押 " + fmt(hold) + " 万",
            desc: "与卖家协商：尾款扣押，迁出结清后再付。",
            note: "上海惯例：尾款（户口保证金）一般不超过合同价 5%",
          },
        ],
      },
      ...waitBlock(screenMeta("handover")),
      ...pitBlock(screenMeta("handover")),
    ],
    primary: null,
  };
}

/* ============================ 23 交割结算 ============================ */

/** 交割结算屏：结清尾款，交易流程走完. */
export function sceneSettle(S: SimState): SceneView {
  const hold = S.handHold ? S.deal * 0.01 : 0;
  const bad = (k: string): boolean => !S.hand[k];
  const rows: RowItem[] = [
    { k: "水 / 电 / 天然气", v: "已过户 · 费用结清", vCls: "ok" },
    { k: "物业费", v: bad("util") ? HAND_ITEMS[0].bad : HAND_ITEMS[0].ok, vCls: bad("util") ? "bad" : "ok" },
    { k: "户口迁出（学区、落户）", v: bad("hukou") ? HAND_ITEMS[1].bad : HAND_ITEMS[1].ok, vCls: bad("hukou") ? "bad" : "ok" },
    { k: "尾款", v: hold ? "扣押 ¥" + fmt(hold) + " 万待付" : "已结清（银行放款）", total: true },
  ];
  const blocks: SceneBlock[] = [head(S, "settle"), ...tuitionBlock(S), { t: "rows", items: rows }];
  if (hold) {
    blocks.push({
      t: "note", bold: "扣押：",
      text: "¥" + fmt(hold) + " 万从卖方房款中扣留（不占你的现金）· 卖家完成户口迁出与费用结清后划给对方。",
    });
  }
  blocks.push(...pitBlock(screenMeta("settle")));
  return {
    blocks,
    primary: hold
      ? { title: "扣押尾款 " + fmt(hold) + " 万 · 结清后支付", action: payAction("holdback"), wait: "", disabled: false }
      : { title: "查看总账单", action: "next", wait: "", disabled: false },
  };
}

/* ============================ 24 完成总账 ============================ */

/** 总账屏：该掏的 → 实际掏的 + 经历周期 → 常规周期 + 学费清单 + 装修入口. */
export function sceneFinal(S: SimState): SceneView {
  const h = S.house || S.custom;
  const m = money(S);
  const pitD = pitDays(S);
  const walked = expDays(S);
  const totalDays = walked + pitD;
  const over = totalDays > REAL_MAX;
  const penalties = lossRows(S);
  const loss = penalties.reduce((a, b) => a + b.cost, 0);
  const gmax = Math.max.apply(null, NODE_DAYS);
  const blocks: SceneBlock[] = [
    { t: "title", text: "交房了", hero: "🎉" },
    {
      t: "sub",
      text: (h ? h.name + " · " + h.area + " · " : "") + fmt(S.deal) + " 万 成交 · 钥匙到手",
    },
    {
      t: "pricebar", bad: loss > 0,
      label: "该掏的 → 实际掏的",
      value: "¥" + fmt(m.base) + " 万 → ¥" + fmt(m.total) + " 万",
      note: loss
        ? "多花的 ¥" + fmt(loss) + " 万，全部来自签字没写清与谈价没问清。写清这 " + SIGN_ITEMS.length + " 项：约 ¥" + fmt(m.base) + " 万。"
        : "一分没多花：" + SIGN_ITEMS.length + " 项逐项有结论，卖方税费谈的也是含税价。",
    },
    {
      t: "pricebar", bad: over,
      label: "你这趟的经历周期 → 常规周期",
      value: totalDays + " 天 → " + screenMeta("final").real,
      bar: {
        base: (Math.min(walked, REAL_MAX) / REAL_MAX) * 100,
        over: (Math.min(pitD, Math.max(0, REAL_MAX - walked)) / REAL_MAX) * 100,
      },
      note: (over ? "比常规更久：" : "") + "每段天数是在常规区间里抽出来的" + (pitD ? "，其中 " + pitD + " 天是坑拖出来的" : "") + "——放款排队、审税核价、公积金轮候，各段都在区间的高位时就走到 90 天以上。房子空着，房租和房贷照走。",
    },
    {
      t: "gantt",
      items: NODE_DAYS.map((v, i) => ({
        h: (10 + (v / gmax) * 26) * 2,
        hot: S.lessons.some((l) => l.stage.indexOf(NODES[i]) >= 0),
      })),
      labels: ["开始", "砍价", "签约", "贷款", "交房"],
    },
  ];
  if (penalties.length) {
    const top = penalties.slice(0, 3);
    const rest = penalties.slice(3);
    blocks.push({
      t: "lrn",
      count: "多花的 " + penalties.length + " 笔",
      sum: "¥" + fmt(loss) + " 万",
      rows: top.map((l) => ({
        b: l.short,
        t: " · " + l.text,
        r: l.cost ? "¥" + fmt(l.cost) + " 万" : l.risk || "有风险",
      })),
      rest: rest.length
        ? "其余 " + rest.length + " 笔：" + rest.slice(0, 4).map((l) => l.short).join("、") + (rest.length > 4 ? " 等" : "") + " → " + (rest.reduce((a, b) => a + b.cost, 0) ? "¥" + fmt(rest.reduce((a, b) => a + b.cost, 0)) + " 万" : "都是风险")
        : undefined,
    });
  } else {
    blocks.push({
      t: "banner", cls: "sky",
      title: "0 笔多花",
      desc: "签约清单 " + SIGN_ITEMS.length + " 项逐项有结论，卖方税费谈的是含税价——走到交房没有「再掏钱」。",
    });
  }
  blocks.push(
    { t: "note", bold: "带走：", text: "签约清单 " + SIGN_ITEMS.length + " 项 · 交割清单 " + HAND_ITEMS.length + " 项" },
    { t: "note", bold: "复盘：", text: "麻烦不在砍价，在签字那 10 分钟。" },
    { t: "note", text: "演示口径 · 以官方为准" },
  );
  if (S.riskLog.length) {
    blocks.push({
      t: "riskLog",
      items: S.riskLog.map((r) => ({ tag: r.title, ts: r.ts, detail: r.detail })),
    });
  }
  /* 装修模块：未装修给入口，装完/跳过给结果（装修口径见 design v6） */
  if (S.renovDone) {
    if (S.renovSkipped) {
      blocks.push({
        t: "banner", cls: "sky",
        title: "✅ 交易完成 · 新家已定",
        desc: (h ? h.name : "这套房") + " 的全部流程已走完。房屋为「" + (h ? h.reno : "简装") + "」，直接入住，日后有需要再装。",
      });
    } else {
      const doneDay = S.renovDoneDay || S.renovDay;
      const cost = paidTotalOf(S);
      blocks.push(
        {
          t: "banner", cls: "sky",
          title: "✅ 装修完成 · 可以入住",
          desc: "12 个装修阶段全部走完，装修实际花费 " + fmt(cost) + " 万（签约 " + fmt(contractPriceOf(S)) + " 万 + 增项 ¥" + fmtN(S.renovExtra) + "）。",
        },
        {
          t: "note", bold: "历时统计：",
          text: "装修阶段 " + Math.max(0, doneDay - S.renovStartDay - 1) + " 天 + 交易 " + S.renovStartDay + " 天 = 全程 " + doneDay + " 天（模拟口径）。真实装修 90㎡ 常见 3-6 个月，增项 10-30% 是常态。",
        },
      );
    }
  } else {
    blocks.push({
      t: "opts",
      items: [
        {
          action: "renovGo", title: "🏗️ 开始装修",
          desc: "房屋当前为「" + (h ? h.reno : "简装") + "」。先定装修预算，再走完 12 个阶段（设计 → 售后质保）——工期和增项由你的每一个决策决定。",
          tag: h ? h.reno : "",
        },
        { action: "renovSkip", title: "直接入住，不装修", desc: "可先住下，日后有需要再装。", tag: "结束" },
      ],
    });
  }
  return {
    blocks,
    primary: { title: "重来一次 · 换一条路", action: "reset", wait: "", disabled: false },
  };
}

/* ============================ 公共小工具 ============================ */

/** 账单卡（rows 块的简写）. */
function okBlock(items: RowItem[]): SceneBlock {
  return { t: "rows", items };
}