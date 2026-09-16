/**
 * 购房模拟器 · 场景分组「过户 · 缴税领证 · 交房 · 交割尾款 · 账单」.
 *
 * 覆盖 6 屏：过户递交（收件收据/审税）/ 缴税领证放款（两态）/ 交房交割 /
 * 交割结算尾款 / 最终账单（含交易凭证与装修入口）。
 * 文案逐条移植自 docs/design/购房模拟器-hifi.html（PRD §7 沉浸式第一人称）。
 * 纯函数，仅依赖 SimState 与 calc/constants 工具。
 */

import { fmt, fmtN, fmtY, fmtYuan, pct } from "./calc";
import { DAYS, LOAN_TYPES, NODES, SimState } from "./constants";
import { contractPriceOf, paidTotalOf } from "./renov-data";
import { bubble, loanRowLabel, RowItem, SceneBlock } from "./scenes-common";

/** 过户递交屏：递交材料 → 交易中心出具收件收据 → 期间审税（税费缴付移至领证屏）. */
export function sceneTransfer(S: SimState): SceneBlock[] {
  const h = S.house!;
  return [
    { t: "title", text: "过户 · 递交材料" },
    { t: "sub", text: "随申办 / 一网通办预约过户：递交材料后，交易中心出具《收件收据》——过户审批期间同步启动审税。" },
    {
      t: "rows",
      items: [
        { k: "受理编号", v: "沪受理 2026-" + (1000 + Math.floor(h.price / 100000)) + " 号" },
        { k: "已递交材料", v: "网签合同 · 身份证明 · 产证原件 · 抵押/贷款材料" },
        { k: "到场核验", v: "买卖双方本人到场 · 一方无法到场须公证委托" },
        { k: "交易中心", v: "已受理 · 出具收件收据" },
        { k: "审税状态", v: "审税中（约 7 天）" },
      ],
    },
    {
      t: "banner",
      cls: "sky",
      title: "📋 收件收据 · 审税启动",
      desc: "交易中心受理后即出具《收件收据》；过户期间税务机关核定过户真实价格（审税），约 7 天。核价与申报价不符会按核定价格调整计税——税单要等审税结果出来后才能缴。",
    },
    { t: "cta", items: [{ action: "trDone", title: "材料已递交 · 等待审税", cls: "btn-ink" }] },
  ];
}

/** 缴税领证放款屏（两态）：审税结果 → 缴税领新产证 → 产证拍照给银行 → 银行放款. */
export function sceneDeed(S: SimState): SceneBlock[] {
  const allCash = S.downRate >= 1;
  const isInv = S.role!.k === "invest";
  const h = S.house!;
  const deedTag = "契税（" + (S.areaNum <= 140 ? (isInv ? "二套 1%" : "首套 1%") : isInv ? "二套 2%" : "首套 1.5%") + "）";
  const taxTitle = h.hold === "new" ? "新房一手" : h.holdYears >= 5 ? (h.unique ? "满五唯一" : "满五不唯一") : h.holdYears >= 2 ? "满二不唯一" : "未满 2 年";
  let taxNote: string;
  if (h.hold === "new") {
    taxNote = "一手新房：增值税由开发商缴纳，买方仅承担契税、登记费；无卖方个税。";
  } else if (h.holdYears >= 5 && h.unique) {
    taxNote = "满五唯一：免增值税（持有满 2 年即免）、免卖方个税；「满 5 年」以原始完税时间或初始领证时间孰早为准，且指家庭唯一住房。";
  } else if (h.holdYears >= 2) {
    taxNote = (h.holdYears >= 5 ? "满五不唯一" : "满二不唯一") + "：满 2 年免增值税；卖方个税按核定 1% 计（不唯一）。卖方税费若按「到手价」约定则已转嫁，签约时谈妥。";
  } else {
    taxNote = "未满 2 年：全额 5% 增值税 + 附加税费（城建/教育费附加/地方教育附加，约增值税 12% ≈ 0.6%）+ 卖方个税核定 1%。卖方税费若按「到手价」约定则已转嫁，签约时谈妥。";
  }
  /* 缴税前：审税结果出来后，缴税并领取新产证 */
  if (!S.taxed) {
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
      { t: "title", text: "审税结果 · 缴税领证" },
      {
        t: "chat",
        items: [bubble("交易中心 审税通知", "审税核价完成，与你申报口径一致。凭收件收据前往缴税，缴清税费后即可领取不动产权证书。")],
      },
      { t: "sub", text: "前往税务窗口缴清税费，领取新产证；买方税费与卖方税费口径逐项单列。" },
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
      { t: "cta", items: [{ action: "trOk", title: "缴税并领取新产证", cls: "btn-ink" }] },
    );
    return blocks;
  }
  /* 缴税后：新产证到手，拍照给银行 → 银行放款 */
  const rows: RowItem[] = [
    /* 银行放款 = 贷款额（成交价 − 首付），定金已含在首付中，不再重复扣减；全款无此行 */
    ...(allCash ? [] : [{ k: "银行放款（尾款）" as const, v: fmtY(S.deal - S.down) }]),
    { k: "卖方累计收款", v: fmtY(S.deal) },
    { k: "你本次掏出的钱（含借款）", v: fmtY(S.down + S.taxes + S.netTax) },
  ];
  return [
    { t: "title", text: allCash ? "领证 · 全款结清" : "领证 · 产证已交银行" },
    { t: "sub", text: allCash ? "新产证到手，房款已现金结清，无需银行放款。" : "新产证已到手。将产证拍照发给银行，银行确认后发放贷款。" },
    {
      t: "chat",
      items: [
        bubble(
          "信贷经理 高经理",
          allCash
            ? "产证已出。你这单是全款，银行没有参与，尾款自然不用放——钥匙归你，手续清爽。"
            : "收到产证照片，我这边同步放款——尾款直接打到卖方，你不用再掏一分钱。",
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
    { t: "cta", items: [{ action: "deedOk", title: "放款完成 · 交房", cls: "btn-ink" }] },
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
    {
      t: "note",
      bold: "学区提醒：",
      text: "上海部分区域对入学名额设学位占用限制（如「五年一户」）——房屋学位一旦被占，孩子入学可能被统筹。买前向卖家与中介核实户口与学位使用情况，写进合同补充条款。",
    },
  ];
}

/** 交割结算屏：交割水电/天然气/物业费、迁户口 → 支付尾款（至此交易流程完成）. */
export function sceneSettle(S: SimState): SceneBlock[] {
  const hold = S.holdback;
  const blocks: SceneBlock[] = [
    { t: "title", text: "交割 · 尾款结算" },
    { t: "sub", text: "水电 / 天然气 / 物业费交割，户口迁出确认后结清尾款——至此二手房交易流程完成。" },
    {
      t: "rows",
      items: [
        { k: "水 / 电 / 天然气", v: "已过户 · 费用结清" },
        { k: "物业费", v: hold ? "未结清 ⚠️（卖方欠费）" : "已结清" },
        { k: "户口迁出（学区、落户）", v: hold ? "未迁出 ⚠️" : "已迁出" },
        { k: "尾款", v: hold ? "扣押 ¥" + fmt(hold) + " 万待付" : "已结清（银行放款 / 全款已付）" },
      ],
    },
  ];
  if (hold > 0) {
    blocks.push(
      {
        t: "banner",
        cls: "warm",
        title: "尾款扣押 ¥" + fmt(hold) + " 万",
        desc: "卖家已配合完成交割：户口迁出、物业结清后，支付扣押尾款，双方两清。",
      },
      { t: "cta", items: [{ action: "stOk", title: "支付扣押尾款", cls: "btn-ink" }] },
    );
  } else {
    blocks.push(
      {
        t: "banner",
        cls: "sky",
        title: "✓ 交割全部结清",
        desc: "水电煤物业已过户，户口已迁出；尾款已由银行放款直接划转卖方（全款则已现金结清）。",
      },
      { t: "cta", items: [{ action: "stOk", title: "查看总账单", cls: "btn-ink" }] },
    );
  }
  return blocks;
}

/** 最终账单屏（含到手价学费卡 / 尾款扣押 / 打卡 / 交易凭证 / 装修入口）. */
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
    {
      t: "note",
      bold: "交易周期：",
      text: "历时 16 天（第 1 天定房 → 第 16 天拿钥匙 · 理想无延误口径）。真实周期通常约 1-3 个月——银行放款排队、审税核价、节假日与公积金轮候都会拉长战线。签约前先把周期预期做足。",
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
    {
      t: "check",
      title: S.renovSkipped ? "购房之旅 · 11 个节点完成 · 装修已跳过" : undefined,
      items: NODES.map((n) => (S.renovSkipped && n.t === "装修" ? "✓ 装修（已跳过）" : "✓ " + n.t)),
    },
    ...(S.riskLog.length
      ? [
          {
            t: "riskLog" as const,
            items: S.riskLog.map((r) => ({ tag: r.title, ts: r.ts, detail: r.detail })),
          },
        ]
      : []),
    { t: "note", text: "模拟结果仅供参考 · 以官方口径为准" },
  );
  /* 交易完成 → 按房屋情况决定是否装修 */
  if (S.renovDone) {
    blocks.push(
      S.renovSkipped
        ? {
            t: "banner",
            cls: "sky",
            title: "✅ 交易完成 · 新家已定",
            desc: h.name + " 的全部流程已走完。房屋为「" + h.reno + "」，直接入住，日后有需要再装。",
          }
        : {
            t: "banner",
            cls: "sky",
            title: "✅ 装修完成 · 可以入住",
            desc: "12 个装修阶段全部走完，历时约 " + ((S.renovDoneDay || S.renovDay) - (DAYS.final ?? 0)) + " 天（含增项返工耗时），装修实际花费 " + fmt(paidTotalOf(S)) + " 万（签约 " + fmt(contractPriceOf(S)) + " 万 + 增项 ¥" + fmtN(S.renovExtra) + "）。",
          },
    );
    if (!S.renovSkipped) {
      blocks.push({
        t: "note",
        bold: "历时统计：",
        text: "装修阶段 " + ((S.renovDoneDay || S.renovDay) - (DAYS.final ?? 0)) + " 天 + 交易 " + (DAYS.final ?? 0) + " 天 = 全程 " + (S.renovDoneDay || S.renovDay) + " 天（模拟口径）。真实装修 90㎡ 常见 3-6 个月，增项 10-30% 是常态。",
      });
    }
  } else {
    blocks.push({
      t: "opts",
      items: [
        {
          action: "renovGo",
          title: "🏗️ 开始装修",
          desc: "房屋当前为「" + h.reno + "」。先定装修预算，再走完 12 个阶段（设计 → 售后质保）——工期和增项由你的每一个决策决定。",
          marker: h.reno,
        },
        {
          action: "renovSkip",
          title: "直接入住，不装修",
          desc: "房屋为「" + h.reno + "」，可先住下，日后有需要再装。",
          marker: "结束",
        },
      ],
    });
  }
  blocks.push({ t: "cta", items: [{ action: "start", title: "重新模拟", cls: "btn-ink" }] });
  return blocks;
}