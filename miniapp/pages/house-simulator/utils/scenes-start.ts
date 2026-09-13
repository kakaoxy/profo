/**
 * 购房模拟器 · 场景分组「开场 · 身份 · 现金 · 选房 · 资格」.
 *
 * 覆盖 7 屏：开始 / 身份角色 / 可动用现金 / 自定义房源 / 选房 / 资格问答 / 资格拦截。
 * 文案逐条移植自 docs/design/购房模拟器-hifi.html（PRD §7 沉浸式第一人称）。
 * 纯函数，仅依赖 SimState 与 calc/constants 工具。
 */

import { buildQA, fmt, QA_DEFS } from "./calc";
import { downRateFor, HOUSES, LOAN_TYPES, ROLES, SimState } from "./constants";
import { bubble, HouseCardItem, SceneBlock } from "./scenes-common";

/** 开始屏. */
export function sceneStart(): SceneBlock[] {
  return [
    { t: "eyebrow", text: "沉浸式流程模拟 · 10 分钟" },
    { t: "title", text: "在上海，\n买下第一套房", big: true },
    { t: "sub", text: "从选房到交房，以第一人称走完全流程：身份、选房、资格、砍价、算钱、借款、贷款、过户。每一步都算给你看。" },
    {
      t: "banner",
      cls: "sky",
      title: "你会遇到",
      desc: "身份角色（刚需 / 置换 / 投资）· 可动用现金预设 · 限购问答树 · 多轮砍价博弈与「到手价」暗坑 · 自定义房源 · 贷款方式选择（商贷/组合/公积金）· 资金缺口与红线借款 · 组合贷月供 · 资金监管到领证放款",
    },
    { t: "note", text: "演示数据 · 计算结果仅供参考，以政府部门、银行、税务机关为准。本模拟不收集任何个人信息。" },
    { t: "cta", items: [{ action: "role", title: "开始模拟", cls: "btn-ink" }] },
  ];
}

/** 身份角色屏. */
export function sceneRole(S: SimState): SceneBlock[] {
  const opts = (Object.keys(ROLES) as (keyof typeof ROLES)[]).map((k) => {
    const r = ROLES[k];
    return {
      action: "role:" + k,
      title: r.emoji + " " + r.name,
      desc: r.desc,
      marker: r.owned === 0 ? "首套" : k === "invest" ? "二套" : "置换",
    };
  });
  return [
    { t: "eyebrow", text: "第一步 · 你的身份" },
    { t: "title", text: "你为什么买房？" },
    { t: "sub", text: "身份决定贷款利率、名下套数与税费口径；首付比例在选定贷款方式后确定（商贷最低 15%）。先定身份，再挑房子。" },
    { t: "opts", items: opts },
    { t: "note", bold: "提示：", text: "置换（卖一买一）按首套首付与利率，且一年内卖房再买房个税可退；投资二套首付与利率上浮（二套公积金 3.075% / 商贷 3.06%），且可能触发房产税（上海试点）。" },
  ];
}

/** 可动用现金屏. */
export function sceneCash(S: SimState): SceneBlock[] {
  const presets: [number, string, string][] = [
    [50, "50 万", "刚工作不久，积蓄不多——选房按“够得着”来。"],
    [70, "70 万", "不上不下，最常见的状态。"],
    [100, "100 万", "有备而来，从容一点。"],
    [200, "200 万", "准备充分，可覆盖换房周期。"],
    [300, "300 万", "资金雄厚，几乎不为首付发愁。"],
  ];
  const opts = presets.map((p) => {
    const sel = S.cashSet && S.cash === p[0] * 10000;
    return {
      action: "cash:p" + p[0],
      title: p[1],
      desc: p[2],
      marker: sel ? "已选" : p[0] + "万",
    };
  });
  return [
    { t: "title", text: "你能拿出多少现金？" },
    { t: "sub", text: "首付 = 房款首付 + 全部交易税费，都要从你手头这沓现金里出。先亮家底，后面才不会到算账时傻眼。" },
    { t: "opts", items: opts },
    { t: "form-cash" },
    { t: "note", bold: "为什么先问现金：", text: "同样一套房，手头 50 万和 300 万，面临的方案天差地别——这道题决定你后面要不要借钱、借多少。" },
  ];
}

/** 自定义房源屏. */
export function sceneCustom(): SceneBlock[] {
  return [
    { t: "title", text: "自定义一套房源" },
    { t: "sub", text: "预设房源不够贴身？把自己的预算和税费条件填进去，后面照常核验资格、砍价。" },
    { t: "form-custom" },
    { t: "note", bold: "说明：", text: "议价空间（房东可让幅度）按默认 5% 计；面积 ≤140㎡ 契税 1%，否则首套 1.5% / 二套 2%。填完即可模拟，全程不落库。" },
    { t: "cta", items: [{ action: "custOk", title: "确认这套 · 去核验资格", cls: "btn-ink" }] },
  ];
}

/** 选房屏（预设房源 + 自定义入口）. */
export function sceneSelect(S: SimState): SceneBlock[] {
  const hh: HouseCardItem[] = HOUSES.map((h) => {
    const downEst = fmt(h.price * downRateFor(S.role!.k, h.ring, S.loanType));
    return {
      id: h.id,
      emoji: h.emoji,
      thumbCls: h.thumbCls,
      tag: h.tag,
      tagCls: h.tagCls,
      name: h.name,
      ringTag: h.ring === "内" ? "外环内" : "外环外",
      meta: h.area + " · " + h.type + " · 首付约 " + downEst + " 万 · 卖家 " + h.seller,
      price: fmt(h.price) + "万",
      cut: "可砍 " + (h.negotiable * 100).toFixed(0) + "%",
    };
  });
  hh.push({
    id: "custom",
    emoji: "✏️",
    thumbCls: "thumb-c",
    tag: "自由填写",
    tagCls: "badge-hair",
    name: "自定义房源",
    ringTag: "",
    meta: "挂牌价 / 面积 / 环线 / 税费条件全由你定——用你自己的房价和年限。",
    price: "✨ 造一套自己的房子",
    cut: "",
  });
  return [
    {
      t: "chat",
      items: [
        bubble("中介 小王", "钥匙在手，几个盘随便挑：200 万到 1600 万都有。先看哪套？税费和议价空间差挺多的——满五唯一、满二不唯一、还有一套不满 2 年要缴全额增值税。也可以说个数，我给你现造一套。"),
      ],
    },
    {
      t: "note",
      bold: "身份：",
      text: S.role!.emoji + " " + S.role!.name + " · 现金 " + fmt(S.cash) + " 万 · 首付约 " + (S.downRate * 100).toFixed(0) + "%（默认" + LOAN_TYPES[S.loanType].name + "估算，选房后可调）",
    },
    { t: "houses", items: hh },
  ];
}

/** 资格问答屏. */
export function sceneQa(S: SimState): SceneBlock[] {
  const steps = buildQA(S);
  const cur = steps[S.qaProg];
  const d = QA_DEFS[cur];
  const opts = d.opts.map((o) => ({ action: "qa:" + cur + ":" + o[0], title: o[1] }));
  const blocks: SceneBlock[] = [
    { t: "dots", items: steps.map((_, i) => ({ on: i <= S.qaProg })) },
    { t: "title", text: d.q },
    { t: "sub", text: "答案只用于本机判定，不会上传或收集。" },
    { t: "opts", items: opts },
  ];
  if (S.qaProg > 0) {
    blocks.push({ t: "link", action: "qaBack", text: "‹ 上一步" });
  }
  return blocks;
}

/** 资格拦截屏（核验通过 / 被限购）. */
export function sceneBlocked(S: SimState): SceneBlock[] {
  const j = S.judge!;
  return [
    { t: "banner", cls: "warm", title: (j.ok ? "✓ " : "✕ ") + j.title, desc: j.reason },
    {
      t: "cta",
      items: [
        { action: "select", title: "换一套试试", cls: "btn-out" },
        { action: "start", title: "放弃模拟", cls: "btn-ink" },
      ],
    },
  ];
}