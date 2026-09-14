/**
 * 购房模拟器 · 事件分发「前置阶段：身份 / 现金 / 选房 / 资格问答」.
 *
 * 从 index.ts 的 handle() 拆出（对应 HiFi handle 前置分支）：
 * start / select / role / role:* / cash:* / pick:* / custOk / qa:* / qaBack。
 * 每次调用返回是否已命中消费；未命中交给 handlers-flow.ts 的后续流程阶段。
 */

import { buildQA, fmt, judgeQA } from "./calc";
import { HOUSES, ROLES, SimState } from "./constants";
import type { House } from "./constants";
import type { HandlerCtx } from "./handlers";

/** 轻提示. */
function toast(title: string): void {
  wx.showToast({ title, icon: "none" });
}

/**
 * 前置阶段分发（命中返回 true，未命中返回 false）.
 * 流程：重置/选身份 → 现金（预设/自定义）→ 选房（预设/自定义）→ 资格问答推进。
 */
export function handleSetup(ctx: HandlerCtx, S: SimState, action: string): boolean {
  if (action === "start") {
    ctx.resetAll();
    return true;
  }
  if (action === "select") {
    ctx.nextScene("select");
    return true;
  }
  if (action === "role") {
    ctx.nextScene("role");
    return true;
  }

  /* 身份角色（先选身份，再选现金，再选房） */
  if (action.indexOf("role:") === 0) {
    const k = action.split(":")[1] as keyof typeof ROLES;
    S.role = ROLES[k];
    S.agentRate = 0.02; /* 换角色重置中介费报价 */
    toast("👤 身份：" + S.role.emoji + " " + S.role.name);
    ctx.nextScene("cash");
    return true;
  }

  /* 可动用现金（预设档 / 自定义） */
  if (action.indexOf("cash:") === 0) {
    const cashKey = action.split(":")[1];
    let amount: number;
    if (cashKey === "custom") {
      amount = parseFloat(ctx.data.formCash);
      if (!(amount > 0)) {
        toast("请输入大于 0 的金额");
        return true;
      }
    } else {
      amount = parseInt(cashKey.replace("p", ""), 10);
    }
    S.cash = Math.round(amount) * 10000;
    S.cashSet = true;
    toast("💰 可动用现金 " + fmt(S.cash) + " 万");
    ctx.nextScene("select"); /* 现金是私人决策，无时间预期，不定档后直接选房 */
    return true;
  }

  /* 选房（预设房源 / 自定义房源） */
  if (action === "pick:custom") {
    ctx.nextScene("custom");
    return true;
  }
  if (action.indexOf("pick:") === 0) {
    const h = HOUSES.find((x) => x.id === action.split(":")[1]);
    if (h) {
      ctx.setupHouse(h);
    }
    return true;
  }

  /* 自定义房源确认：按用户填写造一套房子，税费/环线口径落地 */
  if (action === "custOk") {
    const price = parseFloat(ctx.data.custPrice);
    const area = parseFloat(ctx.data.custArea);
    const ring = ctx.data.custRingValues[ctx.data.custRingIndex] ?? "内";
    const tax = ctx.data.custTaxValues[ctx.data.custTaxIndex] ?? "5u";
    if (!(price > 0) || !(area >= 20)) {
      toast("请填写合理的挂牌价与面积");
      return true;
    }
    let holdYears = 0;
    let unique = false;
    let hold: "new" | undefined;
    let type = "二手房";
    const tagMap: Record<string, string> = {
      new: "新房 · 免增值税",
      "5u": "满五唯一",
      "5n": "满五不唯一",
      "2n": "满二不唯一",
      "0n": "不满 2 年 · 全额增值税",
    };
    if (tax === "new") {
      hold = "new";
      type = "新房";
    } else if (tax === "5u") {
      holdYears = 5;
      unique = true;
    } else if (tax === "5n") {
      holdYears = 5;
    } else if (tax === "2n") {
      holdYears = 2;
    }
    const custom: House = {
      id: "X",
      emoji: "📐",
      name: "自定义房源",
      area: Math.round(area) + "㎡",
      price: Math.round(price) * 10000,
      type,
      ring,
      tag: tagMap[tax] ?? "自定义",
      tagCls: tax === "new" ? "badge-sky" : tax === "5u" ? "badge-warm" : tax === "0n" ? "badge-hair" : "badge-fog",
      thumbCls: "thumb-b",
      hold,
      holdYears,
      unique,
      negotiable: 0.05,
      seller: "房主",
      sellerTag: "房东 · 按需定制",
      intro: "按你填的口径（" + (tagMap[tax] ?? "") + " · " + (ring === "内" ? "外环内" : "外环外") + "）精算税费与砍价空间（默认 5%）。",
      reno: "简装",
    };
    ctx.setupHouse(custom);
    return true;
  }

  /* 资格问答 */
  if (action.indexOf("qa:") === 0) {
    const p = action.split(":");
    S.ans[p[1]] = p[2];
    const steps = buildQA(S);
    if (S.qaProg + 1 < steps.length) {
      S.qaProg++;
      ctx.nextScene("qa");
    } else {
      S.judge = judgeQA(S);
      if (S.judge.ok) {
        toast("✅ 随申办 · 购房资格核验通过");
        ctx.nextScene("nego1"); /* 资格核验无固定等待，通过即进入砍价 */
      } else {
        ctx.nextScene("blocked");
      }
    }
    return true;
  }
  if (action === "qaBack") {
    if (S.qaProg > 0) {
      S.qaProg--;
    }
    ctx.nextScene("qa");
    return true;
  }

  return false;
}