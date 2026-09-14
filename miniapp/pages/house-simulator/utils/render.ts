/**
 * 购房模拟器 · 页面渲染数据构建（HUD / 流程条 / 卖家情绪 / 底部弹层 / 模拟日历）.
 *
 * 从 index.ts 拆出的纯构建函数：依据全局状态 S 产出 setData 所需的
 * hud/steps/sellerBar/modal 数据（含 5 类弹层的口径与分项明细）。
 * 纯函数，不触碰 wx/Page 实例，便于单测与逐屏对照校验。
 */

import { fmt, sellerFace, stressFace } from "./calc";
import { DAYS, NODES, SCENE_NODE, STAGES, SimState } from "./constants";

/** HUD 顶部数据. */
export interface HudData {
  stageLabel: string;
  stepText: string;
  cashText: string;
  /** 算账/筹钱/签约/监管/过户 阶段且现金 < 尚待支付的现金 时置警示态. */
  cashLow: boolean;
  /** 是否已借款（借过钱才在 HUD 右上角展示负债）. */
  borrowed: boolean;
  /** 累计借款（万元字符串）. */
  borrowedText: string;
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

/** 付款确认弹层数据（定金 / 首付入监管 / 过户缴税）. */
export interface PayInfo {
  /** 付款用途（决定 payOk 后扣哪笔钱）. */
  kind: "deposit" | "escrow" | "transfer";
  title: string;
  /** 现有现金（万元字符串）. */
  now: string;
  /** 本次支付（万元字符串）. */
  pay: string;
  /** 支付后剩余（万元字符串）. */
  after: string;
  /** 说明（现金去向/用途）. */
  note?: string;
  /** 违约风险警示（醒目大字 + 警示色，替代原「违约风险」强制确认弹层）. */
  warn?: string;
}

/** 居间协议核对清单单项（无具体金额/日期，仅提示签署时注意什么）. */
export interface AgreementItem {
  /** 条款标题（如 最晚首付支付时间）. */
  title: string;
  /** 核对提示（该条款要注意什么）. */
  tip: string;
}

/** 居间协议核对清单（签约前逐项勾选核对，全部勾选后才可确认签署）. */
export interface AgreementInfo {
  items: AgreementItem[];
  /** 各项是否已核对（与 items 同序）. */
  checked: boolean[];
  /** 是否全部核对完成（控制确认按钮可用态）. */
  all: boolean;
}

/** 模拟日历单元格（d=0 表示日历网格空位）. */
export interface CalCell {
  /** 日号（0 = 空位）. */
  d: number;
  /** 当前快进定位日期（高亮）. */
  cur: boolean;
  /** 当月已流逝的日期（淡显）. */
  past: boolean;
}

/** 模拟日历（时间快进）数据：节点完成 → 下一节点等待天数可视化. */
export interface CalInfo {
  /** 下一节点名（12 节点流程条名）.*/
  toName: string;
  /** 总等待天数. */
  gap: number;
  /** 等待期在做什么（阶段描述）. */
  phase: string;
  /** 下一环节注意事项. */
  note: string;
  /** 下一环节可能风险. */
  risk: string;
  /** 起点日期文案，如「第 14 天 · 9月27日」. */
  fromText: string;
  /** 终点日期文案，如「第 28 天 · 10月11日」. */
  toText: string;
  /** 日历当前展示月份，如「2026年9月」. */
  month: string;
  /** 星期表头（一二三四五六日）. */
  week: string[];
  /** 当月 42 格网格（空位 d=0）. */
  cells: CalCell[];
  /** 已快进天数（0..gap）. */
  progress: number;
  /** 进度百分比（0-100，供进度条宽度）. */
  pct: number;
  /** 快进是否完成（完成后展示注意事项/风险与确认按钮）. */
  done: boolean;
}

/** 底部弹层数据（信用贷红线二确认 / 到手价解释 / 到手价税费风险确认 / 付款确认 / 模拟日历 / 居间协议核对）. */
export interface ModalData {
  type: "" | "credit" | "net" | "taxRisk" | "pay" | "cal" | "agreement";
  /** 到手价弹层：卖方税费分项说明. */
  lines: string[];
  /** 合计（到手价解释「约 X 万」 / 税费确认「转嫁合计约 X 万」）. */
  total: string;
  /** 税费风险确认：各税种分项明细（税名 / 计算标准 / 预估金额）. */
  taxItems: { name: string; std: string; amount: string }[];
  /** 税费风险确认：勾选态（不勾选无法确认）. */
  checked: boolean;
  /** 付款确认：现金去向（pay 弹层用）. */
  pay?: PayInfo;
  /** 模拟日历（时间快进）弹层数据. */
  cal?: CalInfo;
  /** 居间协议核对清单（签署前逐项确认，agreement 弹层用）. */
  agreement?: AgreementInfo;
}

/** 弹层空态（关闭 / 信用贷红线二确认）. */
export function emptyModal(): ModalData {
  return { type: "", lines: [], total: "", taxItems: [], checked: false };
}

/* ==================== 模拟日历 · 时间快进 ==================== */

/**
 * 把「第 N 天」落到真实日期：以今天为第 1 天，第 N 天 = 今天 + (N-1) 天。
 * 与 HUD 的 dayText（第 N 天）口径一致，让用户感知等待期间的真实日历流逝。
 */
export function realOf(day: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + (day - 1));
  return d;
}

/** 日期文案：{月}月{日}日. */
function fmtMD(d: Date): string {
  return d.getMonth() + 1 + "月" + d.getDate() + "日";
}

/**
 * 构建某日期所在月份的日历网格（中国习惯：周一为行首，7 列 6 行共 42 格）：
 * 空位 d=0；当月日期标记 cur（快进定位）与 past（当月已流逝，淡显），
 * 跨月自动翻页（换月后网格整体重建）。
 */
export function buildCalGrid(d: Date): { month: string; cells: CalCell[] } {
  const y = d.getFullYear();
  const m = d.getMonth();
  let wd = new Date(y, m, 1).getDay(); /* 0=周日，转为周一=1..周日=7 */
  wd = wd === 0 ? 7 : wd;
  const dim = new Date(y, m + 1, 0).getDate();
  const curDate = d.getDate();
  const cells: CalCell[] = [];
  for (let i = 0; i < 42; i++) {
    const day = i - wd + 1;
    if (day < 1 || day > dim) {
      cells.push({ d: 0, cur: false, past: false });
    } else {
      cells.push({ d: day, cur: day === curDate, past: day < curDate });
    }
  }
  return { month: y + "年" + (m + 1) + "月", cells };
}

/**
 * 节点完成后的等待期文案与下一环节提示（按目标节点 key 索引）：
 * phase = 等待期在做什么；note = 下一环节注意事项；risk = 下一环节可能风险。
 * 文案与各场景屏内容对齐，用于「模拟日历」快进完成后的沉浸式教育。
 */
export const NODE_WAIT: Record<string, { phase: string; note: string; risk: string }> = {
  select: {
    phase: "锁定目标，再看一轮房源",
    note: "挂牌价只是起点：税费、贷款、首付要合起来算，别只看总价。",
    risk: "看中就下订？签约后反悔定金不退——先想清楚再出手。",
  },
  qa: {
    phase: "等资格核验排队",
    note: "备齐材料：沪籍户口本 / 非沪籍社保（或个税）满 3 年证明；婚后按家庭合并计算名下套数。",
    risk: "资格不过 → 无法网签，之前谈的价、付的定金都可能白搭。",
  },
  nego: {
    phase: "约房东见面，酝酿报价",
    note: "挂牌价 ≠ 成交价。先摸底再出价，别急着亮底牌；口头承诺不算数。",
    risk: "砍价过头会被叫停，谈崩了只能换房重来。",
  },
  funds: {
    phase: "核对税费与贷款方案",
    note: "贷款方式决定首付与利率：商贷首付最低、公积金利息最低；首付还能往上加。",
    risk: "首付算错 → 现金缺口，被迫借钱甚至违约。",
  },
  borrow: {
    phase: "盘点首付与税费，算清缺口",
    note: "首付 + 税费别只盯房价；缺口先算清，再决定借钱的渠道。",
    risk: "信用贷流入楼市属监管红线：可能被银行拒贷、抽贷，影响征信。",
  },
  sign: {
    phase: "等中介排期，准备签约材料",
    note: "逐字读合同：成交价、定金、付款节点、违约责任。",
    risk: "违约定金不退（定金罚则）；网签后违约按房价 20% 赔付。",
  },
  loan: {
    phase: "银行审批：征信、流水、面签",
    note: "审批约 7 天：准备身份证 / 收入流水 / 征信授权，送审后等批贷函。",
    risk: "月供应 ≤ 家庭收入 50%，否则被风控拦截：加首付或拉长年限，甚至拒批。",
  },
  escrow: {
    phase: "对接资金监管账户",
    note: "首付进监管账户，过户成功才划给卖方——这是买家的护身符。",
    risk: "别把首付直接打给卖家，过户遇阻钱难追。",
  },
  transfer: {
    phase: "预约过户档期",
    note: "核对税费口径：契税按面积/套数分档；未满 2 年还有全额增值税 + 个税。",
    risk: "税单与预期不符会很痛——这笔账签约前就该算清。",
  },
  deed: {
    phase: "过户审税 · 税务核价",
    note: "审税约 7 天：税务机关核定过户真实价格，核完后缴税、出不动产登记证书。",
    risk: "审税核价与申报不符会被调整补税；放款后你不再有主动权，遗留问题只能靠尾款扣押约束卖方。",
  },
  final: {
    phase: "等卖方腾房、办理交割",
    note: "交房三查：户口迁出、物业/水电煤过户、钥匙家具清点。",
    risk: "户口未迁影响学区/落户，是高频纠纷——可扣押 1% 尾款作保证金。",
  },
};

/**
 * 构建「模拟日历 · 时间快进」弹层初始数据：从当前场景节点快进到 to 场景节点，
 * gap = 等待天数（DAYS 差）；仅供快进开始态（done=false, progress=0），
 * 后续翻页由页面侧定时器驱动 buildCalGrid 更新 month/cells/progress/done。
 */
export function calModal(S: SimState, to: SimState["scene"]): ModalData {
  const toK = SCENE_NODE[to] ?? "";
  /* 贷款审批与「贷款」节点同屏（loan/loanChk），目标名直接写明「贷款审批结果」避免歧义 */
  const toName =
    to === "loanChk"
      ? "贷款审批结果"
      : NODES.find((n) => n.k === toK)?.t ?? "下一节点";
  const wait = NODE_WAIT[toK];
  const fromDay = DAYS[S.scene] ?? 1;
  const toDay = DAYS[to] ?? fromDay;
  const grid = buildCalGrid(realOf(fromDay));
  return {
    type: "cal",
    lines: [],
    total: "",
    taxItems: [],
    checked: false,
    cal: {
      toName,
      gap: toDay - fromDay,
      phase: wait?.phase ?? "",
      note: wait?.note ?? "",
      risk: wait?.risk ?? "",
      fromText: "第 " + fromDay + " 天 · " + fmtMD(realOf(fromDay)),
      toText: "第 " + toDay + " 天 · " + fmtMD(realOf(toDay)),
      month: grid.month,
      week: ["一", "二", "三", "四", "五", "六", "日"],
      cells: grid.cells,
      progress: 0,
      pct: 0,
      done: false,
    },
  };
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
    borrowed: S.borrowed > 0,
    borrowedText: fmt(S.borrowed) + "万",
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
  return { type: "net", lines, total, taxItems: [], checked: false };
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
    lines: [],
    total: fmt(S.vat + S.vatAdd + S.sellerTax),
    taxItems,
    checked: false,
  };
}

/**
 * 付款确认弹层（定金 / 首付入监管 / 过户缴税）：现有现金 → 本次支付 → 支付后剩余。
 * 违约风险在此醒目警示（warn 字段，支付确认时以更明显的字号/颜色提示），
 * 替代原「违约风险 · 强制确认」弹层，避免与付款确认重复。
 */
export function payModal(S: SimState, kind: "deposit" | "escrow" | "transfer"): ModalData {
  const payAmt = kind === "deposit" ? S.deposit : kind === "escrow" ? S.down - S.deposit : S.taxes + S.netTax;
  const liquidated = S.deal * 0.2;
  return {
    type: "pay",
    lines: [],
    total: "",
    taxItems: [],
    checked: false,
    pay: {
      kind,
      title: kind === "deposit" ? "定金 · 居间协议" : kind === "escrow" ? "首付 · 资金监管" : "过户 · 缴税",
      now: fmt(S.cash),
      pay: fmt(payAmt),
      after: fmt(S.cash - payAmt),
      note:
        kind === "deposit"
          ? "定金计入首付、过户时冲抵；居间协议一签即生效，这不是押金，是合同约束。"
          : kind === "escrow"
            ? "定金已在签约时支付，本次冲抵后入监管账户的是尾付部分；产证办结后由监管账户划转卖方，而非直接打款。"
            : "契税、登记费、中介费" + (S.netTax ? "与到手价转嫁的卖方税费" : "") + "一次性缴纳，此后再无大额现金支出。",
      warn:
        kind === "deposit"
          ? "你违约 → 已付定金 " + fmt(S.deposit) + " 万不予返还（定金罚则）；卖方违约 → 双倍返还（" + fmt(S.deposit * 2) + " 万）。"
          : kind === "escrow"
            ? "网签合同已生效：此刻反悔或迟延履行（如不按期过户），按房价 20% 赔付违约金，约 " + fmt(liquidated) + " 万。"
            : undefined,
    },
  };
}

/**
 * 居间协议核对清单弹层（签署前逐项确认，全部勾选后才可进入付款确认）.
 * 6 处条款不写具体金额与日期，每项只提示「签合同时该特别留意什么」，
 * 让买家意识到这些节点与条件以合同为准、签字即生效。
 */
export function agreementModal(): ModalData {
  const items: AgreementItem[] = [
    {
      title: "最晚首付支付时间",
      tip: "首付最迟付款节点会写死在合同里，先确认存款与放款节奏赶不赶得上，逾期即成违约先兆。",
    },
    {
      title: "贷款金额",
      tip: "合同写明申请贷款金额，但获批以银行审批为准——先按政策自评资质，批下来的钱才作数。",
    },
    {
      title: "贷款额度不足时现金补足的最晚时间",
      tip: "批贷不足合同贷款额时，差额须限时以现金补足；签约前就想好最坏情况下这笔钱从哪来。",
    },
    {
      title: "最晚过户时间",
      tip: "过户最迟日期与贷款放款、尾款结算直接挂钩，过户逾期容易触发违约责任。",
    },
    {
      title: "最晚交房时间",
      tip: "合同约定卖房人腾房交房的最迟时点，户口迁出、物业水电交接也应一并写清。",
    },
    {
      title: "尾款及尾款支付条件",
      tip: "尾款何时付、以过户办结或交房完成为前提，都要写进合同——有条件的尾款是买家的最后筹码。",
    },
  ];
  return {
    type: "agreement",
    lines: [],
    total: "",
    taxItems: [],
    checked: false,
    agreement: { items, checked: items.map(() => false), all: false },
  };
}