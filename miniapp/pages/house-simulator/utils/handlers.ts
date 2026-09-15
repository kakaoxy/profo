/**
 * 购房模拟器 · 页面事件分发（对应 HiFi 全局 handle()）.
 *
 * 由 index.ts 的 handle(action) 委派而来：handleSetup 覆盖「角色 → 现金 → 选房 →
 * 资格问答」阶段，handleFlow 覆盖「砍价 → 中介费 → 贷款方式 → 算账 → 筹钱 → 签约 →
 * 贷款（风控）→ 监管 → 过户 → 领证 → 交房 → 账单」阶段，handleRenov 覆盖
 * 「装修预算 → 13 阶段（信息迷雾）→ 完成总账」，三阶段按序依次捕获 action。
 * 全部分支直接操作 SimState（就地修改）并通过 HandlerCtx 回调页面（setData/nextScene/弹层）。
 */

import type { SimState } from "./constants";
import type { House, SceneKey } from "./constants";
import type { ModalData } from "./render";
import { handleSetup } from "./handlers-setup";
import { handleFlow } from "./handlers-flow";
import { handleRenov } from "./handlers-renov";

/** 页面在事件分发中用到的最小回调面（由 Page 实例结构化满足）. */
export interface HandlerCtx {
  data: {
    formCash: string;
    custPrice: string;
    custArea: string;
    custRingValues: House["ring"][];
    custRingIndex: number;
    custTaxValues: string[];
    custTaxIndex: number;
    modal: ModalData;
  };
  setData(patch: Record<string, unknown>): void;
  nextScene(scene: SceneKey): void;
  render(): void;
  resetAll(): void;
  closeModal(): void;
  openCreditModal(): void;
  openNetModal(): void;
  openTaxModal(): void;
  /** 打开「居间协议核对清单」弹层（签署前逐项确认，全部核对后才可进付款确认）. */
  openAgreementModal(): void;
  /** 打开付款确认弹层（定金 / 网签首付先付 / 补足剩余首付 / 缴税领证 / 扣押尾款，确认后才真实扣款）;含违约风险醒目警示. */
  openPayModal(kind: "deposit" | "firstPay" | "restPay" | "transfer" | "holdback"): void;
  /** 打开「模拟日历 · 时间快进」弹层（节点完成 → 下一节点等待天数可视化）；装修阶段由 handler 显式传入起止天数. */
  openCalModal(to: SceneKey, fromDay?: number, toDay?: number): void;
  confirmRisk(type: "deposit" | "liquidated" | "netTax", detail: string): void;
  setupHouse(h: House): void;
}

/**
 * 事件分发（移植 HiFi handle() 全部分支）.
 * 前置阶段（身份/现金/选房/资格问答）先捕获，未命中依次交给流程阶段与装修阶段
 * （三段 action 前缀互不重叠，无重复消费风险）。
 */
export function handleAction(ctx: HandlerCtx, S: SimState, action: string): void {
  if (!handleSetup(ctx, S, action)) {
    handleFlow(ctx, S, action);
    handleRenov(ctx, S, action);
  }
}