/**
 * 购房模拟器 · 事件分发「流程阶段：砍价 / 中介费 / 贷款方式 / 算账 / 筹钱 / 签约 /
 * 贷款（风控）/ 监管 / 过户 / 领证 / 交房 / 账单」.
 *
 * 从 index.ts 的 handle() 拆出（对应 HiFi handle 流程分支），由 handlers.ts 在
 * 前置阶段未命中时调用。全部分支就地修改 SimState，并通过 HandlerCtx 回调页面
 * （toast/nextScene/弹层/风险确认），与前置阶段保持同一套 action 语义。
 */

import { derive, findN2Option, fmt, iloan, NEGO_R1, recalcNeed, setOffer } from "./calc";
import { downRateFor, INCOME, LOAN_TYPES, SimState } from "./constants";
import type { LoanTypeKey } from "./constants";
import type { HandlerCtx } from "./handlers";

/** 轻提示. */
function toast(title: string): void {
  wx.showToast({ title, icon: "none" });
}

/** 后续流程阶段分发（前置阶段未命中后调用）. */
export function handleFlow(ctx: HandlerCtx, S: SimState, action: string): void {
  /* 砍价 */
  if (action.indexOf("n1:") === 0) {
    S.negoR1 = action.split(":")[1] as "hard" | "soft" | "chat";
    S.negoR2 = null; /* 重新进入第二轮 */
    const o1 = NEGO_R1[S.negoR1];
    S.stress += o1.stress;
    S.seller = Math.max(5, Math.min(100, S.seller + o1.mood));
    setOffer(S, o1.chip); /* 越线即刻记录，第二轮选项据此生成 */
    ctx.nextScene("nego2");
    return;
  }
  if (action.indexOf("n2:") === 0) {
    S.negoR2 = action.split(":")[1];
    const o2 = findN2Option(S, S.negoR2);
    if (!o2) {
      return;
    }
    S.stress += o2.stress;
    S.seller = Math.max(5, Math.min(100, S.seller + o2.mood));
    setOffer(S, o2.chip);
    ctx.nextScene("nego3");
    return;
  }
  if (action === "negoOk") {
    toast("🤝 口头成交 " + fmt(S.deal) + " 万，先谈中介费");
    ctx.nextScene("feeNego");
    return;
  }
  /* 叫停补救：接受底价 / 换房（房东已亮明底线，买家不再有“加价”空间） */
  if (action === "negoAccept") {
    S.negoCap = false;
    S.seller = Math.min(100, S.seller + 10);
    toast("🤝 按底价 " + fmt(S.deal) + " 万成交");
    ctx.nextScene("nego3"); /* 回成交页，走「到手价」确认 */
    return;
  }
  if (action === "negoQuit") {
    ctx.nextScene("select");
    return;
  }

  /* —— 成交后的「到手价」暗坑选择 —— */
  /* 同意「到手价」（含解释弹层内的确认）→ 一律转入税费风险强制确认，勾选确认后才落定 */
  if (action === "n3NetYes" || action === "netYes2") {
    ctx.openTaxModal();
    return;
  }
  if (action === "n3NetAsk") {
    ctx.openNetModal();
    return;
  }
  if (action === "n3NetNo") {
    S.netDeal = false;
    derive(S);
    toast("👍 按含税价成交，卖方税费房东自担");
    ctx.nextScene("feeNego");
    return;
  }
  if (action === "taxCheck") {
    ctx.setData({ "modal.checked": !ctx.data.modal.checked });
    return;
  }
  if (action === "taxRiskOk") {
    if (!ctx.data.modal.checked) {
      toast("请先勾选「我已阅读并清楚上述税费由我承担」");
      return;
    }
    const parts: string[] = [];
    if (S.vat) {
      parts.push("增值税 " + fmt(S.vat) + " 万");
    }
    if (S.vatAdd) {
      parts.push("附加 " + fmt(S.vatAdd) + " 万");
    }
    if (S.sellerTax) {
      parts.push("个税 " + fmt(S.sellerTax) + " 万");
    }
    ctx.confirmRisk(
      "netTax",
      "同意按「到手价」成交（" + fmt(S.deal) + " 万），卖方税费转嫁买方：" + parts.join("、") + "，合计约 " + fmt(S.vat + S.vatAdd + S.sellerTax) + " 万。"
    );
    ctx.closeModal();
    S.netDeal = true;
    derive(S);
    toast("🤝 到手价成交——卖方税费将转嫁给你");
    ctx.nextScene("feeNego");
    return;
  }
  if (action === "netNo2") {
    ctx.closeModal();
    S.netDeal = false;
    derive(S);
    toast("👍 按含税价成交，卖方税费房东自担");
    ctx.nextScene("feeNego");
    return;
  }

  /* 中介费协商（1%–2%，谈成 1%）→ 选贷款方式 */
  if (action === "fee2") {
    S.agentRate = 0.02;
    derive(S);
    ctx.nextScene("loanType");
    return;
  }
  if (action === "fee1") {
    S.agentRate = 0.01;
    S.stress += 3;
    derive(S);
    toast("🤝 中介费谈成 1%：" + fmt(S.agentFee) + " 万");
    ctx.nextScene("loanType");
    return;
  }

  /* 贷款方式选择（纯商贷 / 组合贷 / 纯公积金） */
  if (action === "ltOk") {
    ctx.nextScene("funds");
    return;
  }
  if (action.indexOf("lt:") === 0) {
    S.loanType = action.split(":")[1] as LoanTypeKey;
    derive(S);
    toast("🏦 贷款方式：" + LOAN_TYPES[S.loanType].name + " · 最低首付 " + (downRateFor(S.role!.k, S.house!.ring, S.loanType) * 100).toFixed(0) + "%");
    ctx.nextScene("loanType");
    return;
  }
  /* 首付档位：0=最低 / 0.3 / 0.5 / 1=全款不贷款（重新进 funds 前均停留在本屏确认） */
  if (action.indexOf("ds:") === 0) {
    S.downSel = parseFloat(action.split(":")[1]) || 0;
    derive(S);
    toast(S.downRate >= 1 ? "💰 已选全款 · 无需贷款" : "首付已调整至 " + (S.downRate * 100).toFixed(0) + "%");
    ctx.nextScene("loanType");
    return;
  }

  /* 借款 */
  if (action === "bor:family") {
    const gapF = S.need - S.cash;
    if (gapF > 0) {
      const addF = Math.min(300000, gapF);
      S.cash += addF;
      S.borrowed += addF;
      S.usedBorrow.family = true;
      S.stress += 10;
    }
    ctx.nextScene("borrow");
    return;
  }
  if (action === "bor:gjj") {
    const gapG = S.need - S.cash;
    if (gapG > 0) {
      const addG = Math.min(200000, gapG);
      S.cash += addG;
      S.borrowed += addG;
      S.usedBorrow.gjj = true;
      S.stress += 15;
    }
    ctx.nextScene("borrow");
    return;
  }
  if (action === "bor:credit") {
    ctx.openCreditModal();
    return;
  }
  if (action === "creditYes") {
    ctx.closeModal();
    const gapC = S.need - S.cash;
    if (gapC > 0) {
      const addC = Math.min(200000, gapC);
      S.cash += addC;
      S.borrowed += addC;
    }
    S.usedBorrow.credit = true;
    S.stress += 35;
    ctx.nextScene("borrow");
    return;
  }
  if (action === "creditNo") {
    ctx.closeModal();
    return;
  }

  if (action === "sign" || action === "borrow") {
    ctx.nextScene(action);
    return;
  }
  if (action === "signOk") {
    /* 居间协议签署前：强制确认定金罚则，确认后才付定金 */
    ctx.openDepositModal();
    return;
  }
  if (action === "signNetOk") {
    /* 网签前：强制确认违约金 20%，确认后才完成网签 */
    ctx.openNetSignModal();
    return;
  }
  if (action === "signCancel") {
    /* 暂不签约：关闭弹层停留在当前签约屏，可重新决策 */
    ctx.closeModal();
    return;
  }
  if (action === "breachOk") {
    if (ctx.data.modal.stage === "deposit") {
      /* 居间协议：确认定金罚则后才真实付定金、进网签 */
      ctx.confirmRisk(
        "deposit",
        "签署《房地产买卖居间协议》并支付定金 " + fmt(S.deposit) + " 万。买方违约：定金不予返还；卖方违约：双倍返还。"
      );
      ctx.closeModal();
      S.cash -= S.deposit;
      toast("🤝 居间协议已签 · 定金 " + fmt(S.deposit) + " 万已支付");
      ctx.nextScene("signNet");
    } else {
      /* 网签：确认违约金 20% 后才视为完成备案、进入贷款 */
      const liquidated = S.deal * 0.2;
      ctx.confirmRisk(
        "liquidated",
        "网签备案生效（合同价 " + fmt(S.deal) + " 万）。买方超过约定节点违约：按合同总价 20% 赔付违约金约 " + fmt(liquidated) + " 万，与定金罚则就高主张，并承担诉讼/律师费及征信、失信记录等法律后果。"
      );
      ctx.closeModal();
      toast("✅ 网签备案完成 · 上海市房地产买卖合同已生效");
      ctx.nextScene("loan");
    }
    return;
  }
  if (action.indexOf("ly:") === 0) {
    S.loanYears = parseInt(action.split(":")[1], 10);
    iloan(S);
    ctx.nextScene("loan");
    return;
  }
  if (action === "loanOk") {
    ctx.nextScene("loanChk");
    return;
  }
  if (action === "loanOkAllCash") {
    toast("💰 全款支付 · 跳过贷款审批");
    ctx.nextScene("escrow");
    return;
  }

  /* 贷款审批（风控）分支 */
  if (action === "lcOk") {
    toast("🏦 批贷函已出 · 贷款审批通过");
    ctx.nextScene("escrow");
    return;
  }
  if (action === "lcLong") {
    S.loanYears = 30;
    iloan(S);
    ctx.nextScene("loanChk");
    return;
  }
  if (action === "lcPay") {
    const Lp = S.loan;
    const fp = Lp.monthly / (S.deal - S.down);
    const addP = Math.max(10000, Math.ceil((Lp.monthly - INCOME * 0.5) / fp / 10000) * 10000);
    // 追加首付按整万元向上补齐（银行风控惯例），非金额精度损失
    S.down += addP; /* 追加首付并入首付，过户前随监管一起扣 */
    recalcNeed(S); /* 首付已变，需现金必须同口径重算（HUD 现金警示据此判定） */
    S.stress += 8;
    iloan(S);
    toast("💰 追加首付 " + fmt(addP) + " 万，重新送审");
    ctx.nextScene("loanChk");
    return;
  }
  if (action === "lcStick") {
    S.stress += 20;
    toast("❌ 银行拒批：月供超收入一半");
    ctx.nextScene("loan");
    return;
  }
  if (action === "lcChange") {
    ctx.nextScene("select");
    return;
  }

  if (action === "escrowOk") {
    S.cash -= S.down - S.deposit; /* 定金已付，冲抵首付 */
    toast("🔒 首付已入资金监管账户");
    ctx.nextScene("transfer");
    return;
  }
  if (action === "trOk") {
    S.cash -= S.taxes + S.netTax; /* 到手价转嫁税费随过户一并缴纳 */
    toast("📄 过户完成 · 一网通办出证");
    ctx.nextScene("deed");
    return;
  }
  if (action === "deedOk") {
    toast("🏦 放款完成 · 尾款已划转卖方");
    ctx.nextScene("handover");
    return;
  }

  /* 交房交割 */
  if (action === "hoOk") {
    toast("🔑 交房完成，恭喜新房东");
    ctx.nextScene("final");
    return;
  }
  if (action === "hoHold") {
    S.holdback = Math.round(S.deal * 0.01 * 100) / 100; /* 尾款扣押演示 1%，精确到分 */
    S.stress += 6;
    toast("🤝 尾款扣押 " + fmt(S.holdback) + " 万，迁出后结清");
    ctx.nextScene("final");
    return;
  }
}