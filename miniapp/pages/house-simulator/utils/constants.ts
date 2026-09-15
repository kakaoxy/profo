/**
 * 购房模拟器 · 数据与配置（对齐 PRD §5.1/§6；HiFi 原型 docs/design/购房模拟器-hifi.html 已于
 * 2026-09-13 冻结为历史存档，不再作为对齐依据，口径以本目录代码为唯一真源）.
 *
 * 纯数据/配置模块：房源、身份角色、贷款方式、12 节点流程条、时间轴、家庭月收入，
 * 以及模拟状态 SimState 的初始工厂。计算逻辑见 ./calc.ts，场景视图见 ./scenes.ts。
 */

import type { RenovMine } from "./renov-data";

/** 身份角色 key：刚需首套 / 置换改善 / 投资二套. */
export type RoleKey = "first" | "trade" | "invest";

/** 贷款方式 key：纯商贷 / 组合贷 / 纯公积金. */
export type LoanTypeKey = "comm" | "combo" | "gjj";

/** 场景 key（41 屏：交易 24 屏 + 装修流程 17 屏；装修拆为 预算决策 → 13 阶段 → 完成总账）. */
export type SceneKey =
  | "start"
  | "role"
  | "cash"
  | "custom"
  | "select"
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
  | "loanContract"
  | "transfer"
  | "deed"
  | "handover"
  | "settle"
  | "final"
  | "renovStart"
  | "renovDesign"
  | "renovBudget"
  | "renovDemo"
  | "renovElec"
  | "renovSeal"
  | "renovTile"
  | "renovWood"
  | "renovPaint"
  | "renovMain"
  | "renovInstall"
  | "renovClean"
  | "renovAir"
  | "renovWarr"
  | "renovDone";

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
  /** 交房时装修状态（决定交易完成后「是否装修」决策的参考口径）. */
  reno: "毛坯" | "简装" | "精装";
}

/** 限购资格判定结果. */
export interface Judge {
  ok: boolean;
  title: string;
  reason: string;
}

/**
 * 风险确认记录（交易凭证的一部分，本地持久化，见 utils/riskLog.ts）.
 * 记录用户对「居间签约·定金刚则 / 网签·违约金20% / 到手价税费风险」提示的确认操作
 * （类型 + 时间戳 + 摘要），确保可追溯.
 */
export interface RiskRecord {
  /** 记录类型：居间签约定金刚则确认 / 网签违约金确认 / 到手价税费风险确认. */
  type: "deposit" | "liquidated" | "netTax";
  /** 标题（如 违约风险确认）. */
  title: string;
  /** 确认时间（YYYY-MM-DD HH:mm:ss，本地时钟）. */
  ts: string;
  /** 摘要（提示框核心内容与金额口径）. */
  detail: string;
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
  /** 网签时已支付的首付先付部分（元，不含定金；贷款合同后补足 = down − deposit − firstPay）. */
  firstPay: number;
  /** 过户税费是否已缴（deed 屏「缴税领证」与「放款」两态切换依据）. */
  taxed: boolean;
  /** 装修流程是否已结束（final 屏据此隐藏「开始装修」入口）. */
  renovDone: boolean;
  /** 是否跳过装修直接入住（renovDone=true 时区分「装完」与「跳过」）. */
  renovSkipped: boolean;
  /**
   * 装修动态日程（信息迷雾机制，见 renov-data.ts）：
   * renovDay = 当前绝对天数（进入 renovStart 后由交易完成日 +1 起累加，
   * 基础工期 + 做功课耗时 + 爆雷返工全在此推进）；renovDoneDay = 通风完成
   * （完工入住）日的快照，供总账屏统计"装修历时"。
   */
  renovDay: number;
  renovDoneDay: number;
  /** 装修总预算（元，预算屏档位单价 × 面积；装修支出独立于购房现金记账）. */
  renovBudget: number;
  /** 装修累计增项/返工支出（元）. */
  renovSpend: number;
  /** 当前阶段已触发的随机事件 id（null = 本阶段未触发）. */
  renovEvent: string | null;
  /** 当前事件已选选项 key（null = 尚未选择，场景展示选项）. */
  renovChoice: string | null;
  /** 已埋雷列表（到达对应阶段时爆雷结算）. */
  renovMines: RenovMine[];
  /** 当前阶段爆雷结果（进入阶段时由 handler 结算，场景据此展示警示）. */
  renovBurst: RenovMine[];
  /** 做过功课的阶段尾缀（影响后续结果，如质保期走合同免费维修）. */
  renovLearned: string[];
  /** 装修记事（事件决策 + 爆雷记录，完成总账屏复盘展示）. */
  renovLog: { stage: string; text: string }[];
  /** 风险确认记录（交易凭证，本地持久化镜像，用于 final 屏展示）. */
  riskLog: RiskRecord[];
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
    reno: "简装",
  },
  {
    id: "B", emoji: "🏢", name: "中环次新两房", area: "88㎡", price: 4000000,
    type: "二手房", ring: "内", tag: "满五唯一", tagCls: "badge-warm", thumbCls: "thumb-b",
    holdYears: 5, unique: true,
    seller: "张先生", sellerTag: "房东 · 置换急卖", negotiable: 0.05,
    intro: "2019 年次新房，精装修，张先生已看中下一套，想尽快成交。",
    reno: "精装",
  },
  {
    id: "C", emoji: "🏙️", name: "外环品质新房", area: "95㎡", price: 6000000,
    type: "新房", ring: "外", tag: "新房 · 免增值税", tagCls: "badge-sky", thumbCls: "thumb-c",
    hold: "new", holdYears: 0, unique: true,
    seller: "销售小刘", sellerTag: "案场销售", negotiable: 0.03,
    intro: "国企开发商，三房两卫，一口价 + 少量优惠。",
    reno: "毛坯",
  },
  {
    id: "D", emoji: "🏠", name: "外环内老工房", area: "72㎡", price: 3000000,
    type: "二手房", ring: "内", tag: "满五不唯一", tagCls: "badge-fog", thumbCls: "thumb-a",
    holdYears: 5, unique: false,
    seller: "王阿姨", sellerTag: "房东 · 资金周转", negotiable: 0.08,
    intro: "老工房但满五，王阿姨周转资金，砍价空间最大。",
    reno: "简装",
  },
  {
    id: "E", emoji: "🏘️", name: "内环江景大平层", area: "160㎡", price: 16000000,
    type: "二手房", ring: "内", tag: "满二不唯一", tagCls: "badge-fog", thumbCls: "thumb-b",
    holdYears: 2, unique: false,
    seller: "赵总", sellerTag: "房东 · 改善置换", negotiable: 0.04,
    intro: "160㎡ 江景大平层，满二不唯一；面积超 140㎡，契税按高档计。",
    reno: "精装",
  },
  {
    id: "F", emoji: "🏗️", name: "中环新交付次新", area: "92㎡", price: 5500000,
    type: "二手房", ring: "内", tag: "不满 2 年 · 全额增值税", tagCls: "badge-hair", thumbCls: "thumb-c",
    holdYears: 0, unique: false,
    seller: "刘先生", sellerTag: "房东 · 投资客回笼", negotiable: 0.05,
    intro: "去年刚交付的次新房，投资客想回笼资金；未满 2 年需缴全额增值税（5%+附加），税费是大头。",
    reno: "简装",
  },
];

/**
 * 自定义房源 · 环线 picker 配置（显示文案与环线口径必须同序一一对应）.
 * picker 的 `range` 只吃文案数组、回传的是**下标**，因此不能再拿文案去比 "外"
 *（否则「外环外」会被静默当成「外环内」，误判限购资格与二套首付）。
 */
export const CUST_RING_OPTIONS: string[] = ["外环内", "外环外"];

/** 环线口径值（与 CUST_RING_OPTIONS 同序）：下标 1 = 外环外. */
export const CUST_RING_VALUES: House["ring"][] = ["内", "外"];

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
  loanContract: "贷款合同",
  transfer: "过户",
  deed: "缴税领证",
  handover: "交房",
  settle: "交割结算",
  final: "完成",
  renovStart: "装修预算",
  renovDesign: "设计",
  renovBudget: "预算",
  renovDemo: "拆改",
  renovElec: "水电",
  renovSeal: "防水",
  renovTile: "瓦工",
  renovWood: "木工",
  renovPaint: "油漆",
  renovMain: "主材",
  renovInstall: "安装",
  renovClean: "保洁",
  renovAir: "通风",
  renovWarr: "质保",
  renovDone: "完工",
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
  { k: "transfer", t: "过户" },
  { k: "deed", t: "领证" },
  { k: "handover", t: "交房" },
  { k: "renov", t: "装修" },
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
  loanContract: "loan",
  transfer: "transfer",
  deed: "deed",
  handover: "handover",
  settle: "handover",
  final: "renov",
  renovStart: "renov",
  renovDesign: "renov",
  renovBudget: "renov",
  renovDemo: "renov",
  renovElec: "renov",
  renovSeal: "renov",
  renovTile: "renov",
  renovWood: "renov",
  renovPaint: "renov",
  renovMain: "renov",
  renovInstall: "renov",
  renovClean: "renov",
  renovAir: "renov",
  renovWarr: "renov",
  renovDone: "renov",
};

/**
 * 时间轴（累计自然日）.
 *
 * 前期（身份/现金/选房/资格/砍价/算账/筹钱）都是私人随机决策，没有固定时间预期，
 * 一律视为「今天」（第 1 天）；自签约付定金起才进入交易流程，按固定节奏推进：
 * 付定金(第1天) → 网签付首付先付部分并申贷(第1天) → 审批 7 天(第 8 天出批贷函) →
 * 贷款合同确认并补足剩余首付(第 8 天) → 递交过户材料出收件收据(第 8 天) →
 * 审税 7 天 → 第 15 天缴税领证、产证给银行放款 → 次日交房 → 同日交割结算尾款。
 *
 * 装修流程天数不再静态配置：13 阶段工期 + 随机事件做功课耗时 + 爆雷返工
 * 全部由 handlers-renov.ts 动态累加到 S.renovDay（起点 = final + 1）。
 */
export const DAYS: Partial<Record<SceneKey, number>> = {
  /* 前期 · 私人决策：无时间预期，均视为今天 */
  start: 1,
  role: 1,
  cash: 1,
  select: 1,
  custom: 1,
  qa: 1,
  blocked: 1,
  nego1: 1,
  nego2: 1,
  nego3: 1,
  feeNego: 1,
  loanType: 1,
  funds: 1,
  borrow: 1,
  /* 交易流程自付定金起：定金/网签付首付先付部分/申贷同日 → 审批 7 天 → 贷款合同确认并补足剩余首付 →
     同日递交过户材料出收件收据 → 审税 7 天 → 缴税领证、产证给银行放款 → 次日交房 → 同日交割结算尾款 */
  sign: 1,
  signNet: 1,
  loan: 1,
  loanChk: 8,
  loanContract: 8,
  transfer: 8,
  deed: 15,
  handover: 16,
  settle: 16,
  final: 16,
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
    firstPay: 0,
    taxed: false,
    renovDone: false,
    renovSkipped: false,
    renovDay: 0,
    renovDoneDay: 0,
    renovBudget: 0,
    renovSpend: 0,
    renovEvent: null,
    renovChoice: null,
    renovMines: [],
    renovBurst: [],
    renovLearned: [],
    renovLog: [],
    riskLog: [],
  };
}