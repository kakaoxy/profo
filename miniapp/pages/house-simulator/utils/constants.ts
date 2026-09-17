/**
 * 购房模拟器 · 数据与配置（购房模块对齐 docs/2026-09-17-购房模块-高保真设计稿.html v1）.
 *
 * 纯数据/配置模块：房源、身份角色、贷款方式、12 节点流程条、家庭月收入，
 * 以及模拟状态 SimState 的初始工厂。
 *  - 流程文案（每屏一句现场 / 坑与规避 / 常规周期 / 签约 12 项深坑）见 ./flow.ts
 *  - 计算逻辑（税费/贷款/限购/砍价/经历周期）见 ./calc.ts
 *  - 场景视图见 ./scenes*.ts；装修模块的 12 阶段数据见 ./renov-data.ts
 *
 * ️ 时间口径（设计稿 2026-09-17）：原 DAYS「模拟 16 天」固定档位已退休——
 *    每段「经历周期」从该段常规周期区间抽取（见 calc.stageDays），
 *    全程天数 = 抽取累计 + 坑拖出来的天（calc.elapsed）。
 *
 * ⚠️ 单文件 >500 行说明：本模块是 SimState / 房源 / 角色 / 贷款方式的唯一类型与配置来源，
 * 拆分会让 SimState 的字段定义与初始工厂分离（改字段要跑两个文件，容易漏），故聚拢在一处。
 */

import type { RenovBill, RenovMine } from "./renov-data";

/** 身份角色 key：刚需首套 / 置换改善 / 投资二套. */
export type RoleKey = "first" | "trade" | "invest";

/** 贷款方式 key：纯商贷 / 组合贷 / 纯公积金. */
export type LoanTypeKey = "comm" | "combo" | "gjj";

/** 场景 key（38 屏：交易 24 屏 + 装修流程 14 屏）. */
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
  | "renovContract"
  | "renovDemo"
  | "renovElec"
  | "renovSeal"
  | "renovTileWood"
  | "renovPaint"
  | "renovMain"
  | "renovInstall"
  | "renovClean"
  | "renovAir"
  | "renovWarr"
  | "renovDone";

/** 身份角色配置：决定贷款利率 / 名下套数 / 税费口径（首付比例由身份×环线×贷款方式共同决定，见 downRateFor）. */
export interface Role {
  k: RoleKey;
  name: string;
  emoji: string;
  /** 名下套数（置换已卖原房 → 0 套，按首套认定）. */
  owned: number;
  /** 公积金年利率. */
  gjjRate: number;
  /** 商贷年利率. */
  commRate: number;
  /** 角色卡标签（首套待遇 / 卖一买一 / 二套口径）. */
  tag: string;
  /** 标签配色类（badge-sky / badge-warm / badge-fog）. */
  tagCls: string;
  /** 角色卡正文（名下套数 + 首付口径）. */
  d: string;
  /** 角色卡右上角的关键数字（公积金利率 / 首付比例 / 利率上浮）. */
  p: string;
  /** 角色卡脚注（商贷利率 · 契税 / 置换退税 / 二套利率与房产税）. */
  note: string;
}

/** 房源配置（含议价底线 negotiable）. */
export interface House {
  id: string;
  emoji: string;
  name: string;
  area: string;
  /** 建筑面积（㎡；预设房源由 area 推导，自定义房源由表单直接给） */
  areaNum?: number;
  /** 挂牌价（元）. */
  price: number;
  /** 环线：内=外环内 / 外=外环外（决定限购与二套首付差异）. */
  ring: "内" | "外";
  tag: string;
  tagCls: string;
  /** 新房标记（免增值税 / 无卖方个税）. */
  hold?: "new";
  /** 持有年限：0 | 2 | 5. */
  holdYears: number;
  /** 是否唯一住房（满五唯一免征个税）. */
  unique: boolean;
  /** 取得方式：买卖取得（默认）/ 继承·赠与（个税按差额 20%）. */
  acq?: "buy" | "inherit";
  /** 取得原值（元，继承/赠与口径的差额计税用；0 = 未填，按全额计）. */
  base?: number;
  /** 议价底线（叫停阈值，成交价 = 挂牌价×(1-幅度)）. */
  negotiable: number;
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
 * 记录用户对「居间签约·定金刚则 / 网签·违约金20% / 到手价税费风险」的确认操作
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

/** 学费单（签约清单没写清 / 谈价没谈清的账目化）. */
export interface Lesson {
  k: string;
  /** 短名（总账清单用）. */
  short: string;
  /** 爆雷阶段名. */
  stage: string;
  /** 多花的钱（万元；0 = 钱解决不了的风险）. */
  cost: number;
  /** 拖出来的天. */
  days: number;
  /** 风险标签（cost = 0 时展示）. */
  risk?: string;
  text: string;
  /** 来源（签约清单「X」你没提 / 砍价时你答应的「到手价」）. */
  src: string;
  fix: string;
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

/** 模拟器全局状态. */
export interface SimState {
  scene: SceneKey;
  role: Role | null;
  /** 预设房源（自定义房源走 custom）. */
  house: House | null;
  /** 自定义房源（选「自定义房源」时落定；回预设房源时清空）. */
  custom: House | null;
  /** 最终砍价比例. */
  slash: number;
  /** 成交价（元）. */
  deal: number;
  /** 定金（元，成交价 5%）. */
  deposit: number;
  loanType: LoanTypeKey;
  /** 实际首付比例（最低档 → 用户加档 → 全款 1）. */
  downRate: number;
  /** 用户所选首付档位（0 = 按最低首付）. */
  downSel: number;
  /** 房款首付现金（元，含纯公积金额度不足时并入的部分）. */
  down: number;
  /** 纯公积金额度不足并入首付的金额（元）. */
  gjjTopUp: number;
  deedTax: number;
  /** 不动产登记费 80 元/件. */
  regFee: number;
  agentRate: number;
  agentFee: number;
  /** 增值税（元，卖方）. */
  vat: number;
  /** 增值税附加（元，≈增值税×12%）. */
  vatAdd: number;
  /** 卖方个税（元；买卖所得核定 1%，继承/赠与所得差额 20%）. */
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
  /** 压力 0-100（装修阶段增项累加；购房流程不再展示）. */
  stress: number;
  /** 累计借款（元）. */
  borrowed: number;
  /** 已用借款渠道 → 已筹金额（元；0 或缺失 = 未用该渠道）. */
  usedBorrow: Record<string, number>;
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
  /** 网签已付首付先付部分（元，入资金监管）. */
  firstPay: number;
  /** 累计已出款（元，不含尾款扣押）——状态带钱条与付款确认弹窗「现有现金」同口径. */
  paid: number;
  /** 银行拒批（风控「坚持硬上」→ 材料与时间都白花）. */
  loanRejected: boolean;
  /** 交房时是否选择「尾款扣押」（扣押金额 = 合同价 1%，从卖方房款中扣留）. */
  handHold: boolean;
  /** 交房交割 4 项核验结果（k → 是否已核）. */
  hand: Record<string, boolean>;
  /** 签约清单 12 项结论（k → "do" 写进合同 | "no" 先不写；缺省 = 没提）. */
  con: Record<string, "do" | "no">;
  /** 学费单累计（签约没写清 + 谈价没谈清）. */
  lessons: Lesson[];
  /** 本屏爆出的学费单（进场结算，场景据此展示警示）. */
  burst: Lesson[];
  /** 各段抽到的经历天数（k → 天数；同一次运行内固定，重开重抽）. */
  drawn: Record<string, number>;
  /** 走过的屏（决定累加哪些段的经历天数；跳转不重复累加）. */
  walked: SceneKey[];
  /** 已走天数（= 抽取累计 + 坑拖出来的天，状态带 / 时间条 / 总账同口径）. */
  day: number;
  /** 装修流程是否已结束（final 屏据此隐藏「开始装修」入口）. */
  renovDone: boolean;
  /** 是否跳过装修直接入住（renovDone=true 时区分「装完」与「跳过」）. */
  renovSkipped: boolean;
  /** 交易完成日快照（装修开工前一日；装修工期统计与计划工期条的基准）. */
  renovStartDay: number;
  /** 装修当前绝对天数（开工日 = 交易完成次日）. */
  renovDay: number;
  /** 完工入住日快照（通风完成、进入质保时快照）. */
  renovDoneDay: number;
  /** 装修合同基础价（元，预算屏档位单价 × 面积；装修支出独立于购房现金记账）. */
  renovBudget: number;
  /** 选定的预算档位 key（"half" | "f20" | "f30" | "f40"）. */
  renovPkg: string | null;
  /** 选定的设计师档位 key（"free" | "d100" | "d400"）. */
  renovTier: string | null;
  /** 设计费（元，随设计师档位一次性计入合同价）. */
  renovDesignFee: number;
  /** 13 项合同清单结论（k → "do" 写进合同 | "no" 明确不做；缺省 = 没提）. */
  renovCon: Record<string, string>;
  /** 增项累计（元，合同没写的到站结算）. */
  renovExtra: number;
  /** 已结算的增项单（总账复盘用）. */
  renovBills: RenovBill[];
  /** 已埋雷列表（到达对应阶段时按增项价结算）. */
  renovMines: RenovMine[];
  /** 当前阶段爆出的增项单（进入阶段时由 handler 结算，场景据此展示警示）. */
  renovBurst: RenovBill[];
  /** 本阶段推进天数（上划卡「上一步 +N 天」展示）. */
  renovMoved: number;
  /** 装修记事（决策 + 爆单记录，完成总账屏复盘展示）. */
  renovLog: { stage: string; text: string }[];
  /** 风险确认记录（交易凭证，本地持久化镜像，用于 final 屏展示）. */
  riskLog: RiskRecord[];
}

/** 初始手头现金（元，可动用现金预设档之一 200 万）. */
export const DEFAULT_CASH = 2000000;

/** 家庭月收入（演示值，贷款审批风控：月供 ≤ 收入 50%）. */
export const INCOME = 40000;

/**
 * 公积金家庭最高贷款额度（沪公积金管委会〔2026〕1号，自 2026-02-26 施行）.
 * 首套：家庭 200 万；二套：家庭 160 万；缴交补充公积金各再 +40 万——
 * 此处按官方头条口径（含补充公积金）取 240 万 / 200 万。
 * ⚠️ 原「演示上限 80 万」已废止，勿再引用。
 */
export const GJJ_CAP_FIRST = 2400000;

/** 二套住房公积金家庭上限（160 万 + 补充 40 万）. */
export const GJJ_CAP_SECOND = 2000000;

/** 公积金政策口径脚注（只在选「纯公积金」时展示，避免每屏噪音）. */
export const GJJ_POLICY_NOTE =
  "公积金家庭上限：首套 200 万 / 二套 160 万，缴交补充公积金各 +40 万（本模拟按含补充 240 / 200 万计）；多子女家庭上浮 20%、二星级及以上新建绿色建筑上浮 15%，可叠加至 35%。";

/** 六套预设房源（引 PRD §5.1）. */
export const HOUSES: House[] = [
  {
    id: "A", emoji: "🏚️", name: "内环老破小", area: "58㎡", price: 2000000,
    ring: "内", tag: "满五唯一", tagCls: "badge-sky",
    holdYears: 5, unique: true,
    negotiable: 0.06,
    reno: "简装",
  },
  {
    id: "B", emoji: "🏢", name: "中环次新两房", area: "88㎡", price: 4000000,
    ring: "内", tag: "满五唯一", tagCls: "badge-sky",
    holdYears: 5, unique: true,
    negotiable: 0.05,
    reno: "精装",
  },
  {
    id: "C", emoji: "🏙️", name: "外环品质新房", area: "95㎡", price: 6000000,
    ring: "外", tag: "新房 · 免增值税", tagCls: "badge-sky",
    hold: "new", holdYears: 0, unique: true,
    negotiable: 0.03,
    reno: "毛坯",
  },
  {
    id: "D", emoji: "🏠", name: "外环内老工房", area: "72㎡", price: 3000000,
    ring: "内", tag: "满五不唯一", tagCls: "badge-fog",
    holdYears: 5, unique: false,
    negotiable: 0.08,
    reno: "简装",
  },
  {
    id: "E", emoji: "🏘️", name: "内环江景大平层", area: "160㎡", price: 16000000,
    ring: "内", tag: "满二不唯一", tagCls: "badge-fog",
    holdYears: 2, unique: false,
    negotiable: 0.04,
    reno: "精装",
  },
  {
    id: "F", emoji: "🏗️", name: "中环新交付次新", area: "92㎡", price: 5500000,
    ring: "内", tag: "不满 2 年 · 全额增值税", tagCls: "badge-hair",
    holdYears: 0, unique: false,
    negotiable: 0.05,
    reno: "简装",
  },
];

/** 身份角色（决定贷款利率 / 名下套数 / 税费口径；首付比例由「身份 × 房源环线 × 贷款方式」共同决定）. */
export const ROLES: Record<RoleKey, Role> = {
  first: {
    k: "first", name: "刚需首套", emoji: "🏠", owned: 0, gjjRate: 0.026, commRate: 0.0305,
    tag: "首套待遇", tagCls: "badge-sky",
    d: "名下 0 套 · 商贷首付 15% / 组合贷·公积金 20%",
    p: "公积金 2.6%", note: "商贷 3.05% · 契税 1%",
  },
  trade: {
    k: "trade", name: "置换改善", emoji: "🔄", owned: 0, gjjRate: 0.026, commRate: 0.0305,
    tag: "卖一买一", tagCls: "badge-warm",
    d: "原房已售 · 名下 0 套 · 按首套首付与利率算",
    p: "首付 15-20%", note: "先卖后买 · 一年内卖房再买，个税可退",
  },
  invest: {
    k: "invest", name: "投资二套", emoji: "📈", owned: 1, gjjRate: 0.03075, commRate: 0.0306,
    tag: "二套口径", tagCls: "badge-fog",
    d: "名下 1 套 · 外环内首付 25%",
    p: "利率上浮", note: "公积金 3.075% / 商贷 3.06% · 可能触发房产税",
  },
};

/** 贷款方式（20260901 上海按揭政策表：首付 / 利率随方式与套数区域差异化）. */
export const LOAN_TYPES: Record<LoanTypeKey, { k: LoanTypeKey; name: string; short: string; desc: string }> = {
  comm: { k: "comm", name: "纯商贷", short: "商贷", desc: "额度按房款算，无上限" },
  combo: { k: "combo", name: "组合贷", short: "组合", desc: "公积金 + 商贷，多数家庭首选" },
  gjj: { k: "gjj", name: "纯公积金", short: "公积金", desc: "利率最低，但额度有限：首套家庭 200 万 / 二套 160 万，缴交补充公积金各 +40 万" },
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

/** 装修阶段徽章（HUD 顶部；购房流程的当前屏名取自 flow.SCREENS）. */
export const STAGES: Partial<Record<SceneKey, string>> = {
  renovStart: "装修预算",
  renovDesign: "设计",
  renovContract: "签合同",
  renovDemo: "拆除",
  renovElec: "水电",
  renovSeal: "防水",
  renovTileWood: "木瓦",
  renovPaint: "油漆",
  renovMain: "主材",
  renovInstall: "安装",
  renovClean: "保洁",
  renovAir: "通风",
  renovWarr: "质保",
  renovDone: "完工",
};

/** 12 节点（状态带节点线 + 总账柱图；下标与 flow.SCREENS[].node 一致）. */
export const NODES: string[] = [
  "开始", "选房", "资格", "砍价", "算账", "筹钱", "签约", "贷款", "过户", "领证", "交房", "装修",
];

/** 初始全局状态（进入页面每次新模拟）. */
export function createInitialState(): SimState {
  return {
    scene: "start",
    role: null,
    house: null,
    custom: null,
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
    firstPay: 0,
    paid: 0,
    loanRejected: false,
    handHold: false,
    hand: {},
    con: {},
    lessons: [],
    burst: [],
    drawn: {},
    walked: [],
    day: 1,
    renovDone: false,
    renovSkipped: false,
    renovStartDay: 0,
    renovDay: 0,
    renovDoneDay: 0,
    renovBudget: 0,
    renovPkg: null,
    renovTier: null,
    renovDesignFee: 0,
    renovCon: {},
    renovExtra: 0,
    renovBills: [],
    renovMines: [],
    renovBurst: [],
    renovMoved: 0,
    renovLog: [],
    riskLog: [],
  };
}