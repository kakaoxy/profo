/**
 * 购房模拟器 · 购房模块流程数据（对齐 docs/2026-09-17-购房模块-高保真设计稿.html v1）.
 *
 * 本文件是「购房模块」的唯一文案真源：24 屏的常规周期 / 等谁 / 一句现场 / 坑与规避、
 * 签约 12 项深坑清单、交房 4 项交割清单、五个出款点（付款确认弹窗）。
 * 金额与税费口径仍以 constants.ts + calc.ts 为准（本文件只承载流程与文案）。
 *
 * 时间口径（设计稿「时间体感迭代」）：
 *  - 每段的「经历周期」在进入该段时从 real 对应的 days 区间随机取一次，
 *    同一次运行内固定、重开重抽（见 calc.stageDays）；
 *  - par = 与相邻环节同期发生（资格核验与看房同期、砍价在看房里谈、网签与签约同一趟、
 *    筹钱与看房/签约准备同期）：照常展示本段天数，但不累加进「已走 N 天」；
 *  - real === "—" 的屏不摆时间条（选身份 / 填表 / 算账这几步真不花时间，不编数字）。
 */

import type { SceneKey } from "./constants";

/** 购房 24 屏的流程元数据. */
export interface ScreenMeta {
  /** 场景 key（与 SceneKey 的购房部分一一对应）. */
  k: SceneKey;
  /** 12 节点下标（0 开始，对应 constants.NODES）. */
  node: number;
  /** 节点名（状态带当前屏 / 学费单阶段名用）. */
  name: string;
  /** 常规周期展示文案（"7-15 天" / "当天-3 天" / "—" 表示本屏不摆时间条）. */
  real: string;
  /** 常规周期区间（天，已换算单位；与 real 必须一致）. */
  days?: [number, number];
  /** 与相邻环节同期发生：不累加进「已走 N 天」. */
  par?: boolean;
  /** 这一段在等谁. */
  waitWho?: string;
  /** 为什么是这个区间. */
  waitWhy?: string;
  /** 等待屏明细（仅审批 / 过户 / 交房三张屏展开）. */
  wait?: {
    /** 常规节点轴. */
    steps: string[];
    /** 当前走到第几步（下标，之前的标 done、当前标 on）. */
    at: number;
    /** 对方在做什么. */
    peer: string;
    /** 你现在要做什么. */
    you: string;
  };
  /** 一句现场（≤ 26 字）. */
  one: string;
  /** 这一步最容易踩的点（空 = 本屏不摆坑块）. */
  pit: string;
  /** 怎么避免. */
  fix: string;
}

/**
 * 购房 24 屏（顺序即流程顺序：next 走下一屏）.
 */
export const SCREENS: ScreenMeta[] = [
  {
    k: "start", node: 0, name: "开始", real: "—",
    one: "12 个节点，从选房到拿钥匙。",
    pit: "以为流程是「看房 → 交钱 → 拿钥匙」。",
    fix: "真正的坑只有两处：签字那 10 分钟，和交房那一天。",
  },
  {
    k: "role", node: 0, name: "你是谁", real: "—",
    one: "身份决定首付、利率、税费口径。",
    pit: "按首套算，却被认定二套：首付多一成。",
    fix: "名下套数按家庭合并算；置换要确认卖房时点。",
  },
  {
    k: "cash", node: 0, name: "亮家底", real: "—",
    one: "首付 = 房款首付 + 全部交易税费。",
    pit: "只算房款首付，忘了契税、中介费。",
    fix: "先算「首付需现金」，再去看房。",
  },
  {
    k: "select", node: 1, name: "看房", real: "2-8 周", days: [14, 56],
    waitWho: "你 + 中介", waitWhy: "看房、比价、复看，急不来",
    one: "钥匙在手，200 万到 1600 万都有。",
    pit: "只比挂牌价：不满 2 年的房子，税费多十几万。",
    fix: "比「到手总成本」：房价 + 税费 + 中介费。",
  },
  {
    k: "custom", node: 1, name: "自定义房源", real: "—",
    one: "预设房源不够贴身？把自己的条件填进去。",
    pit: "面积填到 141㎡：契税从 1% 跳到 1.5%。",
    fix: "≤140㎡ 契税 1%，超一平就进高档。",
  },
  {
    k: "qa", node: 2, name: "资格核验", real: "1-3 天", days: [1, 3], par: true,
    waitWho: "交易中心", waitWhy: "系统比对，材料齐才快",
    one: "先核验限购资格，再看房不迟。",
    pit: "资格不过 → 无法网签，谈好的价与已付定金都可能白搭。",
    fix: "签约前先核验：非沪籍满 1 年可买，满 3 年外环内 2 套。",
  },
  {
    k: "blocked", node: 2, name: "资格结果", real: "—",
    one: "结果只看户籍、社保年限、环线与名下套数。",
    pit: "被限购就换套更贵的，问题不会消失。",
    fix: "外环外不限套数；置换的原房已卖，名下按 0 套算。",
  },
  {
    k: "nego1", node: 3, name: "砍价 · 第一轮", real: "1-4 周", days: [7, 28], par: true,
    waitWho: "房东 + 中介", waitWhy: "出价要来回磨几轮",
    one: "挂牌价只是起点，先摸底再出价。",
    pit: "第一轮就压到底线以下，房东直接甩脸。",
    fix: "第一轮留余地，别急着亮底牌。",
  },
  {
    k: "nego2", node: 3, name: "砍价 · 第二轮", real: "1-4 周", days: [7, 28], par: true,
    waitWho: "房东", waitWhy: "并入上一轮，谈崩要重来",
    one: "房东在犹豫，就看这一轮怎么出。",
    pit: "反复加价试探，把房东情绪耗光。",
    fix: "报价别越过底线，超了会被叫停。",
  },
  {
    k: "nego3", node: 3, name: "成交 · 到手价", real: "—",
    one: "成交价谈拢了，房东补了一句话。",
    pit: "随口应了「到手价」：卖方税费全归你。",
    fix: "先问一句「含税还是到手」，再落价。",
  },
  {
    k: "feeNego", node: 3, name: "中介费", real: "—",
    one: "中介费按惯例 2%，但可以谈。",
    pit: "按 2% 一签了事，多花几万。",
    fix: "1% 足够覆盖主流服务，敢开口就能谈。",
  },
  {
    k: "loanType", node: 4, name: "贷款方式", real: "—",
    one: "首付比例与利率，随方式和套数变。",
    pit: "只挑最低首付：月供压到收入一半以上会被拒。",
    fix: "月供 ≤ 家庭月收入 50%，是风控线。",
  },
  {
    k: "funds", node: 4, name: "算账", real: "—",
    one: "这笔账先算清楚，再往下走。",
    pit: "首付算漏税费，到这一步才发现差钱。",
    fix: "首付口径 = 房款首付 + 全部税费，一次算完。",
  },
  {
    k: "borrow", node: 5, name: "筹钱", real: "1-2 周", days: [7, 14], par: true,
    waitWho: "亲友 / 银行", waitWhy: "亲友当天到，贷款要审",
    one: "不同来路的钱，代价完全不同。",
    pit: "用信用贷补首付：属监管红线，可能被拒贷、抽贷。",
    fix: "优先亲友与公积金；缺口太大就换房。",
  },
  {
    k: "sign", node: 6, name: "签约 · 居间协议", real: "当天-3 天", days: [0, 3],
    waitWho: "中介 + 房东", waitWhy: "要凑齐买卖双方时间",
    one: "签字那一刻，定金罚则就锁定了。",
    pit: "", fix: "",
  },
  {
    k: "signNet", node: 6, name: "网签 · 买卖合同", real: "当天-3 天", days: [0, 3], par: true,
    waitWho: "中介（网签系统）", waitWhy: "备案排档期，当场能办",
    one: "合同已备案，违约就不再是定金的事了。",
    pit: "", fix: "",
  },
  {
    k: "loan", node: 7, name: "贷款方案", real: "1-3 天", days: [1, 3],
    waitWho: "你 + 信贷经理", waitWhy: "选方案、备材料",
    one: "贷款额、年限、月供，一次定下来。",
    pit: "只盯月供选了 30 年：总利息几乎翻倍。",
    fix: "月供能承受就缩短年限，总利息差很多。",
  },
  {
    k: "loanChk", node: 7, name: "贷款审批", real: "7-15 天", days: [7, 15],
    waitWho: "银行风控 + 公积金", waitWhy: "核征信、评估、面签，按月放额度",
    wait: {
      steps: ["送审当天", "核征信 · 评估", "面签", "出批贷函"], at: 1,
      peer: "银行要核征信、流水、收入证明与房屋评估；公积金中心额度按月轮候——所以口径是 7-15 天，公积金能拉到 15-30 天。",
      you: "把流水与收入证明补齐；这段时间别新增负债、别刷爆信用卡；首付尾款留着别动。",
    },
    one: "银行核征信、流水、面签，出批贷函。",
    pit: "批贷不足或拒批时，合同里没写怎么办。",
    fix: "追加首付或拉长年限；兜底条款签约时就写好。",
  },
  {
    k: "loanContract", node: 7, name: "贷款合同", real: "1-3 天", days: [1, 3],
    waitWho: "银行", waitWhy: "签合同、补首付",
    one: "签贷款合同，同时补足剩余首付。",
    pit: "剩余首付被要求提前补足，现金被抽干。",
    fix: "付款节点写死：定金 / 先付 / 补足 / 尾款。",
  },
  {
    k: "transfer", node: 8, name: "过户递交", real: "7-15 天", days: [7, 15],
    waitWho: "交易中心（税务）", waitWhy: "核价审税，申报价低了要重核",
    wait: {
      steps: ["递交受理", "出收件收据", "核价审税", "出税单"], at: 2,
      peer: "交易中心要核申报价：比对同小区成交与评估价，申报低了会按核定价格重新计税；税务审完才出税单。",
      you: "确认签约时写清的税费归属；备好完税资金；税单出来后按数缴，别拖到过户档期作废。",
    },
    one: "递交材料，交易中心出《收件收据》。",
    pit: "审税核价与申报不符，会按核定价格重新计税。",
    fix: "税费口径签约前就算清，别等税单出来。",
  },
  {
    k: "deed", node: 9, name: "缴税领证", real: "1-3 天", days: [1, 3],
    waitWho: "交易中心", waitWhy: "缴税出证，最快当天",
    one: "缴清税费，领新产证，产证拍照给银行。",
    pit: "产证交了银行：放款前你已经没有主动权。",
    fix: "放款前用尾款扣押约束卖方，写进合同。",
  },
  {
    k: "handover", node: 10, name: "交房 · 交割检查", real: "3-15 天", days: [3, 15],
    waitWho: "银行放款 + 卖方", waitWhy: "放款排队、卖方腾房",
    wait: {
      steps: ["银行放款", "到账确认", "交割核对", "结清尾款"], at: 2,
      peer: "银行按额度排队放款（快 3 天、慢两三周）；卖方要等新房装完或搬完家，才肯交钥匙。",
      you: "交割 4 项逐条核：水电煤、户口、钥匙、维修资金；尾款扣押 ≤5%，结清迁出后再付。",
    },
    one: "钥匙到手前，还有四件事要核。",
    pit: "", fix: "",
  },
  {
    k: "settle", node: 10, name: "交割结算", real: "1 天", days: [1, 1],
    waitWho: "你 + 卖方", waitWhy: "结清当天完成",
    one: "结清尾款，交易流程走完。",
    pit: "尾款一次付完：发现欠费与户口问题，手里没牌。",
    fix: "留一笔尾款，等结清再付（≤ 合同价 5%）。",
  },
  {
    k: "final", node: 11, name: "完成", real: "1-3 个月",
    one: "", pit: "", fix: "",
  },
];

/** 场景 key → 流程元数据. */
export function metaOf(k: SceneKey): ScreenMeta | undefined {
  for (let i = 0; i < SCREENS.length; i++) {
    if (SCREENS[i].k === k) {
      return SCREENS[i];
    }
  }
  return undefined;
}

/** 场景 key → 流程元数据（购房屏必存在；取不到直接抛错，避免静默渲染空屏）. */
export function screenMeta(k: SceneKey): ScreenMeta {
  const m = metaOf(k);
  if (!m) {
    throw new Error("未知购房屏：" + k);
  }
  return m;
}

/** 场景 key → 流程下标（非购房屏返回 -1）. */
export function screenIdx(k: SceneKey): number {
  for (let i = 0; i < SCREENS.length; i++) {
    if (SCREENS[i].k === k) {
      return i;
    }
  }
  return -1;
}

/** 常规周期刻度（天）：1-3 个月口径，用于状态带期条与总账对比. */
export const REAL_MIN = 30;
export const REAL_MAX = 90;

/** 12 节点常规周期（天，总账柱图口径：柱高 = 该节点常规周期）. */
export const NODE_DAYS: number[] = [2, 30, 2, 14, 1, 7, 3, 10, 10, 2, 7, 1];

/** 筹钱三条渠道上限（万元）：合计上限 70 万，已筹只补到缺口为止. */
export const BORROW_CAPS: Record<string, number> = { family: 30, gjj: 20, credit: 20 };

/** 筹钱渠道合计上限（万元）. */
export const BORROW_CAP = BORROW_CAPS.family + BORROW_CAPS.gjj + BORROW_CAPS.credit;

/** 签约深坑一项的「不写」后果. */
export interface SignOmit {
  /** 在哪一屏爆成学费单（SceneKey）. */
  at: SceneKey;
  /** 多花的钱（万元；0 = 钱解决不了的风险）. */
  cost: number;
  /** 拖出来的天. */
  days: number;
  /** 风险标签（cost = 0 时展示，如「钱解决不了」）. */
  risk?: string;
  /** 学费单正文（≤ 26 字）. */
  text: string;
  /** 怎么避免. */
  fix: string;
}

/** 签约深坑清单单项（一屏 6 项，两屏共 12 项）. */
export interface SignItem {
  k: string;
  /** 属于哪一屏：sign = 签字前查清 / signNet = 合同里写死. */
  half: "sign" | "signNet";
  /** 分组标题（一 · 签字前查清 / 二 · 钱与税 …）. */
  sec: string;
  name: string;
  /** 为什么（这一项为什么重要）. */
  why: string;
  /** 写清什么. */
  write: string;
  omit: SignOmit;
}

/**
 * 深坑 ① 签约 · 12 项（sign 屏 6 项 + signNet 屏 6 项）.
 * ⚠️ omit.at 必须晚于该清单所在屏，否则进屏瞬间就把还没做的决定当成坑结算了.
 * cost 为万元（F 房 522.5 万成交口径下的演示值）；cost = 0 的项是「钱解决不了」的风险.
 */
export const SIGN_ITEMS: SignItem[] = [
  /* 一 · 签字前查清（sign 屏） */
  {
    k: "chan", half: "sign", sec: "一 · 签字前查清", name: "产调（抵押 / 查封 / 居住权）",
    why: "房子可能还押在银行，或已被查封。",
    write: "出具《不动产权属查询》：无抵押、无查封、无居住权、无长租约",
    omit: { at: "transfer", cost: 1.2, days: 15, text: "过户才发现房子还抵押着：垫资解押 1.2 万，流程多等 15 天。", fix: "签字前让中介出产调，逐条核对再落笔。" },
  },
  {
    k: "owner", half: "sign", sec: "一 · 签字前查清", name: "产权人到场",
    why: "夫妻共有房只来一人，合同可能无效。",
    write: "全部产权人到场签字；无法到场须公证委托",
    omit: { at: "loan", cost: 0, days: 7, risk: "钱解决不了", text: "网签发现缺一位产权人：合同重签，7 天白等。", fix: "签约前核对产证姓名与人，缺人先办委托公证。" },
  },
  {
    k: "school", half: "sign", sec: "一 · 签字前查清", name: "学位与户口",
    why: "学位被占、户口不迁，钱解决不了。",
    write: "户口迁出日期 + 学位未被占用，写进补充条款",
    omit: { at: "settle", cost: 0, days: 0, risk: "钱解决不了", text: "户口迟迟不迁：孩子入学被统筹，合同里没有可依据的条款。", fix: "写清迁出日期与违约金；学位向学校核实。" },
  },
  /* 二 · 钱与税（sign 屏） */
  {
    k: "net", half: "sign", sec: "二 · 钱与税", name: "税费归属（含税价 / 到手价）",
    why: "不写清归属，房东缴税前还能再提一次。",
    write: "写明成交价含卖方增值税与个税；若要谈「到手价」，把税费清单一起列上",
    omit: { at: "deed", cost: 0, days: 0, risk: "扯皮风险", text: "合同没写税费归属：房东到缴税前还能再提一次「到手价」。", fix: "把税费归属写进合同：含税价，或到手价 + 税费清单。" },
  },
  {
    k: "deposit", half: "sign", sec: "二 · 钱与税", name: "定金罚则",
    why: "写成「订金」，反悔时退不退全靠扯。",
    write: "定金 5%（不超合同价 20%）+ 买方违约不退 / 卖方违约双倍返还",
    omit: { at: "loanContract", cost: 0, days: 0, risk: "扯皮风险", text: "合同写的是「订金」：想反悔时，退不退全凭对方一句话。", fix: "写「定金」，金额、时限、罚则三样写在同一句。" },
  },
  {
    k: "paynode", half: "sign", sec: "二 · 钱与税", name: "付款节点",
    why: "钱在谁手里，谁才有筹码。",
    write: "首付先付入资金监管 / 剩余首付在贷款合同后补足 / 尾款交房后付",
    omit: { at: "loanContract", cost: 0, days: 0, risk: "资金被抽干", text: "付款节点没写：剩余首付被要求提前补足，现金一次被抽干。", fix: "四段写死：定金 / 先付 / 补足 / 尾款。" },
  },
  /* 三 · 违约与工期（signNet 屏） */
  {
    k: "breach", half: "signNet", sec: "三 · 违约与工期", name: "违约金",
    why: "网签后反悔，赔的是房价 20%。",
    write: "违约金比例（房价 20%）+ 触发条件，逐字看清再签",
    omit: { at: "loanChk", cost: 0, days: 0, risk: "钱解决不了", text: "违约金条款没看清：网签后反悔，代价是房价的 20%。", fix: "网签前把「违约责任」那一栏逐字读完。" },
  },
  {
    k: "date", half: "signNet", sec: "三 · 违约与工期", name: "交房日期与逾期赔付",
    why: "交房没有日期，拖起来就没底。",
    write: "交房日期 + 逾期按日赔付（如日万分之三），写在同一句",
    omit: { at: "handover", cost: 0.65, days: 20, text: "交房拖了 20 天：多付一个月房租 6,500，一分赔不到。", fix: "日期与日赔付写在一起，别分开写。" },
  },
  {
    k: "loanfail", half: "signNet", sec: "三 · 违约与工期", name: "贷款失败怎么办",
    why: "批贷不足或拒批，没写清就算你违约。",
    write: "批贷不足 / 拒批时：追加首付或协商解约，双方互不追责",
    omit: { at: "loanChk", cost: 0, days: 0, risk: "算你违约", text: "银行批贷不足：合同没写怎么办，差额算你违约。", fix: "把「贷不到怎么办」写进补充条款。" },
  },
  /* 四 · 交房与兜底（signNet 屏） */
  {
    k: "holdback", half: "signNet", sec: "四 · 交房与兜底", name: "尾款扣押（户口保证金）",
    why: "户口没迁、欠费没结，尾款是最后的牌。",
    write: "扣押尾款金额（≤ 合同价 5%）+ 结清迁出后再支付",
    omit: { at: "settle", cost: 0, days: 0, risk: "手里没牌", text: "尾款一次付完：发现欠费与户口问题，手里一张牌都没有。", fix: "留一笔尾款，结清迁出后再付。" },
  },
  {
    k: "arrears", half: "signNet", sec: "四 · 交房与兜底", name: "欠费结清",
    why: "物业、水电煤的欠费都挂在房子上。",
    write: "交房前结清物业 / 水电煤 / 宽带，凭票据交割",
    omit: { at: "settle", cost: 0.38, days: 0, text: "过户后才发现物业欠费 3,800，前任电话已经打不通。", fix: "交割当天凭票据逐项核，未结清不签字。" },
  },
  {
    k: "stuff", half: "signNet", sec: "四 · 交房与兜底", name: "家具家电清单",
    why: "合同没列的，交房时都可以「不在清单里」。",
    write: "逐项写品牌型号与数量，附照片双方签字",
    omit: { at: "settle", cost: 0.6, days: 0, text: "清单只写「家电若干」：交房时空调与热水器都被搬走了。", fix: "逐项写型号数量，附照片签字。" },
  },
];

/** 深坑 ② 交房 · 交割检查 4 项. */
export interface HandItem {
  k: string;
  name: string;
  why: string;
  /** 已核验文案. */
  ok: string;
  /** 未核验文案. */
  bad: string;
}

export const HAND_ITEMS: HandItem[] = [
  { k: "util", name: "水电煤 / 宽带 / 物业费", why: "欠费都挂在房子上，过户后会追到你。", ok: "已过户 · 费用结清", bad: "未结清 ⚠️" },
  { k: "hukou", name: "户口迁出（学区、落户）", why: "交房高频纠纷，影响学区与落户。", ok: "已迁出", bad: "未迁出 ⚠️" },
  { k: "key", name: "钥匙 / 门禁 / 家具清单", why: "清单没列的，交房时都可以「不在清单里」。", ok: "已移交", bad: "仍未移交 ⚠️" },
  { k: "fund", name: "专项维修资金", why: "随房移交，余额要过户到你名下。", ok: "随房移交", bad: "未过户 ⚠️" },
];

/** 出款点 key（付款确认弹窗）. */
export type PayKind = "deposit" | "firstPay" | "restPay" | "transfer" | "holdback";

/** 付款确认弹窗的一项配置. */
export interface PayKindDef {
  /** 本笔付款的抬头. */
  title: string;
  /** 口径说明. */
  note: string;
  /** 违约警示（无 = 不显示警示条）. */
  warn?: string;
  /** 下一节点（null = 装修，本模块不含工期）. */
  next: SceneKey | null;
  /** 是否不占用买方现金（尾款扣押：从卖方应得房款中扣留）. */
  noCash?: boolean;
}

/** 五个出款点（定金 / 网签首付先付 / 补足剩余首付 / 缴税 / 扣押尾款）. */
export const PAY_KINDS: Record<PayKind, PayKindDef> = {
  deposit: {
    title: "定金 · 居间协议", next: "loanChk",
    note: "定金计入首付、过户时冲抵；居间协议一签即生效——这不是押金，是合同约束。",
  },
  firstPay: {
    title: "首付先付 · 网签", next: "loanChk",
    note: "网签同步把首付先付部分打进资金监管，随即送银行审批；剩余首付等贷款合同确认后补足。",
  },
  restPay: {
    title: "补足剩余首付 · 贷款合同", next: "transfer",
    note: "剩余首付入资金监管；过户领证后由监管账户划转卖方，而不是直接打给对方。",
  },
  transfer: {
    title: "过户 · 缴税", next: "handover",
    note: "契税、登记费、中介费一次性缴清，缴完即可领新产证；产证拍照发银行才会放款。",
  },
  holdback: {
    title: "尾款 · 交割结算", next: null, noCash: true,
    note: "这笔钱从卖方应得的房款里扣留，不占用你的现金；户口迁出、费用结清后再划给卖方——它是你手里最后一张牌。",
  },
};