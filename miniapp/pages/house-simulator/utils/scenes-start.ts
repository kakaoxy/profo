/**
 * 购房模拟器 · 场景分组「开场 · 身份 · 现金 · 选房 · 资格」.
 *
 * 覆盖 7 屏：开始 / 身份 / 亮家底 / 看房 / 自定义房源 / 资格核验 / 资格结果，
 * 外加「资格不过 → 网签被拦下」的结果屏（signNet 复用）。
 * 文案与结构逐条对齐 docs/2026-09-17-购房模块-高保真设计稿.html v1：
 * 每屏 = 第 N 天 +（双层时间条）+ 一句现场 + 选项 + 一句坑 + 一句怎么避免 + 主按钮等待承诺。
 */

import {
  buildQA, defaultCustom, fmt, judgeQA, QA_DEFS, sellerIncomeTax, sellerVatOf, stageDays, syncCustom,
} from "./calc";
import { downRateFor, HOUSES, NODES, ROLES } from "./constants";
import type { House, SceneKey, SimState } from "./constants";
import { screenMeta } from "./flow";
import { bubble, dayBlock, houseDownText, pitBlock } from "./scenes-common";
import type { ChipItem, HouseCardItem, OptItem, PrimaryAction, SceneBlock, SceneView } from "./scenes-common";

/** 现金预设档（万元）. */
const CASH = [50, 70, 100, 200, 300];

/** 现金胶囊（预设档；输入框改值时页面单独 patch 这一块）. */
export function cashChips(S: SimState): ChipItem[] {
  return CASH.map((v) => ({
    action: "cash:" + v,
    label: v + " 万",
    on: S.cashSet && S.cash === v * 10000,
  }));
}

/** 现金屏主按钮（输入框改值时页面单独 patch）. */
export function cashPrimary(S: SimState): PrimaryAction {
  return {
    title: S.cashSet ? "手头 " + (S.cash / 10000).toFixed(2) + " 万 · 去看房" : "先亮家底",
    action: "next", wait: "", disabled: !S.cashSet,
  };
}

/** 自定义房源屏主按钮（口径 / 输入改值时页面单独 patch）. */
export function customPrimary(S: SimState): PrimaryAction {
  return {
    title: S.custom ? "确认这套 · 去核验资格" : "填完再继续",
    action: "next", wait: "核验 1-3 天", disabled: !S.custom,
  };
}

/** 自定义房源展示口径（未定稿时按默认口径预览：满五唯一 · 买卖取得）. */
export function customDraftView(S: SimState): House {
  return S.custom || syncCustom(defaultCustom());
}

/** 屏首：第 N 天 + 双层时间条. */
function head(S: SimState, k: SceneKey): SceneBlock {
  const d = screenMeta(k);
  return dayBlock(S, d, stageDays(S, d));
}

/** 开始屏（开场三卡 + 12 节点一览）. */
export function sceneStart(): SceneView {
  const blocks: SceneBlock[] = [
    { t: "eyebrow", text: "沉浸式流程模拟 · 约 10 分钟" },
    { t: "title", text: "在上海，\n买下第一套房", big: true },
    {
      t: "g3",
      items: [
        { k: "流程", v: "12 个节点", n: "选房 → 资格 → 砍价 → 签约 → 过户 → 交房" },
        { k: "时间", v: "1-3 个月", n: "每段天数从常规区间里抽，你这趟实际多少天，走到头才知道" },
        { k: "坑", v: "2 处深坑", n: "签字那 10 分钟，和交房那一天" },
      ],
    },
    {
      t: "trail",
      items: NODES.map((n, i) => ({ text: i + 1 + " " + n, hot: i === 6 || i === 10 })),
    },
    ...pitBlock(screenMeta("start")),
  ];
  return { blocks, primary: { title: "开始购房之旅", action: "next", wait: "", disabled: false } };
}

/** 身份屏：身份决定首付、利率、税费口径. */
export function sceneRole(S: SimState): SceneView {
  const opts: OptItem[] = (Object.keys(ROLES) as (keyof typeof ROLES)[]).map((k) => {
    const r = ROLES[k];
    return {
      action: "role:" + k,
      title: r.emoji + " " + r.name,
      desc: r.d,
      price: r.p,
      tag: r.tag,
      tagCls: r.tagCls.replace("badge-", ""),
      note: r.note,
      on: !!S.role && S.role.k === k,
    };
  });
  const blocks: SceneBlock[] = [
    head(S, "role"),
    { t: "title", text: "你为什么买房？" },
    { t: "sub", text: "身份决定首付、利率与税费口径。" },
    { t: "opts", items: opts },
    ...pitBlock(screenMeta("role")),
  ];
  return {
    blocks,
    primary: {
      title: S.role ? "按「" + S.role.name + "」继续" : "先选一个身份",
      action: "next", wait: "", disabled: !S.role,
    },
  };
}

/** 亮家底屏：首付 = 房款首付 + 全部交易税费. */
export function sceneCash(S: SimState): SceneView {
  const blocks: SceneBlock[] = [
    head(S, "cash"),
    { t: "title", text: "你能拿出多少现金？" },
    { t: "sub", text: "首付 = 房款首付 + 全部交易税费。" },
    { t: "chips", key: "cash", items: cashChips(S) },
    { t: "form-cash" },
    ...pitBlock(screenMeta("cash")),
  ];
  return { blocks, primary: cashPrimary(S) };
}

/** 房源卡：面积 · 首付估算 · 环线 + 税费口径. */
function houseCard(S: SimState, h: House): HouseCardItem {
  const rate = S.role ? downRateFor(S.role.k, h.ring, S.loanType) : 0.2;
  const vat = h.hold !== "new" && h.holdYears < 2;
  const tax = h.hold !== "new" && !(h.holdYears >= 5 && h.unique);
  return {
    id: h.id,
    emoji: h.emoji,
    tag: h.tag,
    tagCls: h.tagCls === "badge-sky" ? "cool" : h.tagCls === "badge-warm" ? "hot" : "",
    name: h.name,
    metas: [
      h.area + " · " + houseDownText(h.price, rate) + " · " + (h.ring === "内" ? "外环内" : "外环外"),
      "税费：" + (vat ? "全额增值税" : "免增值税") + (tax ? " · 个税 1%" : " · 免个税"),
    ],
    price: h.price / 10000 + "万",
    cut: "可砍 " + (h.negotiable * 100).toFixed(0) + "%",
    on: !!S.house && S.house.id === h.id,
  };
}

/** 看房屏：先比「到手总成本」，不是只比挂牌价. */
export function sceneSelect(S: SimState): SceneView {
  const cards: HouseCardItem[] = HOUSES.map((h) => houseCard(S, h));
  cards.push({
    id: "custom", emoji: "📐", tag: "自由填写", tagCls: "", name: "自定义房源",
    metas: ["挂牌价 / 面积 / 环线 / 税费条件全由你定"], price: "填一套", cut: "",
    on: !!S.custom,
  });
  const blocks: SceneBlock[] = [
    head(S, "select"),
    { t: "chat", items: [bubble("中介 小王", "钥匙在手，200 万到 1600 万都有。先看哪套？")] },
    { t: "houses", items: cards },
    {
      t: "note", bold: "身份：",
      text: (S.role ? S.role.emoji + " " + S.role.name : "未选") + " · 现金 " + fmt(S.cash) + " 万 · 默认按组合贷最低首付估算",
    },
    ...pitBlock(screenMeta("select")),
  ];
  return {
    blocks,
    primary: {
      title: S.house ? "就这套 · 去核验资格" : "先选一套房",
      action: "next", wait: "核验 1-3 天", disabled: !S.house,
    },
  };
}

/** 自定义房源屏：四组口径 + 三行输入 + 税费口径预览. */
export function sceneCustom(S: SimState): SceneView {
  const c = customDraftView(S);
  const chipsRow = (label: string, items: ChipItem[]): SceneBlock => ({ t: "chipsRows", rows: [{ k: label, items }] });
  const blocks: SceneBlock[] = [
    head(S, "custom"),
    { t: "title", text: "自定义一套房源" },
    { t: "sub", text: "房价、环线与税费口径由你定，后面照常核验资格、砍价。" },
    { t: "form-custom" },
    chipsRow("环线", [
      { action: "ring:内", label: "外环内", on: c.ring === "内" },
      { action: "ring:外", label: "外环外", on: c.ring === "外" },
    ]),
    chipsRow("持有年限", [
      { action: "cy:0", label: "不满 2 年", on: c.holdYears === 0 },
      { action: "cy:2", label: "满 2 年", on: c.holdYears === 2 },
      { action: "cy:5", label: "满 5 年", on: c.holdYears === 5 },
    ]),
    chipsRow("是否唯一", [
      { action: "cu:1", label: "唯一", on: c.unique },
      { action: "cu:0", label: "不唯一", on: !c.unique },
    ]),
    chipsRow("取得方式", [
      { action: "ca:buy", label: "买卖取得", on: c.acq !== "inherit" },
      { action: "ca:inherit", label: "继承 / 赠与", on: c.acq === "inherit" },
    ]),
    { t: "sect", title: "税费口径", x: "按挂牌价估算" },
    { t: "rows", key: "custTax", items: customTaxRows(S) },
    { t: "note", bold: "口径：", text: customNote(c) },
    ...pitBlock(screenMeta("custom")),
    { t: "cta", items: [{ action: "backSelect", title: "用不上，回选房", cls: "btn-out" }] },
  ];
  return { blocks, primary: customPrimary(S) };
}

/** 自定义房源税费口径预览（与实付同走 sellerVatOf / sellerIncomeTax，避免两套口径）. */
export function customTaxRows(S: SimState): { k: string; v: string }[] {
  const c = customDraftView(S);
  const price = c.price;
  const inherit = c.acq === "inherit" && !(c.holdYears >= 5 && c.unique);
  const income = sellerIncomeTax(c, price);
  const vat = sellerVatOf(c, price);
  const deed = (c.areaNum || 0) <= 140 ? 0.01 : S.role && S.role.k === "invest" ? 0.02 : 0.015;
  return [
    { k: "增值税（不满 2 年全额 5% + 附加）", v: vat ? "¥" + fmt(vat) + " 万" : "免" },
    inherit
      ? { k: "卖方个税（继承 / 赠与所得：差额 × 20%）", v: "¥" + fmt(income) + " 万" + (c.base ? "" : "（原值未填，按全额计）") }
      : { k: "卖方个税（满五唯一免征，否则核定 1%）", v: income ? "¥" + fmt(income) + " 万" : "免" },
    { k: "契税（" + (deed * 100).toFixed(1) + "% · 买方承担）", v: "¥" + fmt(price * deed) + " 万" },
  ];
}

/** 自定义房源口径脚注（含继承 / 赠与的差额 20% 说明）. */
export function customNote(c: House | null): string {
  const base =
    "满 2 年免增值税；买卖所得满五唯一免个税，否则核定 1%；契税 ≤140㎡ 1%，超 140㎡ 首套 1.5% / 二套 2%；议价空间默认 5%。";
  if (c && c.acq === "inherit") {
    return base + "继承 / 赠与所得：满二、满五起算可追溯原产权人；非满五唯一时个税按（转让价 − 原值）× 20% 计——原购房发票、契税完税凭证要留好，签约时写清税费归属。";
  }
  return base;
}

/** 资格核验屏（问答树：户籍 → 居住证 → 社保年限）. */
export function sceneQa(S: SimState): SceneView {
  const steps = buildQA(S);
  const ci = Math.min(S.qaProg, steps.length - 1);
  const cur = steps[ci];
  const q = QA_DEFS[cur];
  if (!q) {
    return sceneBlocked(S);
  }
  const opts: OptItem[] = q.opts.map((o) => ({ action: "qa:" + cur + ":" + o[0], title: o[1] }));
  return {
    blocks: [
      head(S, "qa"),
      { t: "prog", label: "核验", done: ci, total: steps.length, pct: Math.round((ci / steps.length) * 100) },
      { t: "title", text: q.q, big: false },
      { t: "opts", items: opts },
      ...pitBlock(screenMeta("qa")),
    ],
    primary: null,
  };
}

/** 资格结果屏（通过 / 被限购；被限购仍可继续，但会卡在网签）. */
export function sceneBlocked(S: SimState): SceneView {
  const d = screenMeta("blocked");
  const j = S.judge ?? judgeQA(S);
  return {
    blocks: [
      dayBlock(S, d, 0),
      {
        t: "pit", sky: j.ok, fixLabel: "",
        title: (j.ok ? "✓ " : "✕ ") + j.title, fix: j.reason,
      },
      {
        t: "cta",
        items: [
          { action: "backSelect", title: "换一套试试", cls: "btn-out" },
          { action: "requalify", title: "重新核验资格", cls: "btn-out" },
        ],
      },
      ...pitBlock(d),
    ],
    primary: {
      title: j.ok ? "去砍价" : "仍然继续（会卡在网签）",
      action: "next",
      wait: j.ok ? "谈价 1-4 周" : "",
      disabled: false,
      cls: j.ok ? "" : "btn-out",
    },
  };
}

/** 资格不过 → 网签备案过不去（signNet 屏的真实拦截）. */
export function netBlocked(S: SimState): SceneView {
  const j = S.judge ?? judgeQA(S);
  const d = screenMeta("signNet");
  return {
    blocks: [
      dayBlock(S, d, 0),
      {
        t: "pit", fixLabel: "",
        title: "✕ 无法网签：" + j.title,
        fix: j.reason + "居间协议与定金已经签了，网签备案过不去——定金能不能拿回来，就看合同里那几行怎么写。",
      },
      {
        t: "cta",
        items: [
          { action: "backSelect", title: "换一套房源", cls: "btn-out" },
          { action: "requalify", title: "重新核验资格", cls: "btn-out" },
        ],
      },
    ],
    primary: null,
  };
}