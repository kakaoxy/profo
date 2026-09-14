/**
 * 购房模拟器 · 场景分组「装修」.
 *
 * 覆盖 11 屏：设计师出方案（renovDesign）/ 定方案（renovPlan）/
 * 8 个施工阶段（拆除/砌墙粉墙/水电/瓦工/木工/油漆/安装/保洁交付）/ 装修完成（renovDone）。
 * 装修决策在 final 账单屏完成（开始装修 / 直接入住），不再单独设「是否装修」屏。
 * 工期与阶段口径对齐用户提供的 90㎡ 装修参考流程（无装修预算模拟，仅流程与工期教育）。
 * 纯函数，仅依赖 SimState 与 calc/constants 工具。
 */

import { DAYS, SimState } from "./constants";
import { bubble, SceneBlock } from "./scenes-common";

/** 10 阶段清单名（装修完成打卡用）. */
export const RENOV_ALL: string[] = [
  "设计",
  "定方案",
  "拆除",
  "砌墙粉墙",
  "水电",
  "瓦工",
  "木工",
  "油漆",
  "安装",
  "保洁交付",
];

/** 施工阶段配置（工期区间展示 + 对话/注意事项）. */
interface RenovStageDef {
  /** 场景 key 尾缀（renovDemo 等）. */
  k: string;
  /** 下一阶段场景 key（renovNext 目标）. */
  to: string;
  /** 阶段序号（装修进度 x / 10）. */
  idx: number;
  name: string;
  days: string;
  who: string;
  chat: string;
  note: string;
}

const RENOV_BUILD: RenovStageDef[] = [
  {
    k: "Demo", to: "renovWall", idx: 3, name: "拆除", days: "3-5 天",
    who: "工长 老周",
    chat: "先拆墙拆旧：非承重墙、旧瓷砖地板、老吊顶全清出去，垃圾袋装好等清运。",
    note: "承重墙 / 剪力墙绝对不能动；拆改方案开工前先到物业报备。",
  },
  {
    k: "Wall", to: "renovElec", idx: 4, name: "砌墙 · 粉墙", days: "3-5 天",
    who: "瓦工 阿强",
    chat: "按设计图砌新墙、抹粉找平，门洞窗洞先留好，等干透再进下一道。",
    note: "砌墙后要等砂浆干透再进水电，赶工期容易开裂。",
  },
  {
    k: "Elec", to: "renovTile", idx: 5, name: "水电", days: "7-10 天",
    who: "水电工 李师傅",
    chat: "开槽布管走线：强弱电分槽、水管走顶，点位按你敲定的开关插座图来。",
    note: "水电是隐蔽工程：留底照片 + 电路图，后期维修全靠它。",
  },
  {
    k: "Tile", to: "renovWood", idx: 6, name: "瓦工", days: "7-15 天",
    who: "瓦工 阿强",
    chat: "贴墙砖地砖、卫生间厨房先做防水闭水试验，合格再铺砖。",
    note: "防水至少 48 小时闭水试验，楼下不漏再铺砖。",
  },
  {
    k: "Wood", to: "renovPaint", idx: 7, name: "木工", days: "7-10 天",
    who: "木工 老赵",
    chat: "吊顶、柜体、门套、背景墙——现场裁切安装。",
    note: "板材环保等级要达标；衣柜内部格局开工前想清楚。",
  },
  {
    k: "Paint", to: "renovInstall", idx: 8, name: "油漆", days: "10-20 天",
    who: "油漆工 小陈",
    chat: "墙顶面批腻子打磨、刷底漆面漆，至少两底两面，等干再刷下一道。",
    note: "油漆阶段最等不起的是「等干」——赶工容易起皮开裂。",
  },
  {
    k: "Install", to: "renovClean", idx: 9, name: "安装", days: "7-10 天",
    who: "工长 老周",
    chat: "橱柜、卫浴、灯具、开关面板、木地板通通进场安装，一次到位。",
    note: "大件家具进门前先测门洞尺寸，进不去就尴尬了。",
  },
  {
    k: "Clean", to: "renovDone", idx: 10, name: "保洁 · 交付", days: "3-5 天",
    who: "工长 老周",
    chat: "开荒保洁、通通风，把钥匙和质保卡一并交给你。",
    note: "入住前至少开窗通风 1-3 个月，甲醛检测合格再搬家。",
  },
];

/** 装修施工阶段屏（通用构建：eyebrow 进度 + 阶段名 + 工期 + 讲解 + 注意）. */
function buildRenovStage(def: RenovStageDef): SceneBlock[] {
  return [
    { t: "eyebrow", text: "装修 " + def.idx + " / 10" },
    { t: "title", text: def.name },
    { t: "sub", text: "工期约 " + def.days + "。" },
    { t: "chat", items: [bubble(def.who, def.chat)] },
    { t: "note", bold: "注意：", text: def.note },
    { t: "cta", items: [{ action: "renovNext:" + def.to, title: "完成本阶段 · 进入下一阶段", cls: "btn-ink" }] },
  ];
}

/** 设计师出方案屏（量房 → 平面/风格方案）. */
export function sceneRenovDesign(S: SimState): SceneBlock[] {
  return [
    { t: "eyebrow", text: "装修 1 / 10" },
    { t: "title", text: "设计师出方案" },
    { t: "sub", text: "量房后出平面布置与风格参考，约 1 天。" },
    {
      t: "chat",
      items: [
        bubble("设计师 小美", "量完房了。" + S.house!.area + "，按你喜欢的原木风出了两版平面图：一版保留三房，一版打通客厅阳台。你先看看，定了方案我再深化水电点位图。"),
      ],
    },
    { t: "note", bold: "提醒：", text: "设计方案决定后续拆改与水电布局，改得越多越费时——先想清楚再定。" },
    { t: "cta", items: [{ action: "renovNext:renovPlan", title: "方案 OK，进入定方案", cls: "btn-ink" }] },
  ];
}

/** 定方案屏（演示一轮「反复修改」后敲定，时间不确定）. */
export function sceneRenovPlan(S: SimState): SceneBlock[] {
  return [
    { t: "eyebrow", text: "装修 2 / 10" },
    { t: "title", text: "定方案" },
    { t: "sub", text: "方案可能反复修改，时间不确定——本模拟演示一轮修改后敲定。" },
    {
      t: "chat",
      items: [
        bubble("你", "厨房太小，把冰箱挪到餐厅这边。"),
        bubble("设计师 小美", "行，改！这版把冰箱位挪到餐厅，水电点位同步调整。再确认一眼：没问题的话我出施工图，下周就能进场拆改。"),
        bubble("你", "可以，就这么定。"),
      ],
    },
    { t: "note", bold: "提醒：", text: "定方案越犹豫，进场越晚。施工图确定后，拆除、砌墙、水电才有依据。" },
    { t: "cta", items: [{ action: "renovNext:renovDemo", title: "方案敲定 · 开始施工", cls: "btn-ink" }] },
  ];
}

/** 8 个施工阶段屏（拆除 → 保洁交付，工期按参考流程区间）. */
export function sceneRenovDemo(S: SimState): SceneBlock[] {
  return buildRenovStage(RENOV_BUILD[0]);
}
export function sceneRenovWall(S: SimState): SceneBlock[] {
  return buildRenovStage(RENOV_BUILD[1]);
}
export function sceneRenovElec(S: SimState): SceneBlock[] {
  return buildRenovStage(RENOV_BUILD[2]);
}
export function sceneRenovTile(S: SimState): SceneBlock[] {
  return buildRenovStage(RENOV_BUILD[3]);
}
export function sceneRenovWood(S: SimState): SceneBlock[] {
  return buildRenovStage(RENOV_BUILD[4]);
}
export function sceneRenovPaint(S: SimState): SceneBlock[] {
  return buildRenovStage(RENOV_BUILD[5]);
}
export function sceneRenovInstall(S: SimState): SceneBlock[] {
  return buildRenovStage(RENOV_BUILD[6]);
}
export function sceneRenovClean(S: SimState): SceneBlock[] {
  return buildRenovStage(RENOV_BUILD[7]);
}

/** 装修完成屏（10 阶段打卡 + 历时 + 入住提醒）. */
export function sceneRenovDone(S: SimState): SceneBlock[] {
  /* 装修阶段历时 = 完工日 − 交易完成日；全程 = 定房第 1 天 → 完工日 */
  const rnDays = (DAYS.renovDone ?? 0) - (DAYS.final ?? 0);
  return [
    { t: "title", text: "装修完成", hero: "🏡" },
    { t: "sub", text: S.house!.name + " · 10 个阶段全部走完 · 可以搬新家了" },
    {
      t: "rows",
      items: [
        { k: "装修历时", v: "约 " + rnDays + " 天" },
        { k: "全程（定房 → 完工）", v: "历时 " + (DAYS.renovDone ?? 0) + " 天" },
        { k: "装修状态", v: "完工 · 保洁已交付" },
      ],
    },
    { t: "check", items: RENOV_ALL.map((n) => "✓ " + n) },
    {
      t: "note",
      bold: "口径说明：",
      text: "上述天数为理想情况（无方案返工、材料到货及时、工序紧凑）下的最短估算；实际常因隐蔽工程验收、到货延误而拉长。",
    },
    { t: "banner", cls: "sky", title: "入住提醒", desc: "开窗通风 1-3 个月，甲醛检测合格再搬家；保留水电图与质保卡，售后有据。" },
    { t: "cta", items: [{ action: "renovFinish", title: "查看总账单 · 结束模拟", cls: "btn-ink" }] },
  ];
}
