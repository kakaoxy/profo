/**
 * 购房模拟器 · 数据与配置（对齐 PRD §5.1/§6 与 HiFi 原型 docs/design/购房模拟器-hifi.html）.
 *
 * 纯数据/配置模块：房源、身份角色、贷款方式、12 节点流程条、时间轴、家庭月收入，
 * 以及模拟状态 SimState 的初始工厂。计算逻辑见 ./calc.ts，场景视图见 ./scenes.ts。
 */

/** 身份角色 key：刚需首套 / 置换改善 / 投资二套. */
export type RoleKey = "first" | "trade" | "invest";

/** 贷款方式 key：纯商贷 / 组合贷 / 纯公积金. */
export type LoanTypeKey = "comm" | "combo" | "gjj";

/** 场景 key（23 屏，与 HiFi renderScene 一一对应，签约拆为 居间协议→网签 两屏）. */
export type SceneKey =
  | "start"
  | "role"
  | "cash"
  | "select"
  | "custom"
  | "qa"
  | "blocked"
  | "nego1"
  | "nego2"
  | "nego3"
  | "feeNego"
  | "loanType"
  | "funds"
  | "borrow"
  | "sign"
  | "signNet"
  | "loan"
  | "loanChk"
  | "escrow"
  | "transfer"
  | "deed"
  | "handover"
  | "final";

/** 身份角色配置：决定贷款利率 / 名下套数 / 房产税口径（首付比例由身份×环线×贷款方式共同决定，见 downRateFor）. */
export interface Role {
  k: RoleKey;
  name: string;
  emoji: string;
  /** 名下套数（由身份直接提供，限购问答不再重复提问）. */
  owned: number;
  /** 公积金年利率. */
  gjjRate: number;
  /** 商贷年利率. */
  commRate: number;
  badge: string;
  desc: string;
}

/** 房源配置（含议价底线 negotiable）. */
export interface House {
  id: string;
  emoji: string;
  name: string;
  area: string;
  /** 挂牌价（元）. */
  price: number;
  type: string;
  /** 环线：内=外环内 / 外=外环外（决定限购与二套首付差异）. */
  ring: "内" | "外";
  tag: string;
  tagCls: string;
  thumbCls: string;
  /** 新房标记（免增值税 / 无卖方个税）. */
  hold?: "new";
  /** 持有年限：0 | 2 | 5. */
  holdYears: number;
  /** 是否唯一住房（满五唯一免征个税）. */
  unique: boolean;
  /** 议价底线（叫停阈值，成交价 = 挂牌价×(1-幅度)）. */
  negotiable: number;
  seller: string;
  sellerTag: string;
  intro: string;
}

/** 限购资格判定结果. */
export interface Judge {
  ok: boolean;
  title: string;
  reason: string;
}

/** 贷款计算结果（等额本息）. */
export interface LoanState {
  /** 公积金贷款额（元）. */
  gjj: number;
  /** 商贷贷款额（元）. */
  comm: number;
  /** 月供（元）. */
  monthly: number;
  /** 总利息（元）. */
  totalInt: number;
}

/** 模拟器全局状态（等同 HiFi 全局 S）. */
export interface SimState {
  scene: SceneKey;
  role: Role | null;
  house: House | null;
  /** 最终砍价比例. */
  slash: number;
  /** 成交价（元）. */
  deal: number;
  /** 定金（元，成交价 5%）. */
  deposit: number;
  loanType: LoanTypeKey;
  /** 首付比例（由用户所选档位与最低限制共同决定；1 = 全款不贷款，负空间置空）. */
  downRate: number;
  /** 用户所选首付比例（0 = 按最低首付；[最低, 1] 表示在最低之上多付，1 = 全款不贷款）. */
  downSel: number;
  /** 房款首付（元，纯公积金额度不足时含追加）. */
  down: number;
  /** 纯公积金额度不足并入首付的金额（元）. */
  gjjTopUp: number;
  deedTax: number;
  /** 不动产登记费 80 元/件. */
  regFee: number;
  agentRate: number;
  agentFee: number;
  /** 房产税（元/年，投资二套演示）. */
  estateTax: number;
  /** 增值税（元，卖方）. */
  vat: number;
  /** 增值税附加（元，≈增值税×12%）. */
  vatAdd: number;
  /** 卖方个税（元，满五唯一免征，否则核定 1%）. */
  sellerTax: number;
  /** 建筑面积（用于契税分档）. */
  areaNum: number;
  /** 买方一次性税费合计 = 契税 + 登记费 + 中介费. */
  taxes: number;
  /** 需要现金 = 房款首付 + 买方税费 + 到手价转嫁税费. */
  need: number;
  /** 手头存款（元）. */
  cash: number;
  /** 是否已通过现金选项确定存款. */
  cashSet: boolean;
  /** 是否答应「到手价」（卖方税费转嫁买方）. */
  netDeal: boolean;
  /** 到手价转嫁的卖方税费（增值税+附加+个税，元）. */
  netTax: number;
  /** 压力 0-100. */
  stress: number;
  /** 卖家情绪 0-100. */
  seller: number;
  /** 累计借款（元）. */
  borrowed: number;
  /** 已用借款类型（family / gjj / credit）. */
  usedBorrow: Record<string, boolean>;
  /** 限购问答答案. */
  ans: Record<string, string>;
  /** 问答进度. */
  qaProg: number;
  /** 第一轮砍价选择 key. */
  negoR1: "hard" | "soft" | "chat" | null;
  /** 第二轮砍价选择 key. */
  negoR2: string | null;
  /** 第一轮报价是否越线（卖家叫停）. */
  negoCap: boolean;
  judge: Judge | null;
  gjjRate: number;
  commRate: number;
  /** 还款年限（10/20/30）. */
  loanYears: number;
  loan: LoanState;
  /** 尾款扣押（元，交房交割用）. */
  holdback: number;
}

/** 初始手头现金（元，可动用现金预设档之一 70 万）. */
export const DEFAULT_CASH = 700000;

/** 家庭月收入（演示值，贷款审批风控：月供 ≤ 收入 50%）. */
export const INCOME = 40000;

/** 公积金家庭额度上限（演示）. */
export const GJJ_CAP = 800000;

/** 六套预设房源（引 PRD §5.1）. */
export const HOUSES: House[] = [
  {
    id: "A", emoji: "🏚️", name: "内环老破小", area: "58㎡", price: 2000000,
    type: "二手房", ring: "内", tag: "满五唯一", tagCls: "badge-warm", thumbCls: "thumb-a",
    holdYears: 5, unique: true,
    seller: "陈老师", sellerTag: "房东 · 急售", negotiable: 0.06,
    intro: "房龄偏大，但离地铁 300m，陈老师急着换大房。",
  },
  {
    id: "B", emoji: "🏢", name: "中环次新两房", area: "88㎡", price: 4000000,
    type: "二手房", ring: "内", tag: "满五唯一", tagCls: "badge-warm", thumbCls: "thumb-b",
    holdYears: 5, unique: true,
    seller: "张先生", sellerTag: "房东 · 置换急卖", negotiable: 0.05,
    intro: "2019 年次新房，精装修，张先生已看中下一套，想尽快成交。",
  },
  {
    id: "C", emoji: "🏙️", name: "外环品质新房", area: "95㎡", price: 6000000,
    type: "新房", ring: "外", tag: "新房 · 免增值税", tagCls: "badge-sky", thumbCls: "thumb-c",
    hold: "new", holdYears: 0, unique: true,
    seller: "销售小刘", sellerTag: "案场销售", negotiable: 0.03,
    intro: "国企开发商，三房两卫，一口价 + 少量优惠。",
  },
  {
    id: "D", emoji: "🏠", name: "外环内老工房", area: "72㎡", price: 3000000,
    type: "二手房", ring: "内", tag: "满五不唯一", tagCls: "badge-fog", thumbCls: "thumb-a",
    holdYears: 5, unique: false,
    seller: "王阿姨", sellerTag: "房东 · 资金周转", negotiable: 0.08,
    intro: "老工房但满五，王阿姨周转资金，砍价空间最大。",
  },
  {
    id: "E", emoji: "🏘️", name: "内环江景大平层", area: "160㎡", price: 16000000,
    type: "二手房", ring: "内", tag: "满二不唯一", tagCls: "badge-fog", thumbCls: "thumb-b",
    holdYears: 2, unique: false,
    seller: "赵总", sellerTag: "房东 · 改善置换", negotiable: 0.04,
    intro: "160㎡ 江景大平层，满二不唯一；面积超 140㎡，契税按高档计。",
  },
  {
    id: "F", emoji: "🏗️", name: "中环新交付次新", area: "92㎡", price: 5500000,
    type: "二手房", ring: "内", tag: "不满 2 年 · 全额增值税", tagCls: "badge-hair", thumbCls: "thumb-c",
    holdYears: 0, unique: false,
    seller: "刘先生", sellerTag: "房东 · 投资客回笼", negotiable: 0.05,
    intro: "去年刚交付的次新房，投资客想回笼资金；未满 2 年需缴全额增值税（5%+附加），税费是大头。",
  },
];

/** 身份角色（先选身份，再选房）：决定贷款利率 / 名下套数 / 房产税口径；首付比例由「身份 × 房源环线 × 贷款方式」共同决定. */
export const ROLES: Record<RoleKey, Role> = {
  first: {
    k: "first", name: "刚需首套", emoji: "🏠", owned: 0, gjjRate: 0.026, commRate: 0.0305,
    badge: "badge-sky",
    desc: "名下 0 套 · 首套待遇：商贷首付 15% / 组合贷·公积金 20% · 公积金 2.6% / 商贷 3.05%",
  },
  trade: {
    k: "trade", name: "置换改善", emoji: "🔄", owned: 1, gjjRate: 0.026, commRate: 0.0305,
    badge: "badge-warm",
    desc: "卖一买一 · 按首套首付与利率 · 卖房个税一年内可退",
  },
  invest: {
    k: "invest", name: "投资二套", emoji: "📈", owned: 1, gjjRate: 0.03075, commRate: 0.0306,
    badge: "badge-fog",
    desc: "名下 1 套 · 二套首付 25%（外环内）/ 15%–20%（外环外）· 利率上浮（公积金 3.075% / 商贷 3.06%）",
  },
};

/** 贷款方式（20260901 上海按揭政策表：首付 / 利率随方式与套数区域差异化）. */
export const LOAN_TYPES: Record<LoanTypeKey, { k: LoanTypeKey; name: string; short: string; desc: string }> = {
  comm: { k: "comm", name: "纯商贷", short: "商贷", desc: "额度高，首付最低（首套 15% / 二套外环外 15%）" },
  combo: { k: "combo", name: "组合贷", short: "组合", desc: "公积金 + 商贷，多数家庭首选" },
  gjj: { k: "gjj", name: "纯公积金", short: "公积金", desc: "利率最低，但额度有限（演示上限 80 万）" },
};

/**
 * 首付比例：身份 × 房源环线 × 贷款方式.
 * 首套：商贷 15% / 组合贷·公积金 20%；二套外环内 25%；二套外环外（特殊区域口径）商贷 15% / 组合贷·公积金 20%.
 */
export function downRateFor(roleK: RoleKey, ring: string, lt: LoanTypeKey): number {
  const first = roleK !== "invest";
  if (first) {
    return lt === "comm" ? 0.15 : 0.2;
  }
  if (ring === "内") {
    return 0.25;
  }
  return lt === "comm" ? 0.15 : 0.2;
}

/** 阶段徽章（HUD 顶部）. */
export const STAGES: Record<SceneKey, string> = {
  start: "开始",
  role: "角色",
  cash: "资金",
  select: "看房",
  custom: "自定义房源",
  qa: "资格核验",
  blocked: "资格",
  nego1: "谈判中",
  nego2: "谈判中",
  nego3: "谈判中",
  feeNego: "谈判中",
  loanType: "贷款方式",
  funds: "算账",
  borrow: "筹钱",
  sign: "签约",
  signNet: "网签",
  loan: "贷款",
  loanChk: "贷款审批",
  escrow: "资金监管",
  transfer: "过户",
  deed: "领证 / 放款",
  handover: "交房",
  final: "完成",
};

/** 12 节点流程条（HUD 下方）：已过 ✓ / 当前高亮 / 未到置灰. */
export interface FlowNode {
  k: string;
  t: string;
}

export const NODES: FlowNode[] = [
  { k: "start", t: "开始" },
  { k: "select", t: "选房" },
  { k: "qa", t: "资格" },
  { k: "nego", t: "砍价" },
  { k: "funds", t: "算账" },
  { k: "borrow", t: "筹钱" },
  { k: "sign", t: "签约" },
  { k: "loan", t: "贷款" },
  { k: "escrow", t: "监管" },
  { k: "transfer", t: "过户" },
  { k: "deed", t: "领证" },
  { k: "final", t: "交房" },
];

/** 场景 → 12 节点归属（用于高亮当前节点）. */
export const SCENE_NODE: Partial<Record<SceneKey, string>> = {
  start: "start",
  role: "start",
  cash: "start",
  select: "select",
  custom: "select",
  qa: "qa",
  blocked: "qa",
  nego1: "nego",
  nego2: "nego",
  nego3: "nego",
  feeNego: "nego",
  loanType: "funds",
  funds: "funds",
  borrow: "borrow",
  sign: "sign",
  signNet: "sign",
  loan: "loan",
  loanChk: "loan",
  escrow: "escrow",
  transfer: "transfer",
  deed: "deed",
  handover: "final",
  final: "final",
};

/** 时间轴（PRD 附录 13.2，累计自然日）. */
export const DAYS: Partial<Record<SceneKey, number>> = {
  start: 1,
  role: 1,
  cash: 1,
  select: 3,
  custom: 3,
  qa: 1,
  blocked: 1,
  nego1: 7,
  nego2: 8,
  nego3: 9,
  feeNego: 9,
  loanType: 10,
  funds: 10,
  borrow: 11,
  sign: 14,
  signNet: 14,
  loan: 28,
  loanChk: 29,
  escrow: 30,
  transfer: 31,
  deed: 33,
  handover: 42,
  final: 42,
};

/** 初始全局状态（等同 HiFi resetAll 后的 S；进入页面每次新模拟）. */
export function createInitialState(): SimState {
  return {
    scene: "start",
    role: null,
    house: null,
    slash: 0,
    deal: 0,
    deposit: 0,
    loanType: "combo",
    downRate: 0.2,
    downSel: 0,
    down: 0,
    gjjTopUp: 0,
    deedTax: 0,
    regFee: 80,
    agentRate: 0.02,
    agentFee: 0,
    estateTax: 0,
    vat: 0,
    vatAdd: 0,
    sellerTax: 0,
    areaNum: 0,
    taxes: 0,
    need: 0,
    cash: DEFAULT_CASH,
    cashSet: false,
    netDeal: false,
    netTax: 0,
    stress: 8,
    seller: 70,
    borrowed: 0,
    usedBorrow: {},
    ans: {},
    qaProg: 0,
    negoR1: null,
    negoR2: null,
    negoCap: false,
    judge: null,
    gjjRate: 0.026,
    commRate: 0.0305,
    loanYears: 30,
    loan: { gjj: 0, comm: 0, monthly: 0, totalInt: 0 },
    holdback: 0,
  };
}