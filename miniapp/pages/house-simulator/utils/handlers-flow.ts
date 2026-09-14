/**
 * 购房模拟器 · 事件分发「流程阶段：砍价 / 中介费 / 贷款方式 / 算账 / 筹钱 / 签约 /
 * 贷款（风控）/ 监管 / 过户 / 领证 / 交房 / 账单」.
 *
 * 从 index.ts 的 handle() 拆出（对应 HiFi handle 流程分支），由 handlers.ts 在
 * 前置阶段未命中时调用。全部分支就地修改 SimState，并通过 HandlerCtx 回调页面
 * （toast/nextScene/弹层/风险确认），与前置阶段保持同一套 action 语义。
 */

import { derive, findN2Option, firstPayFor, fmt, iloan, NEGO_R1, recalcNeed, setOffer } from "./calc";
import { downRateFor, INCOME, LOAN_TYPES, SimState } from "./constants";
import type { LoanTypeKey, SceneKey } from "./constants";
import type { HandlerCtx } from "./handlers";

/** 轻提示. */
function toast(title: string): void {
  wx.showToast({ title, icon: "none" });
}

/** 后续流程阶段分发（前置阶段未命中后调用）. */
export function handleFlow(ctx: HandlerCtx, S: SimState, action: string): void {
  /* 模拟日历「知道了」：关闭时间快进弹层 */
  if (action === "calOk") {
    ctx.closeModal();
    return;
  }

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
    toast("🤝 中介费按 2% 确认");
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

  /* 筹钱阶段换房：已借资金退还，恢复签约前原始现金（避免借款残留导致现金虚高） */
  if (action === "changeHouse") {
    if (S.borrowed > 0) {
      S.cash -= S.borrowed;
      S.borrowed = 0;
      S.usedBorrow = {};
    }
    ctx.nextScene("select");
    return;
  }

  /* 私人决策阶段返回：算账 ↔ 贷款方式（调整首付档位/贷款方式）、筹钱 ↔ 算账 */
  if (action === "loanType") {
    ctx.nextScene("loanType");
    return;
  }
  if (action === "funds") {
    ctx.nextScene("funds");
    return;
  }

  if (action === "sign" || action === "borrow") {
    /* 算账/筹钱阶段完成：均为私人决策当天空转，无时间预期，不弹模拟日历 */
    toast(
      (action === "borrow"
        ? "✅ 算账清楚，需要先筹钱"
        : S.scene === "borrow"
          ? "✅ 缺口已补齐"
          : "✅ 资金充足")
    );
    ctx.nextScene(action);
    return;
  }
  if (action === "signOk") {
    /* 签约即付定金：先弹出居间协议核对清单（8 处条款逐项勾选），全部核对确认后才进付款确认 */
    ctx.openAgreementModal();
    return;
  }
  /* 居间协议核对清单：勾选某一项 / 全部核对完成确认签署 / 退出核对（返回签约屏） */
  if (action.indexOf("agrCheck:") === 0) {
    const ag = ctx.data.modal.agreement;
    if (!ag) {
      return;
    }
    const n = parseInt(action.split(":")[1], 10);
    const checked = ag.checked.slice();
    if (n >= 0 && n < checked.length) {
      checked[n] = !checked[n];
    }
    ctx.setData({
      "modal.agreement.checked": checked,
      "modal.agreement.all": checked.every(Boolean),
    });
    return;
  }
  if (action === "agrOk") {
    const ag = ctx.data.modal.agreement;
    if (!ag || !ag.all) {
      toast("请先逐项核对并确认全部条款");
      return;
    }
    ctx.closeModal(); /* 核对完成：进入付款确认，确认后才真实扣定金 */
    ctx.openPayModal("deposit");
    return;
  }
  if (action === "agrCancel") {
    ctx.closeModal(); /* 暂不签署：退回居间协议屏 */
    return;
  }
  if (action === "signNetOk") {
    /* 网签备案生效：违约风险直接记录为交易凭证，随即支付首付先付部分（入资金监管）并办理贷款 */
    const liquidated = S.deal * 0.2;
    ctx.confirmRisk(
      "liquidated",
      "网签备案生效（合同价 " + fmt(S.deal) + " 万）。买方超过约定节点违约：按合同总价 20% 赔付违约金约 " + fmt(liquidated) + " 万，与定金罚则就高主张，并承担诉讼/律师费及征信、失信记录等法律后果。"
    );
    toast("✅ 网签备案完成 · 上海市房地产买卖合同已生效");
    ctx.openPayModal("firstPay");
    return;
  }
  if (action.indexOf("ly:") === 0) {
    S.loanYears = parseInt(action.split(":")[1], 10);
    iloan(S);
    ctx.nextScene("loan");
    return;
  }
  if (action === "loanOk") {
    /* 送银行审批：贷款审批约需 7 天，弹模拟日历快进到审批结果 */
    ctx.openCalModal("loanChk");
    ctx.nextScene("loanChk");
    return;
  }
  if (action === "loanOkAllCash") {
    toast("💰 全款支付 · 跳过贷款审批");
    ctx.openCalModal("transfer"); /* 全款无贷款环节：直接递交过户材料（收件收据/审税） */
    ctx.nextScene("transfer");
    return;
  }

  /* 贷款审批（风控）分支 */
  if (action === "lcOk") {
    toast("🏦 批贷函已出 · 贷款审批通过");
    ctx.nextScene("loanContract"); /* 审批通过 → 签贷款合同并补足剩余首付 */
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
    /* 换房（贷款被拒，交易中断）：退还已付定金/首付先付与已借资金，恢复签约前原始现金，
       否则换房后定金/首付先付被二次扣缴、借款残留，现金口径失真 */
    S.cash += S.deposit + S.firstPay; /* 定金 + 网签首付先付退回 */
    if (S.borrowed > 0) {
      S.cash -= S.borrowed; /* 借款退还 */
      S.borrowed = 0;
      S.usedBorrow = {};
    }
    S.firstPay = 0;
    S.holdback = 0;
    S.taxed = false;
    ctx.nextScene("select");
    return;
  }

  /* 贷款合同确认：补足剩余首付 */
  if (action === "lcContractOk") {
    const rest = Math.max(0, S.down - S.deposit - (S.firstPay > 0 ? S.firstPay : firstPayFor(S)));
    if (rest > 0) {
      /* 确认贷款合同 → 弹付款确认补足剩余首付（入资金监管） */
      ctx.openPayModal("restPay");
    } else {
      toast("🤝 贷款合同已签 · 首付已全部支付");
      ctx.nextScene("transfer"); /* 无剩余补足（20%/15% 档已付清）直接递交过户材料 */
    }
    return;
  }
  /* 过户递交材料完成：进入审税等待（约 7 天） */
  if (action === "trDone") {
    ctx.openCalModal("deed");
    ctx.nextScene("deed");
    return;
  }
  if (action === "trOk") {
    /* 缴税领证（deed 屏缴税前态）：先弹付款确认，确认后才一次性扣缴并出证 */
    ctx.openPayModal("transfer");
    return;
  }

  /* 付款确认弹层：确认后按用途真实扣款（定金 / 网签首付先付 / 补足剩余首付 / 缴税领证 / 扣押尾款），并关闭弹层 */
  if (action === "payCancel") {
    ctx.closeModal();
    return;
  }
  if (action === "payOk") {
    const kind = ctx.data.modal.pay?.kind;
    if (kind === "deposit") {
      ctx.confirmRisk(
        "deposit",
        "签署《房地产买卖居间协议》并支付定金 " + fmt(S.deposit) + " 万。买方违约：定金不予返还；卖方违约：双倍返还。"
      );
      ctx.closeModal();
      S.cash -= S.deposit;
      toast("🤝 居间协议已签 · 定金 " + fmt(S.deposit) + " 万已支付 · 余 " + fmt(S.cash) + " 万");
      ctx.nextScene("signNet");
    } else if (kind === "firstPay") {
      ctx.closeModal();
      S.firstPay = firstPayFor(S); /* 记录网签已付首付先付部分（入资金监管） */
      S.cash -= S.firstPay;
      toast("🔒 首付先付已入资金监管 · 随即办理贷款");
      ctx.nextScene("loan");
    } else if (kind === "restPay") {
      ctx.closeModal();
      S.cash -= S.down - S.deposit - S.firstPay; /* 贷款合同确认后补足剩余首付（入监管） */
      toast("🤝 贷款合同已签 · 剩余首付已入资金监管");
      ctx.nextScene("transfer"); /* 补足后递交过户材料 */
    } else if (kind === "transfer") {
      ctx.closeModal();
      S.cash -= S.taxes + S.netTax; /* 到手价转嫁税费随缴税一并缴纳 */
      S.taxed = true;
      toast("📄 税费已缴 · 新产证到手");
      ctx.nextScene("deed"); /* 回 deed 屏显示「领证 · 产证已交银行」态 */
    } else if (kind === "holdback") {
      if (S.cash < S.holdback) {
        toast("现金不足，无法支付扣押尾款");
        ctx.closeModal();
        return; /* 留在交割结算屏 */
      }
      ctx.closeModal();
      S.cash -= S.holdback;
      toast("💰 尾款已结清 · 交易两清");
      ctx.nextScene("final");
    }
    return;
  }

  if (action === "deedOk") {
    toast("🏦 放款完成 · 尾款已划转卖方");
    ctx.openCalModal("handover");
    ctx.nextScene("handover");
    return;
  }

  /* 交房交割 */
  if (action === "hoOk") {
    toast("🔑 交房完成 · 交割核验通过");
    ctx.nextScene("settle"); /* 交割结算 · 支付尾款 */
    return;
  }
  if (action === "hoHold") {
    const hold = Math.round(S.deal * 0.01 * 100) / 100; /* 尾款扣押演示 1%，精确到分 */
    if (S.cash < hold) {
      toast("现金不足（尾款扣押需 " + fmt(hold) + " 万），建议直接结清交房");
      return; /* 留在交房屏，可改选「逐项核对，全部结清」 */
    }
    S.holdback = hold;
    S.stress += 6;
    toast("🤝 尾款扣押 " + fmt(S.holdback) + " 万，迁出后结清");
    ctx.nextScene("settle"); /* 交割结算 · 支付扣押尾款 */
    return;
  }

  /* 交割结算：支付扣押尾款（如有）→ 总账单 */
  if (action === "stOk") {
    if (S.holdback > 0) {
      ctx.openPayModal("holdback");
    } else {
      toast("🎉 交易全部完成");
      ctx.nextScene("final");
    }
    return;
  }

  /* 交易完成 → 装修决策与装修流程推进 */
  if (action === "renovGo") {
    if (S.renovDone) {
      return; /* 装修流程已结束（装完或跳过），忽略重复入口 */
    }
    toast("🏗️ 开始装修");
    ctx.nextScene("renovDesign"); /* final 屏已做装修决策，直接进入设计，不再二次询问 */
    return;
  }
  if (action === "renovSkip") {
    S.renovDone = true;
    S.renovSkipped = true;
    toast("🏡 直接入住 · 日后有需要再装");
    ctx.nextScene("final");
    return;
  }
  if (action.indexOf("renovNext:") === 0) {
    /* 装修阶段推进：施工阶段带日历快进工期；无等待（同天）时 openCalModal 自动跳过 */
    const to = action.split(":")[1] as SceneKey;
    ctx.openCalModal(to);
    ctx.nextScene(to);
    return;
  }
  if (action === "renovFinish") {
    S.renovDone = true;
    S.renovSkipped = false;
    toast("🏡 装修完成 · 乔迁大吉");
    ctx.nextScene("final");
    return;
  }
}