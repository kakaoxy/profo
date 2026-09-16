/**
 * 购房模拟器 · 装修流程数据 v4「一个坑 + 上划节奏」.
 *
 * 策略（对齐设计稿 docs/2026-09-15-装修模块-高保真设计稿.html v4）：
 *  - 不再「全面表达装修的坑」——不现实。只深耕一个最大的坑：签合同
 *    （13 项清单数据见 renov-contract.ts）；
 *  - 决策点只有 3 处：① 预算档位 ② 设计师档位 ③ 13 项合同清单；
 *    其余 10 个阶段是「上划卡」（一句现场 + 工期/工种 + 一句提醒），不设分支；
 *  - 合同清单不预先标价——「合同价看着低、好签」正是坑本身；
 *    没提的项装到那一步才以增项单到站（比写进合同贵 ≈35%）；
 *  - 半包 = 做过功课的人：不演坑，卡片提醒换成「验收 / 功课时间表」（help 字段）。
 *
 * 钱的三个数：合同价 = 预算 + 设计费 + 写进合同的项；
 *             增项 = 合同没写的到站结算；结账价 = 合同价 + 增项。
 * 纯数据/纯函数模块（对 SimState 仅 type-only 引用，无运行时循环依赖）。
 */

import type { SimState } from "./constants";
import { RENOV_CONTRACT } from "./renov-contract";

/** 增项单明细行：[项目名, 金额（元）]. */
export type RenovLine = [string, number];

/** 已结算的增项单（合同没写的项到站的账目化凭证）. */
export interface RenovBill {
  /** 单号（"#01" 起连续编号）. */
  no: string;
  /** 爆单阶段名（如 拆除）. */
  stage: string;
  /** 爆单日（返工后的第 N 天）. */
  day: number;
  /** 明细行. */
  lines: RenovLine[];
  /** 小计（元）. */
  cost: number;
  /** 返工耗时（天）. */
  days: number;
  /** 爆单文案. */
  text: string;
  /** 溯源（哪一项合同没写 / 你选了不做）. */
  src: string;
  /** 下次怎么避免. */
  hint: string;
}

/** 合同没写清 / 明确不做而埋下的雷：到达 at 阶段时按增项价结算成 RenovBill. */
export interface RenovMine {
  /** 爆雷阶段尾缀（如 "Install" = renovInstall 屏）. */
  at: string;
  /** 返工耗时（天）. */
  days: number;
  /** 明细行. */
  lines: RenovLine[];
  /** 爆雷文案. */
  text: string;
  /** 溯源（哪一项没写清）. */
  src: string;
  /** 下次怎么避免. */
  hint: string;
  /** 关联合同项 k（溯源用）. */
  scope: string | null;
}

/** 合同清单单项（13 项数据见 renov-contract.ts）. */
export interface RenovContractItem {
  k: string;
  /** 分组标题（一 · 拆改的边界 等）. */
  sec: string;
  name: string;
  /** 纠纷点（为什么这一项要写清）. */
  why: string;
  /** 写清什么（写进合同后的展示文案）. */
  write: string;
  /** 写进合同的价格（元；0 = 无追加费用，只锁标准）。不预先标价，仅用于合同价累计. */
  doPrice: number;
  /** 「不做」按钮文案（半包可用 halfNoLabel 覆盖）. */
  noLabel: string;
  /** 「不做」的后果说明. */
  noNote: string;
  /** safe = 不做无风险；risk = 不做埋雷（noMine）. */
  noKind: "safe" | "risk";
  /** 半包口径的「写清」文案（如主材自购清单）. */
  halfWrite?: string;
  /** 半包口径的「不做」文案. */
  halfNoLabel?: string;
  /** 半包口径的「不做」后果. */
  halfNoNote?: string;
  /** 明确不做埋下的风险雷. */
  noMine?: { at: string; days: number; lines: RenovLine[]; text: string; src: string; hint: string };
  /** 合同没提 → 到 at 阶段按增项价爆单. */
  omit?: { at: string; days: number; lines: RenovLine[]; text: string; src: string; hint: string };
}

/** 预算档位（上海就两种情况：半包 / 全包三档）. */
export interface RenovPkg {
  k: "half" | "f15" | "f25" | "f40";
  /** 标签（主材自购 / 广告里的全包价 等）. */
  tag: string;
  /** 单价（元/㎡）. */
  perSq: number;
  /** 标签配色：hot=暖 / cool=蓝 / 空=灰. */
  badge: "" | "hot" | "cool";
  name: string;
  desc: string;
  /** 选中后显示的一句话（档位的底牌）. */
  tail: string;
}

/** 设计师档位（价格以「元」显示，不进万元口径）. */
export interface RenovTier {
  k: "free" | "d100" | "d400";
  name: string;
  /** 设计费（元）. */
  price: number;
  /** 标签（整装公司送设计 / 100 元/㎡ 等）. */
  badge: string;
  desc: string;
  /** 选中后显示的一句话（档位的底牌）. */
  tail: string;
}

/** 装修阶段定义（12 阶段；每张卡一句话，任何一句 ≤ 26 字）. */
export interface RenovStageDef {
  /** 阶段尾缀（renovDesign → "Design"）. */
  k: string;
  /** 阶段序号（1-12）. */
  idx: number;
  name: string;
  /** 基础工期（天；质保阶段 365 由 handler 叙事推进）. */
  days: number;
  /** 工期展示口径（如 "9-15 天"）. */
  daysText: string;
  /** 谁在做. */
  who: string;
  /** 这一步在干什么（≤ 26 字）. */
  one: string;
  /** 全包视角——这一步最容易踩的点. */
  key: string;
  /** 半包视角——什么时候该验收 / 该做什么功课. */
  help: string;
  /** 完成本阶段的 CTA 文案. */
  cta: string;
  /** 本屏为设计师档位决策屏（不可上划跳过）. */
  pickTier?: boolean;
  /** 本屏为合同清单决策屏（不可上划跳过）. */
  contract?: boolean;
}

/** 预算档位（半包不演坑：tail 说明后续口径）. */
export const RENOV_PKGS: RenovPkg[] = [
  {
    k: "half", tag: "主材自购", perSq: 1000, badge: "cool", name: "半包 · 施工 + 辅材",
    desc: "人工 + 辅材，主材自己买（另约 3-6 万）。",
    tail: "选这条路的人做过功课：后面不演坑，只给你验收时间表。",
  },
  {
    k: "f15", tag: "广告里的全包价", perSq: 1500, badge: "hot", name: "全包 · 起步档",
    desc: "主材最低配，边界项一项都不含。",
    tail: "合同价看着低，因为它什么都没写。",
  },
  {
    k: "f25", tag: "多数家庭的成交价", perSq: 2500, badge: "", name: "全包 · 主流档",
    desc: "主材可选品牌，施工标准写进合同。",
    tail: "档位解决材料，解决不了「边界写没写」。",
  },
  {
    k: "f40", tag: "省心不省合同", perSq: 4000, badge: "cool", name: "全包 · 品质档",
    desc: "品牌主材 + 部分定制柜。",
    tail: "贵的是确定性；没写的，照样来加钱。",
  },
];

/** 设计师三档. */
export const RENOV_TIERS: RenovTier[] = [
  {
    k: "free", name: "免费设计", price: 0, badge: "整装公司送设计",
    desc: "会画 CAD 的销售。图纸到效果图为止。",
    tail: "免费的最贵：它是获客成本，会在合同里赚回来。",
  },
  {
    k: "d100", name: "独立设计师", price: 6000, badge: "100 元/㎡",
    desc: "看运气：可能是真独立设计师，也可能是免费的换个马甲。",
    tail: "验货三问：施工图看几张？到场交底几次？改稿封顶多少？",
  },
  {
    k: "d400", name: "全案设计师", price: 24000, badge: "300-500 元/㎡",
    desc: "墙顶地色彩、动线、收纳、照明一起想，图纸能落到施工。",
    tail: "贵在「提前想完」：插座、动线、颜色，图纸阶段就定了。",
  },
];

/** 12 阶段定义（one ≤ 26 字；key = 全包提醒，help = 半包验收时间表）. */
export const RENOV_STAGES: RenovStageDef[] = [
  {
    k: "Design", idx: 1, name: "设计", days: 10, daysText: "10-30 天", pickTier: true,
    who: "设计师", one: "量完房，效果图明天出来。",
    key: "效果图好看没用：施工图、点位图、柜体图才是能落地的。",
    help: "自己先量一遍：墙、窗、管道位置，拍照存档。",
    cta: "图纸定稿",
  },
  {
    k: "Contract", idx: 2, name: "签合同", days: 3, daysText: "3-7 天", contract: true,
    who: "装修公司销售 大伟", one: "合同都是标准文本，直接签就行。",
    key: "", help: "", cta: "按清单签约 · 开工",
  },
  {
    k: "Demo", idx: 3, name: "拆除", days: 6, daysText: "6-15 天",
    who: "工长 老周", one: "拆旧、清运、铲墙皮。",
    key: "别动承重墙：图纸上的黑色实线不能碰。",
    help: "开工前让工长出一张「拆改分项单」，逐项写清再动工。",
    cta: "拆完，水电进场",
  },
  {
    k: "Elec", idx: 4, name: "水电", days: 9, daysText: "9-15 天",
    who: "水电工 李师傅", one: "开槽、布管、穿线。",
    key: "封槽前拍照留底——以后在墙上打孔全靠它。",
    help: "验收时间点：封槽前。点位对不对、线走没走直角、水管打压合格。",
    cta: "封槽，防水进场",
  },
  {
    k: "Seal", idx: 5, name: "防水", days: 3, daysText: "3-7 天",
    who: "瓦工 阿强", one: "防水刷两遍，做蓄水试验。",
    key: "闭水 48 小时，提前跟楼下打招呼。",
    help: "验收时间点：蓄水 48 小时后去看楼下天花板，合格再贴砖。",
    cta: "闭水合格，木瓦进场",
  },
  {
    k: "TileWood", idx: 6, name: "木瓦", days: 12, daysText: "12-20 天",
    who: "瓦工 阿强 / 木工 老赵", one: "贴砖、吊顶、墙面找平。",
    key: "要装柜子的三面墙，一定量平整度：墙差 5 毫米，柜子就装不平。",
    help: "验收时间点：贴完砖、师傅撤场前。空鼓锤逐块敲，撤场后再找人难。",
    cta: "木瓦验收，主材下单",
  },
  {
    k: "Paint", idx: 7, name: "油漆", days: 15, daysText: "15-30 天 · 跨梅雨",
    who: "油漆工 小陈", one: "批腻子、打磨、刷漆。",
    key: "上海梅雨季在 6-7 月：湿度超过 85% 就停工，宁可多等一周。",
    help: "验收时间点：每一遍腻子干透再上下一遍；剩漆封存留底。",
    cta: "油漆完工，主材进场",
  },
  {
    k: "Main", idx: 8, name: "主材", days: 2, daysText: "复尺 2 天",
    who: "建材市场销售们", one: "复尺、下单、等货。",
    key: "下单前先复尺：坑距、门洞、柜位，差 5 公分就装不上。",
    help: "自购主材：先列清单再跑店，别让工人带买（有回扣）。",
    cta: "主材下单，安装进场",
  },
  {
    k: "Install", idx: 9, name: "安装", days: 10, daysText: "10-20 天",
    who: "工长 老周", one: "门、柜、地板、灯具依次装。",
    key: "顺序错了全是缝：门 → 柜 → 地板，先到先装会打架。",
    help: "验收时间点：装完当场验水平、门缝、收口，别等师傅撤场。",
    cta: "安装到位，开荒保洁",
  },
  {
    k: "Clean", idx: 10, name: "开荒保洁", days: 3, daysText: "3-5 天",
    who: "保洁领队 王姐", one: "窗明几净，看着挺干净。",
    key: "打灯看细节：窗框槽、五金划痕、地漏下水。",
    help: "尾款留 10%：验收合格再付。",
    cta: "保洁验收，通风检测",
  },
  {
    k: "Air", idx: 11, name: "通风检测", days: 30, daysText: "30-180 天",
    who: "你 · 等待通风", one: "柜门打开、每天对流，一个月过去。",
    key: "没味道 ≠ 没甲醛：CMA 检测合格才是入住线。",
    help: "检测时间点：密闭 12 小时采样，甲醛 ≤0.08mg/m³ 才搬家。",
    cta: "检测合格，准备入住",
  },
  {
    k: "Warr", idx: 12, name: "售后质保", days: 365, daysText: "1-5 年",
    who: "一年后的你", one: "一年后：柜门铰链响了、五金起了斑。",
    key: "质保 5 年 ≠ 什么都保：易耗件常写在免责条款里。",
    help: "留证据三件套：合同附件 + 发票 + 书面报修记录。",
    cta: "查看装修总账",
  },
];

/** 合同清单 13 项（数据见 renov-contract.ts）. */
export { RENOV_CONTRACT };

/** 计划工期：11 个施工阶段基础天数合计（质保 365 天不计时）+ 开工首日. */
export const RENOV_PLAN_BASE: number = RENOV_STAGES.filter((s) => s.k !== "Warr").reduce((a, s) => a + s.days, 0);
export const RENOV_PLAN_TOTAL: number = RENOV_PLAN_BASE + 1;

/** 按场景 key（"renovDemo"）或尾缀（"Demo"）查找阶段定义. */
export function findRenovDef(scene: string): RenovStageDef | null {
  const tail = scene.replace(/^renov/, "");
  for (const d of RENOV_STAGES) {
    if (d.k === tail) {
      return d;
    }
  }
  return null;
}

/** 元 → 万元去尾零（15.00 → "15"、15.50 → "15.5"；对齐设计稿 wan()）. */
export function wanFmt(v: number): string {
  return (v / 10000).toFixed(2).replace(/\.?0+$/, "");
}

/** 元 → ¥千分位（6000 → "¥6,000"；对齐设计稿 yuan()）. */
export function yuanFmt(v: number): string {
  return "¥" + Math.round(v).toLocaleString("en-US");
}

/** 写进合同的 13 项追加费用合计（元）. */
export function contractAddOf(con: Record<string, string>): number {
  return RENOV_CONTRACT.reduce((a, it) => a + (con[it.k] === "do" ? it.doPrice : 0), 0);
}

/** 合同价（元）= 预算 + 设计费 + 写进合同的项. */
export function contractPriceOf(S: Pick<SimState, "renovBudget" | "renovDesignFee" | "renovCon">): number {
  return S.renovBudget + S.renovDesignFee + contractAddOf(S.renovCon);
}

/** 结账价（元）= 合同价 + 增项. */
export function paidTotalOf(S: Pick<SimState, "renovBudget" | "renovDesignFee" | "renovCon" | "renovExtra">): number {
  return contractPriceOf(S) + S.renovExtra;
}

/** 已定结论的合同项数. */
export function decidedCountOf(con: Record<string, string>): number {
  return RENOV_CONTRACT.filter((it) => con[it.k]).length;
}

/** 已写进合同的项名列表. */
export function writtenListOf(con: Record<string, string>): string[] {
  return RENOV_CONTRACT.filter((it) => con[it.k] === "do").map((it) => it.name);
}

/** 完成打卡清单名（装修总账屏用）. */
export const RENOV_ALL: string[] = RENOV_STAGES.map((d) => d.name);
