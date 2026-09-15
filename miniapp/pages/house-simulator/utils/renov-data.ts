/**
 * 购房模拟器 · 装修流程数据（13 阶段定义 + 信息迷雾事件机制）.
 *
 * 口径对齐装修阶段表（设计量房 → 售后质保）：
 *  - 每阶段有基础工期（days），做功课/返工在此基础上累加（S.renovDay 动态推进）；
 *  - 每阶段按概率（prob，默认 0.8）从事件池随机触发 1 个事件；
 *  - 事件呈现为「具体问题」（销售/师傅的话术与现场状况，即玩家"看到的"），
 *    选项是自然的问题回应：直接定（省钱省时但可能埋雷）vs 做功课（多花天数，
 *    解锁"真实的"信息）；雷（mine）在后续阶段到站爆雷，扣钱 + 拖工期 + 加压力；
 *  - 本文件只放类型、阶段定义与查找函数；事件文案池拆在 renov-events.ts
 *    （纯数据体量大，拆分保持单文件可读）。
 *
 * 纯数据/纯函数模块，不依赖 constants/SimState（避免循环引用）。
 */

import { RENOV_EVENTS } from "./renov-events";

/** 埋雷定义：盲选埋下，到达 at 阶段时爆雷结算. */
export interface RenovMine {
  /** 爆雷阶段尾缀（如 "Install" = renovInstall 屏）. */
  at: string;
  /** 记事短句（装修记事本复盘用）. */
  log: string;
  /** 爆雷文案（结果屏警示条）. */
  text: string;
  /** 爆雷支出（元，计入 renovSpend 增项）. */
  cost: number;
  /** 爆雷返工耗时（天）. */
  days: number;
  /** 压力变化. */
  stress: number;
}

/** 装修事件选项（对问题的自然回应；不出现"要不要做功课"式的元提问）. */
export interface RenovOpt {
  key: string;
  /** 选项文案（第一人称回应）. */
  title: string;
  /** 补充说明（含时间/金钱代价的自然描述）. */
  desc: string;
  /** 选择后的直接结果文案（结果屏展示）. */
  result: string;
  /** 装修记事短句（复盘用）. */
  log: string;
  /** 额外耗时（天，做功课的工期代价）. */
  days: number;
  /** 额外支出（元）. */
  cost: number;
  /** 压力变化（做功课消耗精力）. */
  stress: number;
  /** 快选埋雷：不解锁信息，雷在 at 阶段爆. */
  mine?: RenovMine;
  /** 做功课解锁的真实信息（结果屏展示；有此字段即视为"做了功课"）. */
  learned?: string;
  /** 指定阶段做过功课（renovLearned 含其尾缀）时，本选项支出全免（如质保走合同免费维修）. */
  freeIfStudied?: string;
  /** freeIfStudied 命中时的替代结果文案. */
  resultStudied?: string;
}

/** 装修随机事件：谁说的 + 表面话术/问题呈现 + 选项. */
export interface RenovEvent {
  id: string;
  who: string;
  /** 表面话术 / 问题呈现（信息迷雾的"看到的"）. */
  chat: string;
  opts: RenovOpt[];
}

/** 装修阶段定义. */
export interface RenovStageDef {
  /** 场景 key 尾缀（renovDesign → "Design"）. */
  k: string;
  /** 下一阶段尾缀（"Budget"…；末段 "Done" = renovDone 总账屏）. */
  to: string;
  /** 阶段序号（1-13）. */
  idx: number;
  name: string;
  /** 基础工期（天；质保阶段特殊 = 365，由 handler 跳过日历叙事推进）. */
  days: number;
  /** 工期展示口径（如 "7-30 天"）. */
  daysText: string;
  /** 基础叙事说话人. */
  who: string;
  /** 表面叙事（看到的：一切正常/很专业/很便宜）. */
  chat: string;
  /** 中性提示（不揭底的温馨提示，保持迷雾）. */
  note: string;
  /** 模拟日历快进弹层的"可能风险"提示. */
  risk: string;
  /** 完成本阶段的 CTA 文案. */
  cta: string;
  /** 事件触发概率（缺省 0.8；售后质保 = 1）. */
  prob?: number;
  /** 事件池（由 RENOV_EVENTS 注入，见文件尾）. */
  events: RenovEvent[];
}

/** 阶段定义（不含事件；事件池见 renov-events.ts）. */
const RENOV_RAW: Omit<RenovStageDef, "events">[] = [
  {
    k: "Design", to: "Budget", idx: 1, name: "设计量房", days: 7, daysText: "7-30 天",
    who: "设计师 小美",
    chat: "量完房了，效果图出来了：客厅显大、颜色温馨，收纳我都给你排上了。这套方案落地没问题，后面交给我。",
    note: "效果图之外的功课，都藏在收纳清单、门窗点位和图纸深度里。",
    risk: "方案没定就开工，后面每一步返工都从设计错开始；收纳、门窗、柜子没算，全是后期加钱项。",
    cta: "方案敲定 · 进入预算合同",
  },
  {
    k: "Budget", to: "Demo", idx: 2, name: "预算合同", days: 3, daysText: "3-7 天",
    who: "装修公司销售 大伟",
    chat: "哥，全包 12 万拎包入住，主材全含，你什么都不用管。今天签约还送全屋开关面板，这价格真的只有我们有。",
    note: "低价全包是钩子还是实惠，答案藏在报价单的每一行里。",
    risk: "低价全包的漏项，开工后一张张变成增项单；付款节点没留余地，后期没有筹码。",
    cta: "合同签订 · 开工拆改",
  },
  {
    k: "Demo", to: "Elec", idx: 3, name: "拆改", days: 5, daysText: "5-15 天",
    who: "工长 老周",
    chat: "老房拆旧，我带俩师傅三天拆完，垃圾清运我安排。墙面看着挺结实，有什么问题我会提醒你，放心。",
    note: "拆改是施工第一锤：哪里能拆、哪里绝不能动，开工前就要弄清楚。",
    risk: "承重墙动了是安全事故；空鼓不铲到底层，三个月后墙面成片开裂。",
    cta: "拆改完成 · 水电进场",
  },
  {
    k: "Elec", to: "Seal", idx: 4, name: "水电交底", days: 7, daysText: "7-15 天",
    who: "水电工 李师傅",
    chat: "开关插座按常规点位走，你家这面积 40 来个够用了。行业都这么干，差不多就行，封槽之前都不算数。",
    note: "水电是隐蔽工程：封槽之前，每一根管、每一个点位都要亲眼确认。",
    risk: "点位错一点，家具挡一片；打压不做，渗漏全在入住后爆。",
    cta: "水电封槽 · 防水进场",
  },
  {
    k: "Seal", to: "Tile", idx: 5, name: "防水闭水", days: 3, daysText: "3-7 天",
    who: "瓦工 阿强",
    chat: "卫生间防水刷好了，绿色涂层看着就专业。刷了两遍，稳得很，可以贴砖了。",
    note: "防水做完必须闭水试验：48 小时，楼下天花板是唯一判卷人。",
    risk: "闭水不足 48 小时，楼下渗水赔钱又伤和气；高度不够，水汽照样渗墙。",
    cta: "闭水合格 · 瓦工贴砖",
  },
  {
    k: "Tile", to: "Wood", idx: 6, name: "瓦工", days: 10, daysText: "10-20 天",
    who: "瓦工 阿强",
    chat: "瓷砖上墙，横平竖直。你看这缝，机器都贴不出这水平，验收不验收都一个样。",
    note: "贴完不等于贴好：空鼓锤、水平尺、地漏试水，一样都不能省。",
    risk: "空鼓和坡度问题，贴完才发现就是砸砖返工。",
    cta: "瓦工验收 · 木工进场",
  },
  {
    k: "Wood", to: "Paint", idx: 7, name: "木工", days: 5, daysText: "5-15 天",
    who: "木工 老赵",
    chat: "吊顶龙骨打完了，双层石膏板一封，造型漂亮。龙骨我用了二十年，比什么都结实。",
    note: "吊顶封板之前，龙骨间距、检修口、窗帘盒尺寸，都要抬头看一眼。",
    risk: "龙骨间距大、没留检修口，开裂了连修都没地方下手。",
    cta: "木工封板 · 油漆进场",
  },
  {
    k: "Paint", to: "Main", idx: 8, name: "油漆", days: 15, daysText: "15-30 天",
    who: "油漆工 小陈",
    chat: "头遍腻子今天批完，明天打磨刷漆，一周收工。加点风扇吹着，干得快，不影响质量。",
    note: "油漆的活儿，七分靠等：没干透的每一道工序都是隐患。",
    risk: "湿度过高抢工，干透是假的，发霉是真的。",
    cta: "油漆完工 · 主材下单",
  },
  {
    k: "Main", to: "Install", idx: 9, name: "主材下单", days: 2, daysText: "贯穿全程（复尺下单 2 天）",
    who: "建材市场销售们",
    chat: "断桥铝 500 一平全含；定制柜颗粒板 E0 环保、激光封边；套餐 18㎡ 一万八。每家都拍着胸口保证。",
    note: "主材的水全在参数和报价单里：问清「含什么」，比问「多少钱」重要。",
    risk: "报价只看单价：展开面积、五金、封边工艺，样样都是加钱项。",
    cta: "主材下单 · 约安装进场",
  },
  {
    k: "Install", to: "Clean", idx: 10, name: "安装", days: 10, daysText: "10-20 天",
    who: "工长 老周",
    chat: "门、柜、地板、灯具、卫浴全到货了，我安排师傅依次装，尺寸差不多，现场都能调。",
    note: "安装顺序有讲究：门 → 柜 → 地板 → 灯具 → 卫浴；先到的先装容易打架。",
    risk: "顺序装错全是缝，复尺没量准就返厂。",
    cta: "安装到位 · 开荒保洁",
  },
  {
    k: "Clean", to: "Air", idx: 11, name: "开荒保洁", days: 3, daysText: "3-5 天",
    who: "保洁领队 王姐",
    chat: "姐妹们干了一整天：窗明几净，地反光。大面上都干净了，验收吧，可以拎包入住了。",
    note: "开荒保洁的验收要打灯看细节：划痕、死角、五金，验收合格再付尾款。",
    risk: "验收不细，划痕堵塞入住才发现，售后扯皮没证据。",
    cta: "保洁验收 · 通风等待",
  },
  {
    k: "Air", to: "Warr", idx: 12, name: "通风检测", days: 30, daysText: "30-180 天",
    who: "你 · 等待通风",
    chat: "全部完工。新家安静地空着：柜门全开、抽屉拉开，每天开窗对流。通风一个月，已经没味道了——是不是就能住了？",
    note: "没味道 ≠ 没甲醛：甲醛释放 3-15 年，检测合格才是入住标准。",
    risk: "没味道不等于没甲醛，检测合格才是入住线；暴雨天正好检验门窗。",
    cta: "检测合格 · 准备入住",
  },
  {
    k: "Warr", to: "Done", idx: 13, name: "售后质保", days: 365, daysText: "1-5 年",
    who: "一年后的你",
    chat: "入住一年。水电平稳、柜门顺滑——直到某天，柜门铰链开始吱呀作响，浴室五金起了白斑。翻出合同：质保五年。打电话给装修公司……",
    note: "质保不是一句话：合同里的质保范围、尾款/质保金、聊天记录和发票，都是证据链。",
    risk: "合同、发票、记录没留全，报修时全凭对方良心。",
    cta: "查看装修总账 · 结束流程",
    prob: 1,
  },
];

/** 13 阶段定义（注入事件池）. */
export const RENOV_STAGES: RenovStageDef[] = RENOV_RAW.map((d) => ({
  ...d,
  events: RENOV_EVENTS[d.k] ?? [],
}));

/** 事件默认触发概率. */
export const RENOV_EVENT_PROB = 0.8;

/** 按场景 key（"renovDesign"）或尾缀（"Design"）查找阶段定义. */
export function findRenovDef(scene: string): RenovStageDef | null {
  const tail = scene.replace(/^renov/, "");
  for (const d of RENOV_STAGES) {
    if (d.k === tail) {
      return d;
    }
  }
  return null;
}

/** 完成打卡清单名（装修总账屏用）. */
export const RENOV_ALL: string[] = RENOV_STAGES.map((d) => d.name);
