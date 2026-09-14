/**
 * 购房模拟器 · 场景分组「贷款方案 · 审批风控」.
 *
 * 覆盖 2 屏：贷款方案（全款分支 + 三方式月供）/ 贷款审批（通过 / 风控拦截）。
 * 文案逐条移植自 docs/design/购房模拟器-hifi.html（PRD §7 沉浸式第一人称）。
 * 纯函数，仅依赖 SimState 与 calc/constants 工具。
 */

import { firstPayFor, fmt, fmtY, fmtYuan, pct } from "./calc";
import { INCOME, LOAN_TYPES, SimState } from "./constants";
import { bubble, OptItem, pmtY, RowItem, SceneBlock } from "./scenes-common";

/** 贷款方案屏（全款 / 商贷 / 组合贷 / 纯公积金）. */
export function sceneLoan(S: SimState): SceneBlock[] {
  /* 全款（首付 100%）：无贷款、无银行审批，直接进资金监管 */
  if (S.downRate >= 1) {
    const h = S.house!;
    return [
      { t: "title", text: "已全款支付" },
      { t: "sub", text: h.name + " · " + fmt(S.deal) + " 万 全额现金支付 · 无需向银行申请贷款" },
      {
        t: "rows",
        items: [
          { k: "成交价", v: fmtY(S.deal) },
          { k: "定金（已付）", v: fmtY(S.deposit) },
          { k: "首付 + 尾款（全款）", v: fmtY(S.down), total: true },
        ],
      },
      { t: "banner", cls: "sky", large: true, title: "💰 全款 · 无贷款", desc: "全部房款以现金结清，跳过贷款申请与银行审批；直接进入过户递交材料。" },
      {
        t: "note",
        bold: "全款优势：",
        text: "无月供、无利息、无征信审批；只要现金充足，这一步就结束了贷款的烦恼。",
      },
      { t: "cta", items: [{ action: "loanOkAllCash", title: "确认全款 · 递交过户", cls: "btn-ink" }] },
    ];
  }
  const L = S.loan;
  const y = S.loanYears;
  const gjjPct = pct(S.gjjRate);
  const commPct = pct(S.commRate);
  const rateLine =
    S.loanType === "comm"
      ? "商贷 " + commPct
      : S.loanType === "gjj"
        ? "公积金 " + gjjPct
        : "公积金 " + gjjPct + " + 商贷 " + commPct;
  const rows: RowItem[] = [];
  if (S.loanType === "comm") {
    rows.push({ k: "商贷（" + fmt(L.comm) + " 万 · " + commPct + "）", v: pmtY(L.comm, S.commRate, y) });
  } else if (S.loanType === "gjj") {
    rows.push({ k: "公积金（" + fmt(L.gjj) + " 万 · " + gjjPct + "）", v: pmtY(L.gjj, S.gjjRate, y) });
  } else {
    rows.push(
      { k: "公积金（" + fmt(L.gjj) + " 万 · " + gjjPct + "）", v: pmtY(L.gjj, S.gjjRate, y) },
      { k: "商贷（" + fmt(L.comm) + " 万 · " + commPct + "）", v: pmtY(L.comm, S.commRate, y) },
    );
  }
  rows.push(
    { k: "月供合计", v: fmtYuan(L.monthly) + " 元/月" },
    { k: "月供 / 家庭月收入", v: Math.round((L.monthly / INCOME) * 100) + "%（风控线 50%）" },
    { k: "总利息（" + y + " 年）", v: "¥" + fmt(L.totalInt) + "万" },
  );
  const blocks: SceneBlock[] = [
    { t: "title", text: "贷款方案" },
    {
      t: "sub",
      text: "贷款额 = 成交价 − 房款首付（" + fmt(S.deal - S.down) + " 万）· " + LOAN_TYPES[S.loanType].name + " · " + (S.role!.k === "invest" ? "二套利率" : "首套利率") + "（" + rateLine + "）· 等额本息。",
    },
    {
      t: "chat",
      items: [
        bubble("信贷经理 高经理", "材料收到。按你" + (S.role!.k === "invest" ? "（二套）" : "（" + S.role!.name + "）") + "的资质，" + rateLine + " 送审——月供别超过你们家庭月收入一半，不然风控过不了。"),
      ],
    },
    { t: "rows", items: rows },
  ];
  if (S.gjjTopUp) {
    blocks.push({ t: "note", bold: "公积金额度：", text: "本演示额度上限 80 万，不足部分 " + fmt(S.gjjTopUp) + " 万已并入首付（见算账页）。" });
  }
  blocks.push({
    t: "banner",
    cls: "warm",
    title: "🏦 贷款合同 · 向银行申请",
    desc: "且慢：贷款要由银行审批。需提供身份证 / 收入流水 / 征信授权 / 网签合同；月供超过家庭月收入一半会被拒批，利率可能上浮。审批通过、正式签约贷款合同前，一切只是申请，银行有权拒贷。",
  });
  blocks.push({
    t: "banner",
    cls: "sky",
    large: true,
    title: fmtYuan(L.monthly) + " 元 / 月",
    desc: "月供不宜超过家庭月收入一半（2026 参考口径）。贷款 ≥500 万且成数 ≥5 成或属风险类客户，利率可能上浮；送审后银行会复核。",
  });
  blocks.push(
    {
      t: "form-years",
      items: [10, 20, 30].map((v) => ({ action: "ly:" + v, label: v + "年", active: v === y })),
    },
    { t: "cta", items: [{ action: "loanOk", title: "方案 OK，送银行审批", cls: "btn-ink" }] },
  );
  return blocks;
}

/** 贷款审批屏（通过 / 风控拦截两种终态）. */
export function sceneLoanChk(S: SimState): SceneBlock[] {
  const L = S.loan;
  const compLine =
    S.loanType === "comm"
      ? "商贷 " + fmt(L.comm) + " 万 @" + pct(S.commRate)
      : S.loanType === "gjj"
        ? "公积金 " + fmt(L.gjj) + " 万 @" + pct(S.gjjRate)
        : "公积金 " + fmt(L.gjj) + " 万 @" + pct(S.gjjRate) + " + 商贷 " + fmt(L.comm) + " 万 @" + pct(S.commRate);
  const ok = L.monthly <= INCOME * 0.5;
  if (ok) {
    return [
      { t: "title", text: "贷款审批 · 通过" },
      {
        t: "chat",
        items: [
          bubble("信贷经理 高经理", "流水和征信都核过了：月供 " + fmtYuan(L.monthly) + " 元，约占家庭月收入 " + Math.round((L.monthly / INCOME) * 100) + "%，在风控线（50%）以内。批贷函这就出。"),
        ],
      },
      {
        t: "banner",
        cls: "sky",
        title: "🏦 批贷函 · " + LOAN_TYPES[S.loanType].name + " · " + S.loanYears + " 年",
        desc: compLine + " · 等额本息 · 月供 " + fmtYuan(L.monthly) + " 元 / 月",
      },
      { t: "note", bold: "贷款材料：", text: "身份证 · 收入流水 · 征信授权 · 网签合同。审批约需 7 天：送审后银行核征信、流水、面签，出批贷函即通过。" },
      { t: "cta", items: [{ action: "lcOk", title: "批贷通过 · 签贷款合同", cls: "btn-ink" }] },
    ];
  }
  /* 超线：风控拦截 */
  const f = L.monthly / (S.deal - S.down);
  const needPay = Math.max(10000, Math.ceil((L.monthly - INCOME * 0.5) / f / 10000) * 10000);
  // 风控要求补充的首付按整万元向上计（银行惯例），非金额精度损失
  const yW = fmt(needPay);
  /* 追加首付可行性：定金已在签约屏付讫、首付先付已在网签屏付讫，
     此后尚待支付的现金 = 需现金 − 已付定金 − 已付首付先付（首付剩余 + 买方税费 + 到手价转嫁的卖方税费），
     与实际扣款口径一致（网签扣 firstPay、贷款合同扣 restPay、领证缴税扣 taxes+netTax）；
     漏掉 netTax 会低估待付额、放行付不起的追加首付。 */
  const avail = S.cash - (S.need - S.deposit - S.firstPay);
  const opts: OptItem[] = [];
  if (S.loanYears < 30) {
    opts.push({ action: "lcLong", title: "拉长还款到 30 年", desc: "月供立刻降档，但总利息更多。", marker: "→ 30年" });
  }
  const blocks: SceneBlock[] = [
    { t: "title", text: "贷款审批 · 风控拦截" },
    {
      t: "chat",
      items: [
        bubble("信贷经理 高经理", "月供 " + fmtYuan(L.monthly) + " 元，超过你们家庭月收入的一半（" + fmtYuan(INCOME * 0.5) + " 元）。按银行风控，要么降月供、要么加首付，否则批不了。"),
      ],
    },
    {
      t: "banner",
      cls: "warm",
      title: "⚠️ 月供占收入 " + Math.round((L.monthly / INCOME) * 100) + "%（风控线 50%）",
      desc: "当前方案 " + S.loanYears + " 年 · 月供 " + fmtYuan(L.monthly) + " 元。需调整后重新送审。",
    },
  ];
  if (avail >= needPay) {
    opts.push({ action: "lcPay", title: "追加首付 " + yW + " 万", desc: "把月供压回收入一半以内，现金够付。", marker: "-" + yW + "万" });
  } else {
    blocks.push({ t: "note", text: "追加首付需约 " + yW + " 万，当前现金不足——只能拉长年限或换房。" });
  }
  opts.push(
    { action: "lcStick", title: "坚持原方案硬上", desc: "银行直接拒批，徒增压力。", marker: "❌ 拒批" },
    { action: "lcChange", title: "换套便宜点的", desc: "回到选房，总价低、月供自然低。" },
  );
  blocks.push({ t: "opts", items: opts });
  return blocks;
}

/** 贷款合同确认屏：批贷合同签字 + 补足剩余首付. */
export function sceneLoanContract(S: SimState): SceneBlock[] {
  const L = S.loan;
  const firstPay = S.firstPay > 0 ? S.firstPay : firstPayFor(S);
  const restPay = Math.max(0, S.down - S.deposit - firstPay);
  const compLine =
    S.loanType === "comm"
      ? "商贷 " + fmt(L.comm) + " 万 @" + pct(S.commRate)
      : S.loanType === "gjj"
        ? "公积金 " + fmt(L.gjj) + " 万 @" + pct(S.gjjRate)
        : "公积金 " + fmt(L.gjj) + " 万 @" + pct(S.gjjRate) + " + 商贷 " + fmt(L.comm) + " 万 @" + pct(S.commRate);
  return [
    { t: "title", text: "贷款合同 · 确认" },
    {
      t: "sub",
      text:
        "批贷合同确认金额与月供。网签时已付首付先付部分 " + fmt(firstPay) + " 万（定金 " + fmt(S.deposit) + " 万已含其中），剩余首付 " + fmt(restPay) + " 万现在补足入资金监管。",
    },
    {
      t: "chat",
      items: [
        bubble("信贷经理 高经理", "合同条款和金额都确认无误的话，签字生效。放款以新产证到手为前提：过户缴税领证后，把产证拍照发我，当天放款到卖方。"),
      ],
    },
    {
      t: "rows",
      items: [
        { k: "贷款金额（" + LOAN_TYPES[S.loanType].name + " · " + S.loanYears + " 年）", v: fmtY(L.gjj + L.comm) },
        { k: compLine, v: "等额本息" },
        { k: "月供", v: fmtYuan(L.monthly) + " 元/月" },
        { k: "首付（定金 + 网签先付）", v: fmtY(S.deposit + firstPay) },
        { k: "本次补足剩余首付（入资金监管）", v: fmtY(restPay), total: true },
      ],
    },
    {
      t: "banner",
      cls: "sky",
      title: "🔒 资金监管",
      desc: "首付不直接打给卖家，先存入监管账户，过户领证后划转卖方；过户遇阻，监管资金原路退回，双方都踏实。",
    },
    {
      t: "banner",
      cls: "warm",
      title: "⚠️ 贷款金额不及预期？",
      desc: "银行按「评估价」（常低于成交价，如按 95% 计）批贷：贷款额核减时，差额须以现金补足。这笔备用金在签约前的《居间协议核对清单》里就谈好了最晚补足时间——合同金额与批贷金额不一致时，按约定期限补足，否则构成违约。",
    },
    {
      t: "opts",
      items: [
        {
          action: "lcContractOk",
          title: "确认贷款合同 · 补足剩余首付",
          desc: "支付剩余首付 " + fmt(restPay) + " 万入监管，随后递交过户材料。",
          marker: "-" + fmt(restPay) + "万",
        },
      ],
    },
    { t: "note", bold: "放款条件：", text: "过户缴税领证后，将新产证拍照发给银行，银行确认后放款至卖方账户。" },
  ];
}