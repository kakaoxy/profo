/**
 * 购房模拟器 · 场景分组「贷款方式 · 算账 · 筹钱 · 签约」.
 *
 * 覆盖 5 屏：贷款方式（含首付档位）/ 算账 / 筹钱 / 签约·居间协议 / 网签·买卖合同。
 * 文案逐条移植自 docs/design/购房模拟器-hifi.html（PRD §7 沉浸式第一人称）。
 * 纯函数，仅依赖 SimState 与 calc/constants 工具。
 */

import { firstPayFor, fmt, fmtY, pct } from "./calc";
import { downRateFor, LOAN_TYPES, SimState } from "./constants";
import { bubble, OptItem, RowItem, SceneBlock } from "./scenes-common";

/** 贷款方式屏（含首付档位选择）. */
export function sceneLoanType(S: SimState): SceneBlock[] {
  const h = S.house!;
  const isInv = S.role!.k === "invest";
  const ringTag = h.ring === "内" ? "外环内" : "外环外（特殊区域口径）";
  const dr = (lt: "comm" | "combo" | "gjj") => (downRateFor(S.role!.k, h.ring, lt) * 100).toFixed(0) + "%";
  const downEst = (lt: "comm" | "combo" | "gjj") =>
    fmt(S.deal * downRateFor(S.role!.k, h.ring, lt)) + " 万";
  /* 首付档位：最低（联动贷款方式）+ 可在最低之上多付，100% = 全款不贷款 */
  const minRate = downRateFor(S.role!.k, h.ring, S.loanType);
  const steps: { action: string; label: string; amount: string; active: boolean }[] = [
    { action: "ds:0", label: "最低 " + (minRate * 100).toFixed(0) + "%", amount: fmt(S.deal * minRate) + " 万", active: S.downSel === 0 },
    { action: "ds:0.3", label: "30%", amount: fmt(S.deal * 0.3) + " 万", active: S.downSel === 0.3 },
    { action: "ds:0.5", label: "50%", amount: fmt(S.deal * 0.5) + " 万", active: S.downSel === 0.5 },
    { action: "ds:1", label: "全款 100%", amount: fmt(S.deal) + " 万", active: S.downSel === 1 },
  ];
  return [
    { t: "title", text: "贷款方式 · 先定门槛" },
    {
      t: "chat",
      items: [
        bubble("信贷经理 高经理", "房子定了，先选贷款方式——首付比例、利率都不一样。" + ringTag + (isInv ? "、二套" : "、首套") + "，多数家庭用组合贷。首付也可以在最底线之上多付，手头宽裕甚至可以不贷款。"),
      ],
    },
    {
      t: "rows",
      items: [
        { k: "成交价", v: fmtY(S.deal) },
        { k: "当前首付（" + (S.downRate >= 1 ? "全款" : LOAN_TYPES[S.loanType].name) + "）", v: fmtY(S.down) + "（含定金 " + fmt(S.deposit) + " 万）" },
      ],
    },
    {
      t: "opts",
      items: [
        { action: "lt:comm", title: "纯商贷", desc: "最低首付 " + dr("comm") + " · 商贷 " + pct(S.role!.commRate) + "（" + (isInv ? "二套" : "首套") + "利率）", marker: "最低 " + downEst("comm") },
        { action: "lt:combo", title: "组合贷（默认）", desc: "最低首付 " + dr("combo") + " · 公积金 " + pct(S.role!.gjjRate) + " + 商贷 " + pct(S.role!.commRate), marker: "最低 " + downEst("combo") },
        { action: "lt:gjj", title: "纯公积金", desc: "最低首付 " + dr("gjj") + " · 公积金 " + pct(S.role!.gjjRate) + " · 额度上限 80 万（演示）", marker: "最低 " + downEst("gjj") },
      ],
    },
    {
      t: "downSteps",
      min: "最低 " + (minRate * 100).toFixed(0) + "%",
      items: steps,
    },
    {
      t: "note",
      bold: "首付怎么定：",
      text: "比例可在最低之上多加（首付越高贷款越少）；选「全款 100%」则无需向银行申请贷款，流程直接跳过贷款审批。贷款利率按套数口径：首套商贷 " + pct(S.role!.commRate) + " / 公积金 " + pct(S.role!.gjjRate) + "；二套上浮（公积金 3.075% / 商贷 3.06%）。",
    },
    { t: "cta", items: [{ action: "ltOk", title: "选好了，去算账", cls: "btn-ink" }] },
  ];
}

/** 算账屏（首付需现金明细 + 资金缺口警示）. */
export function sceneFunds(S: SimState): SceneBlock[] {
  const gap = Math.max(0, S.need - S.cash);
  const isInv = S.role!.k === "invest";
  const deedTag = "契税（" + (S.areaNum <= 140 ? (isInv ? "二套 1%" : "首套 1%") : isInv ? "二套 2%" : "首套 1.5%") + "）";
  const rows: RowItem[] = [
    { k: "成交价", v: fmtY(S.deal) },
    {
      k: S.downRate >= 1
        ? "首付（房款 100% · 全款现金支付，含定金 " + fmt(S.deposit) + " 万）"
        : "首付（房款 " + (S.downRate * 100).toFixed(0) + "% · " + LOAN_TYPES[S.loanType].name + "，含定金 " + fmt(S.deposit) + " 万）",
      v: fmtY(S.down),
    },
    { k: deedTag, v: fmtY(S.deedTax) },
    { k: "登记费（不动产登记费）", v: "¥80.00" },
    { k: "中介费（" + pct(S.agentRate) + "）", v: fmtY(S.agentFee) },
  ];
  if (S.netTax) {
    rows.push({ k: "卖方税费转嫁（你已答应「到手价」）", v: fmtY(S.netTax) });
  }
  if (S.gjjTopUp) {
    rows.push({ k: "公积金额度补足（已并入首付）", v: fmtY(S.gjjTopUp) });
  }
  if (S.estateTax) {
    rows.push({ k: "房产税（投资二套 · 按年，不计入一次性）", v: fmt(S.estateTax) + " 万/年" });
  }
  rows.push({ k: "首付需现金（含全部交易税费）", v: fmtY(S.need), total: true });

  const status: SceneBlock =
    gap > 0
      ? {
          t: "banner",
          cls: "warm",
          title: "还差 " + fmt(gap) + " 万",
          desc: "你手头有 " + fmt(S.cash) + " 万存款，不够覆盖「房款首付 + 交易税费" + (S.netTax ? " + 到手价转嫁" : "") + "」。",
        }
      : {
          t: "banner",
          cls: "sky",
          title: "✓ 资金充足",
          desc: "手头 " + fmt(S.cash) + " 万，扣除首付税费后结余 " + fmt(S.cash - S.need) + " 万，可继续签约。",
        };
  const blocks: SceneBlock[] = [
    { t: "title", text: "这笔账，先算清楚" },
    { t: "sub", text: S.house!.name + " · 以 " + fmt(S.deal) + " 万成交价估算 · " + LOAN_TYPES[S.loanType].name + "。首付口径已含买方全部交易税费，中介费与税费分开单列。" },
    { t: "rows", items: rows },
    status,
  ];
  if (S.netTax) {
    blocks.push({
      t: "banner",
      cls: "warm",
      title: "⚠️ 你现在才看到这笔钱",
      desc: "砍价成交时你随口应了「" + fmt(S.deal) + " 万到手」——卖方增值税/个税约 " + fmt(S.netTax) + " 万由此转嫁给你，已经算进上面「需现金」里了。当时要是按含税价谈，这一行根本不会出现。",
    });
  }
  if (S.vat) {
    blocks.push({
      t: "note",
      bold: "卖方税费提示：",
      text:
        "本房卖方另需缴增值税约 " + fmt(S.vat) + " 万 + 附加约 " + fmt(S.vatAdd) + " 万" +
        (S.sellerTax ? "、个税约 " + fmt(S.sellerTax) + " 万" : "") +
        "。按上海惯例由卖方承担，不在你现金中列支——" +
        (S.netTax ? "除非你刚才答应了「到手价」（见上方警示行）。" : "除非你在砍价时答应他「到手价」。这一行，别让它在合同里复活。"),
    });
  }
  const footNote: SceneBlock =
    S.downRate >= 1
      ? { t: "note", text: "已选全款：全部房款以现金结清，无银行贷款环节，后续直接进入签约 → 资金监管 → 过户领证。" }
      : { t: "note", text: "定金含在首付内，签约时先付、过户时冲抵；贷款部分由银行后端解决，不算入“需要现金”。" };
  blocks.push(
    { t: "cta", items: [{ action: gap > 0 ? "borrow" : "sign", title: gap > 0 ? "先筹钱，再签约" : "资金充足，去签约", cls: "btn-ink" }] },
    { t: "link", action: "loanType", text: "‹ 返回调整首付档位 / 贷款方式" },
    footNote,
  );
  return blocks;
}

/** 筹钱屏（三条借款渠道 + 红线提示）. */
export function sceneBorrow(S: SimState): SceneBlock[] {
  const gap = Math.max(0, S.need - S.cash);
  const cap = 300000 + 200000 + 200000; /* 亲友 + 公积金提取 + 信用贷 合计上限（演示） */
  const room = cap - S.borrowed;
  const opts: OptItem[] = [];
  if ("family" in S.usedBorrow) {
    opts.push({ action: "bor:family", title: "已向亲友借入，缺口 " + (gap > 0 ? "仍差 " + fmt(gap) + " 万" : "已补齐"), disabled: true });
  } else {
    opts.push({ action: "bor:family", title: "向亲友借款（最多 30 万）", desc: "视缺口借入，无利息压力，人情慢慢还。", marker: "+30万内" });
  }
  if ("gjj" in S.usedBorrow) {
    opts.push({ action: "bor:gjj", title: "已按演示提取公积金", disabled: true });
  } else {
    opts.push({ action: "bor:gjj", title: "提取公积金（演示，最多 20 万）", desc: "二手房通常不能直接提取付首付，需先自筹；此处仅作额度演示。", marker: "压力 +15" });
  }
  if ("credit" in S.usedBorrow) {
    opts.push({ action: "bor:credit", title: "已申请信用贷", disabled: true });
  } else {
    opts.push({ action: "bor:credit", title: "信用贷 / 消费贷（最多 20 万）", desc: "门槛低、放款快，但资金用途属于监管红线。", marker: "⚠️ 红线" });
  }
  opts.push({ action: "changeHouse", title: "换套便宜点的", desc: "回到选房，重新挑一套总价更低的。", marker: "借款将退还" });

  const still: SceneBlock =
    gap > 0
      ? {
          t: "banner",
          cls: "warm",
          title: "仍有缺口 " + fmt(gap) + " 万",
          desc:
            gap > room
              ? "三条借款渠道合计最多约 " + fmt(cap) + " 万，缺口已超出可借上限。继续硬撑不现实，建议换一套总价更低的房源（限购受限时可自定义一套外环外低价房源）。"
              : "还可通过下方渠道再借约 " + fmt(room) + " 万。",
        }
      : { t: "banner", cls: "sky", title: "✓ 缺口已补齐" };

  const blocks: SceneBlock[] = [
    { t: "title", text: "怎么补上这笔钱？" },
    { t: "sub", text: "手头 " + fmt(S.cash) + " 万，缺口 " + fmt(gap) + " 万。不同来路的钱，代价完全不同。" },
    { t: "opts", items: opts },
    still,
  ];
  if (gap <= 0) {
    blocks.push({ t: "cta", items: [{ action: "sign", title: "签约 · 付定金", cls: "btn-ink" }] });
  } else if (gap > room) {
    blocks.push({ t: "cta", items: [{ action: "changeHouse", title: "缺口过大 · 换套便宜点的", cls: "btn-ink" }] });
  } else {
    blocks.push({ t: "note", text: "还需 " + fmt(gap) + " 万 · 用上方渠道补足后再签约" });
  }
  blocks.push({ t: "link", action: "funds", text: "‹ 返回算账，调整首付档位 / 贷款方式" });
  blocks.push({
    t: "note",
    bold: "红线提示：",
    text: "上海银保监局严禁信贷资金流入房地产。信用贷购房可能被银行拒贷、影响征信，本模拟仅用于风险教育，绝不构成建议。",
  });
  return blocks;
}

/** 签约 · 居间协议屏（定金罚则警示）. */
export function sceneSign(S: SimState): SceneBlock[] {
  /* ① 居间协议（中介/买方/卖方三方）→ 签后即付定金；此时违约定金罚则锁定 */
  const h = S.house!;
  const blocks: SceneBlock[] = [
    { t: "title", text: "签约 · 居间协议" },
    { t: "sub", text: h.name + " · 卖方 " + h.seller + " · 成交价 " + fmt(S.deal) + " 万" + (S.netTax ? "（到手价）" : "") },
    {
      t: "banner",
      cls: "sky",
      title: "📄 房地产买卖居间协议",
      desc: "三方签署：中介公司（居间方）/ 你（买方）/ " + h.seller + "（卖方）· 中介费 " + pct(S.agentRate) + "（" + fmtY(S.agentFee) + "）已言明 · 协议签定即付定金",
    },
  ];
  const rows: RowItem[] = [
    { k: "成交价", v: fmtY(S.deal) },
    { k: "中介费（" + pct(S.agentRate) + "）", v: fmtY(S.agentFee) },
    { k: "定金（5%）", v: fmtY(S.deposit) },
    { k: "买方现金（现有）", v: fmtY(S.cash) },
    { k: "签约后余额", v: fmtY(S.cash - S.deposit) },
  ];
  blocks.push(
    { t: "rows", items: rows },
    {
      t: "banner",
      cls: "warm",
      title: "⚠️ 定金罚则 · 此刻已锁定",
      desc: "定金 " + fmtY(S.deposit) + "（成交价 5%，不超合同价 20%）。一旦签字付定：买方违约，定金不予退还；卖方违约，双倍返还（" + fmtY(S.deposit * 2) + "）。这笔钱不是押金，是合同约束。",
    },
    {
      t: "note",
      bold: "签字前，先查产调：",
      text: "让中介出示《不动产权属查询》（产调）：确认无抵押、无查封、无居住权登记、无未到期长期租约；夫妻共有房须所有产权人到场签字。产权有问题，先解押或换房——一签一付，主动权就交了。",
    },
    { t: "cta", items: [{ action: "signOk", title: "确认签署居间协议 · 付定金 " + fmt(S.deposit) + " 万", cls: "btn-ink" }] },
  );
  return blocks;
}

/** 网签 · 买卖合同屏（违约金 20% 警示 + 同步支付首付先付部分并办理贷款）. */
export function sceneSignNet(S: SimState): SceneBlock[] {
  /* ② 网签合同（上海市房地产买卖合同）→ 签约后违约赔付房价 20%，不再是定金的事；
     网签同步支付首付（先付部分，入资金监管）并办理贷款 */
  const h = S.house!;
  const liquidated = S.deal * 0.2;
  const firstPay = firstPayFor(S);
  const restPay = S.downRate >= 1 ? 0 : Math.max(0, S.down - S.deposit - firstPay);
  const blocks: SceneBlock[] = [
    { t: "title", text: "网签 · 上海市房地产买卖合同" },
    { t: "sub", text: h.name + " · 卖方 " + h.seller + " · 合同价 " + fmt(S.deal) + " 万" + (S.netTax ? "（到手价）" : "") + " · 网签同步支付首付并办理贷款" },
    {
      t: "banner",
      cls: "warm",
      title: "⚠️ 违约责任：房价 20%",
      desc: "网签备案后合同生效：买方违约，按房价 20%（" + fmtY(liquidated) + "）赔付违约金——已经不再是「定金没了」那么简单，悔约代价由此放大。",
    },
    {
      t: "banner",
      cls: "sky",
      title: "📄 上海市房地产买卖合同 · 网签备案",
      desc: "合同价锁定（" + fmtY(S.deal) + "），经「一网通办」完成 · 反悔属违约。网签当日同步：支付首付（先付部分入资金监管）并向银行申请贷款。",
    },
  ];
  if (S.netTax) {
    blocks.push({
      t: "banner",
      cls: "warm",
      title: "⚠️ 合同第 1 条：成交价 = 卖方到手价",
      desc: "合同价格条款写明「" + fmt(S.deal) + " 万为卖方到手价，相关税费由买方承担」——卖方增值税/个税约 " + fmt(S.netTax) + " 万已锁定给你。现在反悔就是违约。网签前这是最后一次看清它。",
    });
  }
  const rows: RowItem[] = [
    { k: "成交价（合同价）", v: fmtY(S.deal) },
    { k: "定金（签约已付）", v: fmtY(S.deposit) },
    { k: "首付先付（网签同步支付 · 入资金监管）", v: fmtY(firstPay) },
    ...(S.downRate >= 1
      ? [{ k: "剩余房款", v: "已随首付先付一次结清（全款）" }]
      : [{ k: "贷款合同后补足（剩余首付）", v: fmtY(restPay) }]),
    { k: "违约责任（房价 20%）", v: fmtY(liquidated) },
  ];
  const okRows: RowItem[] = [];
  if (S.netTax) {
    okRows.push({ k: "卖方税费（到手价转嫁）", v: fmtY(S.netTax) });
  }
  blocks.push(
    { t: "rows", items: okRows.concat(rows) },
    { t: "cta", items: [{ action: "signNetOk", title: "确认网签 · 支付首付先付部分", cls: "btn-ink" }] },
  );
  return blocks;
}