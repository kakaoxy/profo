/**
 * 购房模拟器 · 页面渲染数据构建（HUD / 流程条 / 卖家情绪 / 底部弹层）.
 *
 * 从 index.ts 拆出的纯构建函数：依据全局状态 S 产出 setData 所需的
 * hud/steps/sellerBar/modal 数据（含 4 类弹层的口径与分项明细）。
 * 纯函数，不触碰 wx/Page 实例，便于单测与逐屏对照校验。
 */

import { fmt, sellerFace, stressFace } from "./calc";
import { DAYS, NODES, SCENE_NODE, SimState, STAGES } from "./constants";

/** HUD 顶部数据. */
export interface HudData {
  stageLabel: string;
  stepText: string;
  cashText: string;
  /** 算账/筹钱/签约/监管/过户 阶段且现金 < 尚待支付的现金 时置警示态. */
  cashLow: boolean;
  stressEmoji: string;
}

/** 12 节点流程条单节点. */
export interface StepItem {
  label: string;
  mark: string;
  cls: string;
}

/** 卖家情绪条. */
export interface SellerBarData {
  show: boolean;
  name: string;
  fill: number;
  face: string;
}

/** 底部弹层数据（信用贷红线二确认 / 到手价解释 / 签约风险强制确认 / 到手价税费风险确认）. */
export interface ModalData {
  type: "" | "credit" | "net" | "breach" | "taxRisk";
  /** 签约风险弹层阶段：deposit=居间协议·定金罚则 / net=网签·违约金 20%. */
  stage: "deposit" | "net" | "";
  /** 到手价弹层：卖方税费分项说明. */
  lines: string[];
  /** 合计（到手价解释「约 X 万」 / 违约风险「违约金约 X 万」 / 税费确认「转嫁合计约 X 万」）. */
  total: string;
  /** 税费风险确认：各税种分项明细（税名 / 计算标准 / 预估金额）. */
  taxItems: { name: string; std: string; amount: string }[];
  /** 税费风险确认：勾选态（不勾选无法确认）. */
  checked: boolean;
  /** 违约风险：已付定金（万元，高亮用）. */
  deposit: string;
  /** 违约风险：违约金 = 房价 20%（万元，高亮用）. */
  penalty: string;
}

/** 弹层空态（关闭 / 信用贷红线二确认）. */
export function emptyModal(): ModalData {
  return { type: "", stage: "", lines: [], total: "", taxItems: [], checked: false, deposit: "", penalty: "" };
}

/** 场景 → 12 节点下标. */
export function nodeIdx(scene: SimState["scene"]): number {
  const k = SCENE_NODE[scene] ?? "start";
  const i = NODES.findIndex((n) => n.k === k);
  return i < 0 ? 0 : i;
}

/** 构建 HUD 数据. */
export function buildHud(S: SimState): HudData {
  const idx = nodeIdx(S.scene);
  /*
   * 现金警示：拿「当前现金」比「尚待支付的现金」，而非无脑比 need。
   * 定金在签约屏确认后扣除、首付在监管屏扣除，因此已发生扣款的屏要把已付款项从 need 里摘掉，
   * 否则会把已付款项重复计入 → 钱够也报「现金不足」（need 是「总需现金」，非「还差多少」）。
   */
  const due =
    S.scene === "escrow"
      ? S.need - S.deposit /* 定金已付，只剩 首付尾款 + 税费 */
      : S.scene === "transfer"
        ? S.need - S.down /* 首付已入监管，只剩 税费 */
        : S.need; /* funds/borrow/sign：定金未付，需全额现金 */
  const low =
    (S.scene === "funds" || S.scene === "borrow" || S.scene === "sign" || S.scene === "escrow" || S.scene === "transfer") &&
    S.cash < due;
  return {
    stageLabel: STAGES[S.scene],
    stepText: idx + 1 + "/12",
    cashText: fmt(S.cash) + "万",
    cashLow: low,
    stressEmoji: stressFace(S.stress),
  };
}

/** 构建 12 节点流程条 + 顶部步骤/天数文案. */
export function buildSteps(S: SimState): { steps: StepItem[]; stepPos: string; dayText: string } {
  const idx = nodeIdx(S.scene);
  const steps = NODES.map((n, i) => ({
    label: n.t,
    mark: i < idx ? "✓" : "",
    cls: i < idx ? "done" : i === idx ? "cur" : "",
  }));
  return {
    steps,
    stepPos: "第 " + (idx + 1) + " / 12 步 · " + NODES[idx].t,
    dayText: "第 " + (DAYS[S.scene] ?? 1) + " 天",
  };
}

/** 构建卖家情绪条（砍价 + 选房阶段显示）. */
export function buildSellerBar(S: SimState): SellerBarData {
  const show = S.scene.indexOf("nego") === 0 || S.scene === "select";
  return {
    show,
    name: S.house ? S.house.seller : "",
    fill: S.seller,
    face: sellerFace(S.seller),
  };
}

/** 「到手价」解释弹层：把卖方税费金额算给用户看. */
export function netModal(S: SimState): ModalData {
  const lines: string[] = [];
  if (S.vat) {
    lines.push("增值税约 " + fmt(S.vat + S.vatAdd) + " 万（未满 2 年全额 5% + 附加）");
  }
  if (S.sellerTax) {
    lines.push("个税约 " + fmt(S.sellerTax) + " 万（不唯一核定 1%）");
  }
  const total = "约 " + fmt(S.vat + S.vatAdd + S.sellerTax) + " 万";
  return { type: "net", stage: "", lines, total, taxItems: [], checked: false, deposit: "", penalty: "" };
}

/** 居间协议签署前：定金罚则强制确认弹层（不可关闭，确认后才付定金）. */
export function depositModal(S: SimState): ModalData {
  return {
    type: "breach",
    stage: "deposit",
    lines: [],
    total: "",
    taxItems: [],
    checked: false,
    deposit: fmt(S.deposit),
    penalty: fmt(S.deal * 0.2),
  };
}

/** 网签前：违约金 20% 强制确认弹层（不可关闭，确认后才完成网签）. */
export function netSignModal(S: SimState): ModalData {
  const liquidated = S.deal * 0.2;
  return {
    type: "breach",
    stage: "net",
    lines: [],
    total: fmt(liquidated),
    taxItems: [],
    checked: false,
    deposit: fmt(S.deposit),
    penalty: fmt(liquidated),
  };
}

/** 「到手价」税费风险强制确认弹层：分项列明卖方税费转嫁明细，勾选后才可确认（不可关闭）. */
export function taxRiskModal(S: SimState): ModalData {
  const taxItems: { name: string; std: string; amount: string }[] = [];
  if (S.vat) {
    taxItems.push({ name: "增值税", std: "成交价 × 5%（未满 2 年全额征收）", amount: fmt(S.vat) + " 万" });
  }
  if (S.vatAdd) {
    taxItems.push({ name: "增值税附加", std: "增值税 × 12%（城建 7% + 教育费附加 3% + 地方教育附加 2%）", amount: fmt(S.vatAdd) + " 万" });
  }
  if (S.sellerTax) {
    taxItems.push({ name: "卖方个人所得税", std: "成交价 × 1%（不唯一按核定税率）", amount: fmt(S.sellerTax) + " 万" });
  }
  return {
    type: "taxRisk",
    stage: "",
    lines: [],
    total: fmt(S.vat + S.vatAdd + S.sellerTax),
    taxItems,
    checked: false,
    deposit: "",
    penalty: "",
  };
}