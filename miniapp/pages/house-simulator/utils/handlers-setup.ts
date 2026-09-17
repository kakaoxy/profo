/**
 * 购房模拟器 · 事件分发「前置阶段：重置 / 身份 / 现金 / 选房 / 自定义房源 / 资格问答」.
 *
 * 每次调用返回是否已命中消费；未命中交给 handlers-flow.ts 的后续流程阶段。
 * 依据：2026-09-17 设计稿 v1（身份→亮家底→看房→资格核验，决策点一屏一次）。
 */

import { buildQA, defaultCustom, derive, fmt, judgeQA, round2, syncCustom } from "./calc";
import { HOUSES, ROLES } from "./constants";
import type { House, SimState } from "./constants";
import type { HandlerCtx } from "./handlers";

/** 轻提示. */
function toast(title: string): void {
  wx.showToast({ title, icon: "none" });
}

/**
 * 退回选房：退还已出款与已筹借款，清掉成交状态与已签结论.
 * 现金回到「亮家底时的存款」口径：已付的定金 / 首付先付 / 补足 / 税费全额退回（交易中断），
 * 借款原路还掉——否则状态带还挂着上一套的「需现金」、或带着上一套的签约结论进场。
 */
export function toSelect(ctx: HandlerCtx, S: SimState): void {
  S.cash = round2(S.cash + S.paid);
  if (S.borrowed > 0) {
    S.cash = round2(S.cash - S.borrowed);
    S.borrowed = 0;
  }
  S.usedBorrow = {};
  S.paid = 0;
  S.deal = 0;
  S.slash = 0;
  S.deposit = 0;
  S.negoR1 = null;
  S.negoR2 = null;
  S.negoCap = false;
  S.netDeal = false;
  S.netTax = 0;
  S.loanRejected = false;
  S.handHold = false;
  S.hand = {};
  S.con = {};
  S.firstPay = 0;
  ctx.nextScene("select");
}

/**
 * 自定义房源草稿落定：把输入框里的值并入草稿（chips 的口径覆盖 patch），重算税费口径。
 * fillDefault = 输入框为空时沿用当前草稿口径（点选口径时用）；false 且挂牌价未填则不落定
 * （主按钮保持禁用，避免「没填价也能确认」）。
 */
export function commitCustom(ctx: HandlerCtx, S: SimState, patch: Partial<House>, fillDefault: boolean): void {
  const draft = Object.assign({}, S.custom || defaultCustom());
  const pv = parseFloat(ctx.data.custPrice);
  const av = parseFloat(ctx.data.custArea);
  const bv = parseFloat(ctx.data.custBase);
  const price = pv > 0 ? Math.round(pv) * 10000 : fillDefault ? draft.price : 0;
  if (!price) {
    return;
  }
  draft.price = price;
  if (av > 0) {
    draft.areaNum = Math.round(av);
    draft.area = Math.round(av) + "㎡";
  } else if (fillDefault) {
    draft.areaNum = parseInt(draft.area, 10) || 90;
    draft.area = draft.areaNum + "㎡";
  }
  if (bv > 0) {
    draft.base = Math.round(bv) * 10000;
  }
  S.custom = syncCustom(Object.assign(draft, patch));
  S.house = null;
  derive(S);
}

/** 前置阶段分发（命中返回 true，未命中返回 false）. */
export function handleSetup(ctx: HandlerCtx, S: SimState, action: string): boolean {
  if (action === "reset") {
    ctx.resetAll();
    return true;
  }

  /* 身份角色：选一个身份（停留本屏确认，主按钮「按…继续」推进） */
  if (action.indexOf("role:") === 0) {
    const k = action.split(":")[1] as keyof typeof ROLES;
    S.role = ROLES[k];
    S.agentRate = 0.02; /* 换角色重置中介费报价 */
    toast("👤 身份：" + S.role.emoji + " " + S.role.name);
    ctx.render();
    return true;
  }

  /* 可动用现金（预设档；自定义金额由输入框实时落定） */
  if (action.indexOf("cash:") === 0) {
    const amount = parseInt(action.split(":")[1], 10);
    if (!(amount > 0)) {
      return true;
    }
    S.cash = amount * 10000;
    S.cashSet = true;
    S.borrowed = 0; /* 重新亮家底：之前的筹钱作废 */
    S.usedBorrow = {};
    toast("💰 可动用现金 " + fmt(S.cash) + " 万");
    ctx.render();
    return true;
  }

  /* 看房：选中一套预设房源（停留本屏确认，主按钮「就这套 · 去核验资格」推进）；
   点「自定义房源」卡则进入自定义屏（不选预设） */
  if (action.indexOf("house:") === 0) {
    const id = action.split(":")[1];
    if (id === "custom") {
      ctx.nextScene("custom");
      return true;
    }
    const h = HOUSES.find((x) => x.id === id);
    if (!h) {
      return true;
    }
    S.house = h;
    S.custom = null; /* 回预设房源：自定义草稿作废 */
    S.slash = 0;
    S.negoR1 = null;
    S.negoCap = false;
    S.netDeal = false;
    S.loanRejected = false;
    derive(S);
    ctx.render();
    return true;
  }

  /* 自定义房源：四组口径（环线 / 持有年限 / 是否唯一 / 取得方式），点一下即定稿 */
  if (action.indexOf("ring:") === 0) {
    commitCustom(ctx, S, { ring: action.split(":")[1] as House["ring"] }, true);
    ctx.render();
    return true;
  }
  if (action.indexOf("cy:") === 0) {
    commitCustom(ctx, S, { holdYears: parseInt(action.split(":")[1], 10) }, true);
    ctx.render();
    return true;
  }
  if (action.indexOf("cu:") === 0) {
    commitCustom(ctx, S, { unique: action.split(":")[1] === "1" }, true);
    ctx.render();
    return true;
  }
  if (action.indexOf("ca:") === 0) {
    commitCustom(ctx, S, { acq: action.split(":")[1] === "inherit" ? "inherit" : "buy" }, true);
    ctx.render();
    return true;
  }

  /* 资格问答（户籍 → 居住证 → 社保年限；答完即出结果） */
  if (action.indexOf("qa:") === 0) {
    const p = action.split(":");
    S.ans[p[1]] = p[2];
    const steps = buildQA(S);
    if (S.qaProg + 1 < steps.length) {
      S.qaProg++;
      ctx.nextScene("qa");
    } else {
      S.judge = judgeQA(S);
      ctx.nextScene("blocked");
    }
    return true;
  }
  if (action === "requalify") {
    S.ans = {};
    S.qaProg = 0;
    S.judge = null;
    ctx.nextScene("qa");
    return true;
  }
  if (action === "backSelect") {
    toSelect(ctx, S);
    return true;
  }

  return false;
}