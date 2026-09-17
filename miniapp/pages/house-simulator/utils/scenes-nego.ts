/**
 * 购房模拟器 · 场景分组「多轮砍价 · 到手价 · 中介费」.
 *
 * 覆盖 4 屏：第一轮出价 / 第二轮出价（含越线叫停）/ 成交·到手价 / 中介费协商。
 * 文案与结构逐条对齐 docs/2026-09-17-购房模块-高保真设计稿.html v1。
 */

import { discountText, fmt, houseOf, NEGO_R1, nego2Options, stageDays } from "./calc";
import type { SceneKey, SimState } from "./constants";
import { screenMeta } from "./flow";
import { bubble, dayBlock, pitBlock } from "./scenes-common";
import type { OptItem, SceneBlock, SceneView } from "./scenes-common";

/** 屏首：第 N 天 + 双层时间条. */
function head(S: SimState, k: SceneKey): SceneBlock {
  const d = screenMeta(k);
  return dayBlock(S, d, stageDays(S, d));
}

/** 第一轮出价：挂牌价只是起点，先摸底再出价. */
export function sceneNego1(S: SimState): SceneView {
  const h = houseOf(S)!;
  const opts: OptItem[] = (["hard", "soft", "chat"] as const).map((k) => {
    const o = NEGO_R1[k];
    return {
      action: "n1:" + k,
      title: o.label,
      desc: o.d,
      price: k === "chat" ? "" : (o.chip * 100).toFixed(0) + "%",
      note: o.note,
    };
  });
  return {
    blocks: [
      head(S, "nego1"),
      { t: "chat", items: [bubble("中介 小王", "这套诚意挂价 " + fmt(h.price) + " 万，好好谈有空间。你的心理价多少？")] },
      { t: "opts", items: opts },
      ...pitBlock(screenMeta("nego1")),
      { t: "note", bold: "底线：", text: "房东的可让幅度约 " + (h.negotiable * 100).toFixed(0) + "%，报价越过底线会被叫停。" },
    ],
    primary: null,
  };
}

/** 第二轮出价（越线 → 卖家叫停，只剩接受或换房；未越线 → 继续谈）. */
export function sceneNego2(S: SimState): SceneView {
  const h = houseOf(S)!;
  const d = screenMeta("nego2");
  const head0 = head(S, "nego2");
  if (S.negoCap) {
    return {
      blocks: [
        head0,
        { t: "chat", items: [bubble("房东", "超过我的底线了，最多让到 " + fmt(S.deal) + " 万，一句顶八句。")] },
        {
          t: "pit", fixLabel: "怎么避免：",
          title: "压到底线以下，谈判就结束了——只剩接受或换房。",
          fix: "先摸底再出价，报价别越过房东底线。",
        },
        {
          t: "opts",
          items: [
            { action: "n2Accept", title: "接受底价 " + fmt(S.deal) + " 万", tag: "成交", tagCls: "hot", desc: "不再拉扯，后面流程照走。" },
            { action: "backSelect", title: "谈崩了，换一套", desc: "不勉强，回选房重新挑。" },
          ],
        },
        ...pitBlock(d),
      ],
      primary: null,
    };
  }
  const opts: OptItem[] = nego2Options(S).map((o) => ({
    action: "n2:" + o.k,
    title: o.label,
    desc: o.d,
    price: (o.slash * 100).toFixed(0) + "%",
  }));
  return {
    blocks: [
      head0,
      { t: "chat", items: [bubble("房东", "能谈，但你也别太狠，我再看看能让多少。")] },
      { t: "opts", items: opts },
      ...pitBlock(d),
    ],
    primary: null,
  };
}

/** 成交屏：先问一句「含税还是到手」，再落价. */
export function sceneNego3(S: SimState): SceneView {
  const h = houseOf(S)!;
  const d = screenMeta("nego3");
  const cut = h.price - S.deal;
  const sellerTax = S.vat + S.sellerTax;
  const blocks: SceneBlock[] = [
    head(S, "nego3"),
    { t: "chat", items: [bubble("中介 小王", "成了！" + fmt(S.deal) + " 万成交，比挂牌省了 " + fmt(cut) + " 万。")] },
    {
      t: "pricebar",
      label: "成交价（原挂牌 " + fmt(h.price) + " 万）",
      value: "¥" + fmt(S.deal) + " 万",
      note: "砍下 " + fmt(cut) + " 万 · " + ((S.slash || 0) * 100).toFixed(1) + "% · " + discountText(S.slash),
    },
  ];
  if (sellerTax > 0) {
    blocks.push(
      { t: "chat", items: [bubble("房东", "我也不看挂牌价了，" + fmt(S.deal) + " 万到手，税你那边包一下。")] },
      {
        t: "opts",
        items: [
          {
            action: "net:yes", title: "行，就按到手价来", price: "+" + fmt(sellerTax) + " 万", priceCls: "danger",
            desc: "看着省事，卖方税费转嫁到你头上。", note: "这笔钱在算账屏才会出现", risk: true,
          },
          {
            action: "net:ask", title: "等下，到手价是啥意思？", tag: "先问清", tagCls: "cool",
            desc: "增值税 + 附加 + 个税，约 " + fmt(sellerTax) + " 万，谁付先说明白。",
          },
          {
            action: "net:no", title: "我不同意，按含税价", tag: "省下 " + fmt(sellerTax) + " 万", tagCls: "hot",
            desc: "卖方税费由房东自担，写进合同。",
          },
        ],
      },
    );
  }
  blocks.push(...pitBlock(d));
  return {
    blocks,
    /* 无卖方税费的房源（满五唯一 / 新房）：不为了演示硬造坑，直接进入算账 */
    primary: sellerTax > 0 ? null : { title: "确认成交，进入算账", action: "next", wait: "", disabled: false },
  };
}

/** 中介费协商：1% 足够覆盖主流服务. */
export function sceneFeeNego(S: SimState): SceneView {
  const deal = S.deal;
  return {
    blocks: [
      head(S, "feeNego"),
      { t: "chat", items: [bubble("中介 小王", "房子谈妥了。中介费按惯例 2%：带看、谈判、网签、过户一条龙。")] },
      {
        t: "opts",
        items: [
          { action: "fee:0.02", title: "按 2% 给，省心", desc: "服务全包，图个顺当。", price: fmt(deal * 0.02) + " 万", on: S.agentRate === 0.02 },
          {
            action: "fee:0.01", title: "聊聊，压到 1%", tag: "省 " + fmt(deal * 0.01) + " 万", tagCls: "hot",
            desc: "1% 足够覆盖主流服务。", price: fmt(deal * 0.01) + " 万", on: S.agentRate === 0.01,
          },
        ],
      },
      ...pitBlock(screenMeta("feeNego")),
    ],
    primary: null,
  };
}