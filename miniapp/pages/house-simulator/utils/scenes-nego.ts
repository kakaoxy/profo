/**
 * 购房模拟器 · 场景分组「多轮砍价 · 到手价 · 中介费」.
 *
 * 覆盖 4 屏：第一轮砍价 / 第二轮出价 / 成交（含「到手价」暗坑与卖价叫停）/ 中介费协商。
 * 文案逐条移植自 docs/design/购房模拟器-hifi.html（PRD §7 沉浸式第一人称）。
 * 纯函数，仅依赖 SimState 与 calc 工具。
 */

import { fmt, fmtY, NEGO_R1, nego2Options, pct } from "./calc";
import { SimState } from "./constants";
import { bubble, SceneBlock } from "./scenes-common";

/** 第一轮砍价屏. */
export function sceneNego1(S: SimState): SceneBlock[] {
  const h = S.house!;
  return [
    { t: "banner", cls: "warm", title: "在谈 · " + h.name, desc: "挂牌价 " + fmt(h.price) + " 万\n" + h.intro },
    {
      t: "chat",
      items: [bubble("中介 小王", "这套房诚意挂价 " + fmt(h.price) + " 万，" + h.seller + "那边我熟，好好谈有空间。你的心理价多少？")],
    },
    {
      t: "opts",
      items: [
        { action: "n1:hard", title: "直接还价", desc: "第一天就摆底线：-6%，能行就签。", marker: "-6%" },
        { action: "n1:soft", title: "试探出价 -3%", desc: "礼貌试探：挂牌价虚高，砍一点意思意思。", marker: "-3%" },
        { action: "n1:chat", title: "先聊聊，为什么卖？", desc: "不问价，先听故事——急售的人往往最好谈。" },
      ],
    },
    {
      t: "note",
      bold: "谈判口径：",
      text: "房东的底线约在挂牌价下方 " + (h.negotiable * 100).toFixed(0) + "% 附近。第一轮报价就冲破底线，房东会直接甩脸拒绝——后面只能往回找补。",
    },
  ];
}

/** 第二轮砍价屏（依第一轮是否越线动态生成选项）. */
export function sceneNego2(S: SimState): SceneBlock[] {
  const r = nego2Options(S);
  const over = r.over;
  const h = S.house!;
  const baseChip = NEGO_R1[S.negoR1 as "hard" | "soft" | "chat"].chip;
  const score = (
    { hard: "第一轮你直接还了 -6%", soft: "第一轮你试探了 -3%", chat: "第一轮你们聊得不错" } as Record<string, string>
  )[S.negoR1 as string];
  let sellerLine: string;
  if (over) {
    sellerLine =
      baseChip > 0
        ? "低于 " + pct(baseChip) + "？这个价我做不了，真做不了。你要诚心想买，就再给我一个够得着的价。"
        : "价还没谈，你上来就压这么狠，这单没法聊。";
  } else {
    sellerLine = (
      {
        hard: "小伙子上来就砍 6%？你要真喜欢，我再看看能让多少，但你也别太狠。",
        soft: "-3% 不太够意思，除非……你再有点诚意？",
        chat: "你懂我的难处。这样吧，你要真喜欢，我再给你个实在价。",
      } as Record<string, string>
    )[S.negoR1 as string];
  }
  const opts = r.opts.map((o) => ({
    action: "n2:" + o.key,
    title: o.label,
    desc: o.d,
    marker: (o.chip * 100).toFixed(1).replace(/\.0$/, "") + "%",
  }));
  return [
    {
      t: "chat",
      items: [
        bubble("中介 小王", score + "。" + (over ? "价位过了头，" + h.seller + "这边很抵触。" : "对方在犹豫。") + "第二轮你打算怎么出？"),
        bubble(h.seller + "（房东）", sellerLine),
      ],
    },
    { t: "opts", items: opts },
    {
      t: "note",
      text: "房东可接受底线约在挂牌价下方 " + (h.negotiable * 100).toFixed(0) + "% 附近；报价高出不超过这个数才有得谈，超了会被叫停。",
    },
  ];
}

/** 成交屏（含「到手价」暗坑与卖家叫停分支）. */
export function sceneNego3(S: SimState): SceneBlock[] {
  const h = S.house!;
  const cut = h.price - S.deal;
  const off = cut / h.price;
  const blocks: SceneBlock[] = [
    {
      t: "chat",
      items: [
        bubble(h.seller + "（房东）", S.negoCap ? "这个价我真做不了，你给个准话。" : "行吧，" + fmt(S.deal) + " 万，说定。我这个人最讲信用。"),
        bubble("中介 小王", "成了！" + fmt(S.deal) + " 万成交，比挂牌省了 " + fmt(cut) + " 万。我帮你们走后续流程。"),
      ],
    },
    {
      t: "deal",
      origText: "成交价（原挂牌 " + fmtY(h.price) + "）",
      deal: fmtY(S.deal),
      chips: [
        { text: "砍下 " + fmt(cut) + " 万 · " + (off * 100).toFixed(1) + "%", cls: "badge-warm" },
        { text: (1 - off).toFixed(2) + " 折", cls: "badge-hair" },
      ],
    },
  ];
  if (S.negoCap) {
    /* 叫停：房东已亮明底线，只剩 接受底价 / 换房，不再有任何“加价”空间 */
    blocks.push({
      t: "banner",
      cls: "warm",
      title: "卖家叫停",
      desc: "超过我的底线了，最多让到 " + fmt(S.deal) + " 万，一句顶八句。",
    });
    blocks.push({
      t: "opts",
      items: [
        { action: "negoAccept", title: "接受底价 " + fmt(S.deal) + " 万", desc: "不再拉扯，按房东底线成交，后面流程照走。", marker: "成交" },
        { action: "negoQuit", title: "谈崩了，换一套", desc: "不勉强，回选房重新挑。" },
      ],
    });
  } else {
    /* —— 成交后的「到手价」暗坑 —— 仅当房源有卖方税费（非满五唯一/非新房）时出现 */
    const canTransfer = S.vat > 0 || S.sellerTax > 0;
    if (canTransfer) {
      const taxParts =
        (S.vat ? "增值税 " + fmt(S.vat) + " 万" + (S.vatAdd ? "+" + fmt(S.vatAdd) + " 万" : "") : "") +
        (S.sellerTax ? (S.vat ? "、" : "") + "个税 " + fmt(S.sellerTax) + " 万" : "");
      blocks.push(
        {
          t: "banner",
          cls: "warm",
          title: "房东补一句：这价是「到手价」",
          desc: "「我也不看挂牌价了，" + fmt(S.deal) + " 万到手，税你那边包一下。」听起来就是随口一句对吧？要不要应？",
        },
        {
          t: "opts",
          items: [
            {
              action: "n3NetYes",
              title: "行，就按到手价来",
              desc: "看着省事。但卖方税费（" + taxParts + "）也会转嫁到你头上。",
              marker: "成交",
            },
            { action: "n3NetAsk", title: "等下，到手价是啥意思？", desc: "把话说透再决定——你不知道这笔钱给谁。", marker: "先问清" },
            { action: "n3NetNo", title: "我不同意到手价，按含税价", desc: "卖方税费让房东自担，替自己省下十几万。", marker: "含税" },
          ],
        },
      );
    } else {
      blocks.push({ t: "cta", items: [{ action: "negoOk", title: "确认成交，进入算账", cls: "btn-ink" }] });
    }
  }
  return blocks;
}

/** 中介费协商屏. */
export function sceneFeeNego(S: SimState): SceneBlock[] {
  const deal = S.deal;
  return [
    { t: "title", text: "中介费 · 再谈一档" },
    {
      t: "chat",
      items: [bubble("中介 小王", "房子谈妥了。中介费按行业惯例 2%：带看、谈判、网签、过户、放款一条龙，全包。")],
    },
    {
      t: "rows",
      items: [
        { k: "成交价", v: fmtY(deal) },
        { k: "中介费 2%", v: fmtY(deal * 0.02) },
      ],
    },
    {
      t: "opts",
      items: [
        { action: "fee2", title: "按 2% 给，省心", desc: "服务全包，图个顺当。", marker: "-" + fmt(deal * 0.02) + "万" },
        { action: "fee1", title: "聊聊，压到 1%", desc: "“都是老朋友了”——小王松口。", marker: "-" + fmt(deal * 0.01) + "万" },
      ],
    },
    {
      t: "note",
      bold: "行情：",
      text: "上海中介费 1%–2% 都有，1% 足够覆盖主流服务。多问几家、敢于开口，省下的就是软装钱。中介费是服务费，与税费分开算。",
    },
  ];
}