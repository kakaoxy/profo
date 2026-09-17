/**
 * 购房模拟器 · 场景分组「贷款方案 · 贷款审批 · 贷款合同」.
 *
 * 覆盖 3 屏（17/18/19）：贷款方案（月供与年限）/ 贷款审批（等待屏 + 拒批补救）/
 * 贷款合同（补足剩余首付）。文案与结构逐条对齐 2026-09-17 设计稿 v1。
 * 全款不经过这三屏中的前两屏：网签付清「首付先付」后直达贷款合同屏补足剩余房款。
 */

import {
  addDownAmount, addDownText, fmt, fmtYuan, gjjCap, incomeRatio, minDownToClear, money, overRisk,
  stageDays,
} from "./calc";
import { LOAN_TYPES } from "./constants";
import type { SceneKey, SimState } from "./constants";
import { screenMeta } from "./flow";
import { dayBlock, pitBlock, waitBlock } from "./scenes-common";
import type { ChipItem, OptItem, SceneBlock, SceneView } from "./scenes-common";
import { payAction, tuitionBlock } from "./scenes-money";

/** 屏首：第 N 天 + 双层时间条. */
function head(S: SimState, k: SceneKey): SceneBlock {
  const d = screenMeta(k);
  return dayBlock(S, d, stageDays(S, d));
}

/** 贷款方案屏：贷款额、年限、月供，一次定下来. */
export function sceneLoan(S: SimState): SceneView {
  const m = money(S);
  const years: ChipItem[] = [10, 20, 30].map((v) => ({
    action: "ly:" + v,
    label: v + " 年",
    on: S.loanYears === v,
  }));
  return {
    blocks: [
      head(S, "loan"),
      { t: "title", text: "贷款方案" },
      {
        t: "rows",
        items: [
          { k: "成交价", v: "¥" + fmt(m.deal) + " 万" },
          { k: "首付（" + (S.downRate * 100).toFixed(0) + "%）", v: "¥" + fmt(m.down) + " 万" },
          ...(m.shortfall > 0
            ? [{ k: "贷款额度不足（纯公积金上限 " + fmt(gjjCap(S)) + " 万，需现金补）", v: "¥" + fmt(m.shortfall) + " 万" }]
            : []),
          { k: "贷款额（" + LOAN_TYPES[S.loanType].name + "）", v: "¥" + fmt(S.loan.gjj + S.loan.comm) + " 万" },
          { k: "月供（" + S.loanYears + " 年 · 约 " + (S.commRate * 100).toFixed(2) + "%）", v: "¥" + fmtYuan(S.loan.monthly) },
          { k: "月供占家庭月收入", v: incomeRatio(S) + "%", total: true },
        ],
      },
      { t: "sect", title: "还款年限", x: "月供 ≤ 收入 50% 是风控线" },
      { t: "chips", key: "years", items: years },
      ...pitBlock(screenMeta("loan")),
    ],
    primary: { title: "方案 OK，送银行审批", action: "next", wait: "等批贷 7-15 天", disabled: false },
  };
}

/** 贷款审批屏：等待屏 + 风控拦截 / 拒批补救. */
export function sceneLoanChk(S: SimState): SceneView {
  const d = screenMeta("loanChk");
  const rej = S.loanRejected || overRisk(S);
  const target = minDownToClear(S);
  const blocks: SceneBlock[] = [head(S, "loanChk"), ...tuitionBlock(S), ...waitBlock(d)];
  if (rej) {
    blocks.push({
      t: "pit",
      title: S.loanRejected
        ? "坚持原方案递交，银行直接拒批——材料与时间都白花了。"
        : "月供占收入 " + incomeRatio(S) + "%，超过风控线 50%。",
      fix: "追加首付或拉长年限，把月供压回收入一半以内。",
    });
    const opts: OptItem[] = [
      {
        action: "lc:pay", title: "追加首付：" + addDownText(S, target),
        price: "＋" + fmt(addDownAmount(S, target)) + " 万",
        desc: "把月供压回收入一半以内，差额按实际首付档算。",
      },
    ];
    if (S.loanYears < 30) {
      opts.push({ action: "lc:long", title: "拉长还款到 30 年", tag: "月供降档", tagCls: "cool", desc: "月供立刻降，但总利息更多。" });
    }
    opts.push(
      { action: "lc:change", title: "换套便宜点的", desc: "总价低，月供自然低。" },
      { action: "lc:stick", title: "坚持原方案硬上", tag: "❌ 拒批", tagCls: "hot", desc: "银行直接拒批，徒增压力。" },
    );
    blocks.push({ t: "opts", items: opts });
    return { blocks, primary: null };
  }
  blocks.push(
    {
      t: "pit", sky: true, fixLabel: "",
      title: LOAN_TYPES[S.loanType].name + " " + fmt(S.loan.gjj + S.loan.comm) + " 万 · " + S.loanYears + " 年 · 月供占收入 " + incomeRatio(S) + "%",
      fix: "下一步：签贷款合同，同时补足剩余首付。",
    },
    ...pitBlock(d),
  );
  return {
    blocks,
    primary: { title: "批贷通过 · 签贷款合同", action: "next", wait: "约 1-3 天", disabled: false },
  };
}

/** 贷款合同屏：签合同，同时补足剩余首付（全款为补足剩余房款）. */
export function sceneLoanContract(S: SimState): SceneView {
  const m = money(S);
  const cashOnly = S.downSel === 1;
  const firstPay = S.firstPay;
  const rest = Math.max(0, m.downCash - S.deposit - firstPay);
  const blocks: SceneBlock[] = [
    head(S, "loanContract"),
    { t: "title", text: cashOnly ? "全款 · 补足尾款" : "贷款合同 · 补足首付" },
    {
      t: "rows",
      items: [
        { k: "定金（签约已付）", v: "¥" + fmt(S.deposit) + " 万" },
        { k: "首付先付（网签已付 · 入资金监管）", v: "¥" + fmt(firstPay) + " 万" },
        ...(m.shortfall > 0
          ? [{ k: "贷款额度不足需现金补足（" + LOAN_TYPES[S.loanType].name + "）", v: "¥" + fmt(m.shortfall) + " 万" }]
          : []),
        { k: cashOnly ? "本次补足剩余房款" : "本次补足剩余首付", v: "¥" + fmt(rest) + " 万" },
        { k: cashOnly ? "已付房款合计" : "首付合计", v: "¥" + fmt(m.downCash) + " 万", total: true },
      ],
    },
  ];
  if (S.con.paynode === "no") {
    blocks.push({
      t: "pit",
      title: "剩余首付被要求提前补足，现金一次被抽干。",
      fix: "四段写死：定金 / 先付 / 补足 / 尾款。",
    });
  }
  blocks.push(...pitBlock(screenMeta("loanContract")));
  return {
    blocks,
    primary: {
      title: cashOnly ? "确认全款交付 · 补足剩余房款" : "确认贷款合同 · 补足剩余首付",
      action: payAction("restPay"),
      wait: "递交后审税 7-15 天",
      disabled: false,
    },
  };
}