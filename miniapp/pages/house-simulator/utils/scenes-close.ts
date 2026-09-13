/**
 * 购房模拟器 · 场景分组「监管 · 过户 · 领证 · 交房 · 账单」.
 *
 * 覆盖 5 屏：资金监管 / 过户缴税 / 领证放款 / 交房交割 / 最终账单（含交易凭证）。
 * 文案逐条移植自 docs/design/购房模拟器-hifi.html（PRD §7 沉浸式第一人称）。
 * 纯函数，仅依赖 SimState 与 calc/constants 工具。
 */

import { fmt, fmtY, fmtYuan, pct } from "./calc";
import { LOAN_TYPES, NODES, SimState } from "./constants";
import { bubble, loanRowLabel, RowItem, SceneBlock } from "./scenes-common";

/** 资金监管屏. */
export function sceneEscrow(S: SimState): SceneBlock[] {
  return [
    { t: "title", text: "资金监管" },
    { t: "sub", text: "首付不直接打给卖家，先存入监管账户，领证后 1 个工作日划转。" },
    {
      t: "rows",
      items: [
        { k: "已付定金（签约时）", v: fmtY(S.deposit) },
        { k: "本次存入监管（冲抵定金后）", v: fmtY(S.down - S.deposit) },
        { k: "监管后现金余额", v: fmtY(S.cash - (S.down - S.deposit)) },
        { k: "监管状态", v: "「带押过户」已适用" },
      ],
    },
    { t: "banner", cls: "sky", title: "为什么放心？", desc: "上海已全面推行存量房交易资金监管；过户遇阻，监管资金原路退回，双方都踏实。" },
    { t: "cta", items: [{ action: "escrowOk", title: "首付已入监管，去过户", cls: "btn-ink" }] },
  ];
}

/** 过户缴税屏（买方/卖方税费逐项单列）. */
export function sceneTransfer(S: SimState): SceneBlock[] {
  const isInv = S.role!.k === "invest";
  const h = S.house!;
  const deedTag = "契税（" + (S.areaNum <= 140 ? (isInv ? "二套 1%" : "首套 1%") : isInv ? "二套 2%" : "首套 1.5%") + "）";
  const taxTitle = h.hold === "new" ? "新房一手" : h.holdYears >= 5 ? (h.unique ? "满五唯一" : "满五不唯一") : h.holdYears >= 2 ? "满二不唯一" : "未满 2 年";
  let taxNote: string;
  if (h.hold === "new") {
    taxNote = "一手新房：增值税由开发商缴纳，买方仅承担契税、登记费；无卖方个税。";
  } else if (h.holdYears >= 5 && h.unique) {
    taxNote = "满五唯一：免增值税（满 2 年即免）、免卖方个税。";
  } else if (h.holdYears >= 2) {
    taxNote = (h.holdYears >= 5 ? "满五不唯一" : "满二不唯一") + "：满 2 年免增值税；卖方个税按核定 1% 计（不唯一）。卖方税费若按「到手价」约定则已转嫁，签约时谈妥。";
  } else {
    taxNote = "未满 2 年：全额 5% 增值税 + 附加税费（城建/教育费附加/地方教育附加，约增值税 12% ≈ 0.6%）+ 卖方个税核定 1%。卖方税费若按「到手价」约定则已转嫁，签约时谈妥。";
  }
  const rows: RowItem[] = [
    { k: deedTag, v: fmtY(S.deedTax) },
    { k: "登记费（不动产登记费）", v: "¥80.00" },
  ];
  if (S.vat) {
    rows.push({ k: "增值税（卖方 · 未满 2 年全额 5%）", v: fmtY(S.vat) });
  }
  if (S.vatAdd) {
    rows.push({ k: "增值税附加（卖方）", v: fmtY(S.vatAdd) });
  }
  if (S.sellerTax) {
    rows.push({ k: "卖方个税（核定 1%）", v: fmtY(S.sellerTax) });
  }
  if (S.netTax) {
    rows.push({ k: "卖方税费实付（到手价转嫁 · 你承担）", v: fmtY(S.netTax) });
  }
  rows.push(
    { k: "中介费（" + pct(S.agentRate) + "）", v: fmtY(S.agentFee) },
    { k: "买方一次性税费（契税+登记+中介" + (S.netTax ? "+到手价转嫁" : "") + "）", v: fmtY(S.taxes + S.netTax), total: true },
    { k: "本次扣除后现金余额", v: fmtY(S.cash - S.taxes - S.netTax), total: true },
  );
  const blocks: SceneBlock[] = [
    { t: "title", text: "过户 · 缴税" },
    { t: "sub", text: "随申办 / 一网通办在线办结，最快当天出证。买方税费与卖方税费口径逐项单列。" },
    { t: "rows", items: rows },
  ];
  if (S.estateTax) {
    blocks.push({
      t: "banner",
      cls: "warm",
      title: "房产税（投资二套 · 上海试点）",
      desc: "按年约 " + fmt(S.estateTax) + " 万/年（成交价×70%×0.4%；单价高于上年度新建商品住房均价 2 倍按 0.6%），自持有年度起按年申报，不在此一次性扣除。",
    });
  }
  blocks.push(
    { t: "banner", cls: "warm", title: taxTitle, desc: taxNote },
    { t: "cta", items: [{ action: "trOk", title: "完成过户缴税", cls: "btn-ink" }] },
  );
  return blocks;
}

/** 领证放款屏. */
export function sceneDeed(S: SimState): SceneBlock[] {
  const allCash = S.downRate >= 1;
  const rows: RowItem[] = [
    /* 银行放款 = 贷款额（成交价 − 首付），定金已含在首付中，不再重复扣减；全款无此行 */
    ...(allCash ? [] : [{ k: "银行放款（尾款）" as const, v: fmtY(S.deal - S.down) }]),
    { k: "卖方累计收款", v: fmtY(S.deal) },
    { k: "你本次掏出的钱（含借款）", v: fmtY(S.down + S.taxes + S.netTax) },
  ];
  return [
    { t: "title", text: allCash ? "领证 · 全款结清" : "领证 · 放款" },
    { t: "sub", text: allCash ? "不动产登记办结，电子证照即时可查；房款已现金结清，无需银行放款。" : "不动产登记办结，电子证照即时可查；银行同步放款。" },
    {
      t: "chat",
      items: [
        bubble(
          "信贷经理 高经理",
          allCash
            ? "产证已出。你这单是全款，银行没有参与，尾款自然不用放——钥匙归你，手续清爽。"
            : "产证已出，我这边同步放款——尾款直接打到卖方，你不用再掏一分钱。",
        ),
      ],
    },
    { t: "deed", name: S.house!.name, area: S.house!.area },
    { t: "rows", items: rows },
    {
      t: "note",
      bold: allCash ? "全款说明：" : "别误会：",
      text: allCash
        ? "全款购房无银行贷款环节，卖方全程收到现金房款；税费交割后直接进入交房。"
        : "贷款买房的“尾款”是银行放款直接付给卖方，不需要你再掏一分钱。",
    },
    { t: "cta", items: [{ action: "deedOk", title: "交房，做交割检查", cls: "btn-ink" }] },
  ];
}

/** 交房交割屏（尾款扣押演示）. */
export function sceneHandover(S: SimState): SceneBlock[] {
  const hold = Math.round(S.deal * 0.01 * 100) / 100; /* 尾款扣押演示 1%，精确到分 */
  return [
    { t: "title", text: "交房 · 交割检查" },
    { t: "sub", text: "钥匙到手前还有三件事：户口迁出、物业交割、水电煤过户。" },
    {
      t: "chat",
      items: [bubble("中介 小王", "产证、放款都齐了。交房前我把交割清单过一遍，别让前任留坑。")],
    },
    {
      t: "rows",
      items: [
        { k: "水电煤 / 宽带 / 物业费", v: "待核验" },
        { k: "户口迁出（学区、落户）", v: S.holdback ? "未迁出 ⚠️" : "待核验" },
        { k: "钥匙 / 门禁 / 家具清单", v: "待移交" },
        { k: "专项维修资金", v: "随房移交" },
      ],
    },
    {
      t: "opts",
      items: [
        { action: "hoOk", title: "逐项核对，全部结清", desc: "水电煤物业当场过户，痛快收房。", marker: "🔑 交房" },
        { action: "hoHold", title: "发现物业欠费 / 户口未迁", desc: "与卖家协商：尾款扣押 " + fmt(hold) + " 万，迁出结清后再付。", marker: "尾款扣押" },
      ],
    },
    {
      t: "note",
      bold: "上海惯例：",
      text: "户口未迁出是交房高频纠纷（影响学区/落户）。买卖双方常约定「尾款（户口保证金）」扣押，迁出后结清，一般不超过合同价 5%。",
    },
  ];
}

/** 最终账单屏（含到手价学费卡 / 尾款扣押 / 打卡 / 交易凭证）. */
export function sceneFinal(S: SimState): SceneBlock[] {
  const h = S.house!;
  const L = S.loan;
  const pay = S.down + S.taxes + S.netTax; /* 首付口径 = 房款首付 + 全部交易税费（含中介）+ 到手价转嫁 */
  const tip =
    S.role!.k === "first"
      ? "在上海，你有了自己的家。首付付得清爽，月供在计划内——这第一套，稳了。"
      : S.role!.k === "trade"
        ? "卖一买一升级完成。记住：一年内卖房再买房的个税可以退，收好契税票去办。"
        : "资产落袋。投资二套按年缴房产税约 " + fmt(S.estateTax) + " 万，先算清租金与增值，再谈收益。";
  const borrowText =
    S.borrowed > 0
      ? "你向" + (S.usedBorrow.family ? "亲友" : "") + (S.usedBorrow.gjj ? "公积金" : "") + (S.usedBorrow.credit ? "信用贷" : "") +
        "周转了 " + fmt(S.borrowed) + " 万，已计入首付——这笔钱记得还。" + tip
      : tip;
  const blocks: SceneBlock[] = [
    { t: "title", text: "交房了", hero: "🎉" },
    { t: "sub", text: h.name + " · " + h.area + " · " + fmt(S.deal) + " 万 成交 · 钥匙到手" },
    { t: "banner", cls: "warm", title: "首付落地 · 月供从容" },
    {
      t: "kpis",
      items: [
        { label: "首付（含全部交易税费）", value: fmt(pay), unit: "万" },
        { label: "月供（" + S.loanYears + " 年等额本息）", value: fmtYuan(L.monthly), unit: "元/月" },
      ],
    },
    {
      t: "rows",
      items: [
        { k: "成交价（参考）", v: fmtY(S.deal) },
        { k: "房款首付（" + (S.downRate * 100).toFixed(0) + "% · " + LOAN_TYPES[S.loanType].name + "）", v: fmtY(S.down) },
        { k: "交易税费（契税 + 登记费 + 中介费" + (S.netTax ? " + 到手价转嫁" : "") + "）", v: fmtY(S.taxes + S.netTax) },
        { k: "贷款月供（" + loanRowLabel(S) + "）", v: fmtYuan(L.monthly) + "元/月" },
        { k: "手头余额", v: fmtY(S.cash), total: true },
      ],
    },
  ];
  if (S.netTax) {
    blocks.push({
      t: "banner",
      cls: "warm",
      title: "学费：" + fmt(S.netTax) + " 万的「到手价」",
      desc: "那一刻的「行，就按到手价来」，最后落地成实打实的 " + fmt(S.netTax) + " 万。下次谈价，先问一句「含税还是到手」。",
    });
  }
  blocks.push(
    { t: "banner", cls: "sky", desc: borrowText },
    ...(S.holdback
      ? [
          {
            t: "banner" as const,
            cls: "warm" as const,
            title: "尾款扣押 ¥" + fmt(S.holdback) + " 万",
            desc: "等卖方户口迁出 / 物业结清后支付，记得跟进，别拖成烂账。",
          },
        ]
      : []),
    { t: "check", items: NODES.map((n) => "✓ " + n.t) },
    ...(S.riskLog.length
      ? [
          {
            t: "riskLog" as const,
            items: S.riskLog.map((r) => ({ tag: r.title, ts: r.ts, detail: r.detail })),
          },
        ]
      : []),
    { t: "note", text: "模拟结果仅供参考 · 以官方口径为准" },
    { t: "cta", items: [{ action: "start", title: "重新模拟", cls: "btn-ink" }] },
  );
  return blocks;
}