/**
 * 购房模拟器 · 事件分发「流程阶段：砍价 / 中介费 / 贷款方式 / 算账 / 筹钱 / 签约 / 网签 /
 * 贷款方案 · 审批 · 贷款合同 / 过户 / 缴税领证 / 交房 / 交割结算」.
 *
 * 由 handlers.ts 在前置阶段未命中时调用。全部分支就地修改 SimState，并通过 HandlerCtx
 * 回调页面（toast / nextScene / 付款确认弹窗 / 风险确认），与前置阶段同一套 action 语义。
 *
 * ⚠️ 与设计稿的两处有意差异（评审稿为快速演示，实现里不能留流程洞）：
 *  - 「都不写，先签（最快）」只把本屏 6 项标成「先不写」，仍由主按钮付定金 / 首付先付推进
 *    （评审稿直接 advance，会跳过付款确认）；
 *  - 「追加首付」在审批屏就地提档：提档后若现金仍不够则回退并提示改走拉长年限 / 换房
 *    （评审稿跳回算账屏，会重走一遍签约与网签）。
 */

import {
  derive, findN2Option, fmt, gap, houseOf, iloan, minDownToClear, NEGO_R1, payAmount, round2,
} from "./calc";
import { BORROW_CAPS, PAY_KINDS, SCREENS, screenIdx, SIGN_ITEMS } from "./flow";
import type { PayKind } from "./flow";
import { LOAN_TYPES } from "./constants";
import type { LoanTypeKey, SimState } from "./constants";
import type { HandlerCtx } from "./handlers";
import { toSelect } from "./handlers-setup";

/** 轻提示. */
function toast(title: string): void {
  wx.showToast({ title, icon: "none" });
}

/** 按购房 24 屏顺序推进到下一屏. */
function advance(ctx: HandlerCtx, S: SimState): void {
  const i = screenIdx(S.scene);
  if (i < 0 || i >= SCREENS.length - 1) {
    return;
  }
  ctx.nextScene(SCREENS[i + 1].k);
}

/** 按 key 找渠道上限（万元 → 元）. */
function channelCap(k: string): number {
  return (BORROW_CAPS[k] ?? 0) * 10000;
}

/** 后续流程阶段分发（前置阶段未命中后调用）. */
export function handleFlow(ctx: HandlerCtx, S: SimState, action: string): void {
  /* 主按钮：按流程顺序推进（选房屏选定房源后直奔资格核验） */
  if (action === "next") {
    if (S.scene === "select" && S.house) {
      ctx.nextScene("qa");
      return;
    }
    advance(ctx, S);
    return;
  }
  if (action === "fundsNext") {
    ctx.nextScene(gap(S) > 0 ? "borrow" : "sign");
    return;
  }

  /* ── 砍价：出价即行动，一屏只做一次决定 ── */
  if (action.indexOf("n1:") === 0) {
    const k = action.split(":")[1] as "hard" | "soft" | "chat";
    const h = houseOf(S)!;
    const chip = NEGO_R1[k].chip;
    S.negoR1 = k;
    S.negoR2 = null;
    S.negoCap = chip > h.negotiable;
    /* 越线时成交价立刻封顶房东底线价：叫停屏要显示这个数（否则还停在 0） */
    S.slash = Math.min(h.negotiable, chip);
    derive(S);
    ctx.nextScene("nego2");
    return;
  }
  if (action.indexOf("n2:") === 0) {
    const o = findN2Option(S, action.split(":")[1]);
    if (!o) {
      return;
    }
    S.negoR2 = o.k;
    S.negoCap = false;
    S.slash = o.slash;
    derive(S);
    ctx.nextScene("nego3");
    return;
  }
  if (action === "n2Accept") {
    S.negoCap = false;
    derive(S);
    ctx.nextScene("nego3");
    return;
  }

  /* ── 成交后的「到手价」：先问一句「含税还是到手」 ── */
  if (action === "net:yes") {
    S.netDeal = true;
    derive(S);
    ctx.confirmRisk(
      "netTax",
      "同意按「到手价」成交（" + fmt(S.deal) + " 万）：卖方增值税 / 附加 / 个税合计约 " + fmt(S.netTax) + " 万转嫁买方，签约时写进合同即已锁定。"
    );
    toast("🤝 到手价成交——卖方税费 " + fmt(S.netTax) + " 万将转嫁给你");
    ctx.nextScene("feeNego");
    return;
  }
  if (action === "net:ask" || action === "net:no") {
    S.netDeal = false;
    derive(S);
    if (action === "net:no") {
      toast("👍 按含税价成交，卖方税费房东自担");
    } else {
      toast("先问清了：含税价与到手价差的正是卖方税费");
    }
    ctx.nextScene("feeNego");
    return;
  }

  /* ── 中介费：1% 足够覆盖主流服务 ── */
  if (action.indexOf("fee:") === 0) {
    const rate = parseFloat(action.split(":")[1]);
    S.agentRate = rate;
    derive(S);
    toast("🤝 中介费按 " + (rate * 100).toFixed(0) + "% 确认：" + fmt(S.agentFee) + " 万");
    ctx.nextScene("loanType");
    return;
  }

  /* ─ 贷款方式与首付档位（停留本屏确认） ── */
  if (action.indexOf("lt:") === 0) {
    S.loanType = action.split(":")[1] as LoanTypeKey;
    S.loanRejected = false;
    derive(S);
    toast("🏦 贷款方式：" + LOAN_TYPES[S.loanType].name);
    ctx.render();
    return;
  }
  if (action.indexOf("ds:") === 0) {
    S.downSel = parseFloat(action.split(":")[1]) || 0;
    S.loanRejected = false;
    derive(S);
    toast(S.downRate >= 1 ? "💰 已选全款 · 无需贷款" : "首付已调整至 " + (S.downRate * 100).toFixed(0) + "%");
    ctx.render();
    return;
  }
  if (action.indexOf("ly:") === 0) {
    S.loanYears = parseInt(action.split(":")[1], 10);
    iloan(S);
    ctx.render();
    return;
  }

  /* ── 筹钱：三条渠道各有上限，已筹只补到缺口为止；再点一次退回该渠道 ── */
  if (action.indexOf("bor:") === 0) {
    const k = action.split(":")[1];
    const used = S.usedBorrow[k] || 0;
    if (used > 0) {
      S.cash = round2(S.cash - used);
      S.borrowed = round2(Math.max(0, S.borrowed - used));
      delete S.usedBorrow[k];
      toast("已退回渠道 " + fmt(used) + " 万");
    } else {
      const need = Math.min(channelCap(k), gap(S));
      if (need <= 0) {
        toast("资金已备齐，不需要再借");
        return;
      }
      S.cash = round2(S.cash + need);
      S.borrowed = round2(S.borrowed + need);
      S.usedBorrow[k] = need;
      toast("💸 已筹 " + fmt(need) + " 万");
    }
    ctx.render();
    return;
  }
  if (action === "changeHouse") {
    toSelect(ctx, S);
    return;
  }
  if (action === "backLoanType") {
    ctx.nextScene("loanType");
    return;
  }

  /* ── 贷款审批：追加首付 / 拉长年限 / 换房 / 硬上 ── */
  if (action === "lc:pay") {
    const target = minDownToClear(S);
    const prevSel = S.downSel;
    S.downSel = target;
    derive(S);
    if (gap(S) > 0) {
      /* 提档后现金仍不够：回退，改走拉长年限 / 换房（别把用户丢进一个付不起的方案） */
      S.downSel = prevSel;
      derive(S);
      toast("追加首付后现金仍差 " + fmt(gap(S)) + " 万，建议拉长年限或换房");
      ctx.render();
      return;
    }
    S.loanRejected = false;
    iloan(S);
    toast("💰 首付提到 " + (S.downRate * 100).toFixed(0) + "%，重新送审");
    ctx.render();
    return;
  }
  if (action === "lc:long") {
    S.loanYears = 30;
    S.loanRejected = false;
    iloan(S);
    ctx.render();
    return;
  }
  if (action === "lc:stick") {
    S.loanRejected = true;
    toast("❌ 银行拒批：材料与时间都白花了");
    ctx.render();
    return;
  }
  if (action === "lc:change") {
    toSelect(ctx, S);
    return;
  }

  /* ─ 签约清单 12 项：写进合同 / 先不写（决定埋不埋雷） ── */
  if (action.indexOf("cl:") === 0) {
    const p = action.split(":");
    const known = SIGN_ITEMS.some((it) => it.k === p[1]);
    if (known && (p[2] === "do" || p[2] === "no")) {
      S.con[p[1]] = p[2];
      ctx.render();
    }
    return;
  }
  if (action === "fastSign") {
    const half = S.scene === "sign" ? "sign" : "signNet";
    for (const it of SIGN_ITEMS) {
      if (it.half === half) {
        S.con[it.k] = "no";
      }
    }
    toast("⚡ 本屏 6 项已按「先不写」标记——没写的，到那一步才会来");
    ctx.render();
    return;
  }

  /* ── 交房交割 4 项 ─ */
  if (action === "ho:ok") {
    S.hand = { util: true, hukou: true, key: true, fund: true };
    S.handHold = false;
    ctx.nextScene("settle");
    return;
  }
  if (action === "ho:hold") {
    S.hand = { util: false, hukou: false, key: true, fund: true };
    S.handHold = true;
    ctx.nextScene("settle");
    return;
  }

  /* ── 付款确认：出款点统一走弹窗，确认后才真的记账 ── */
  if (action.indexOf("pay:") === 0) {
    const kind = action.split(":")[1] as PayKind;
    if (!PAY_KINDS[kind]) {
      return;
    }
    ctx.openPayModal(kind);
    return;
  }
  if (action === "payCancel") {
    ctx.closeModal();
    return;
  }
  if (action === "payOk") {
    const kind = ctx.data.modal.pay ? ctx.data.modal.pay.kind : null;
    if (!kind) {
      return;
    }
    const amt = payAmount(S, kind);
    ctx.closeModal();
    if (kind === "deposit") {
      ctx.confirmRisk(
        "deposit",
        "签署《房地产买卖居间协议》并支付定金 " + fmt(S.deposit) + " 万。买方违约：定金不予返还；卖方违约：双倍返还。"
      );
      S.cash = round2(S.cash - amt);
      S.paid = round2(S.paid + amt);
      toast("🤝 居间协议已签 · 定金 " + fmt(amt) + " 万已支付");
      ctx.nextScene("signNet");
      return;
    }
    if (kind === "firstPay") {
      ctx.confirmRisk(
        "liquidated",
        "网签备案生效（合同价 " + fmt(S.deal) + " 万）并支付首付先付部分 " + fmt(amt) + " 万（入资金监管）。此刻反悔或迟延履行：按房价 20% 赔付违约金约 " + fmt(S.deal * 0.2) + " 万。"
      );
      S.firstPay = amt;
      S.cash = round2(S.cash - amt);
      S.paid = round2(S.paid + amt);
      toast("🔒 首付先付已入资金监管");
      /* 全款不经过贷款方案与审批：直达补足剩余房款 */
      ctx.nextScene(S.downSel === 1 ? "loanContract" : "loan");
      return;
    }
    if (kind === "restPay") {
      S.cash = round2(S.cash - amt);
      S.paid = round2(S.paid + amt);
      toast(S.downSel === 1 ? "🤝 剩余房款已付清" : "🤝 剩余首付已入资金监管");
      ctx.nextScene("transfer");
      return;
    }
    if (kind === "transfer") {
      S.cash = round2(S.cash - amt);
      S.paid = round2(S.paid + amt);
      toast("📄 税费已缴 · 新产证到手");
      ctx.nextScene("handover");
      return;
    }
    /* holdback：从卖方应得房款中扣留，不占用买方现金 */
    toast("🔒 尾款已扣押 · 结清迁出后再划给卖方");
    ctx.nextScene("final");
  }
}