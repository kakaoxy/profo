/**
 * 购房模拟器 · 页面事件分发（对应 HiFi 全局 handle()）.
 *
 * 由 index.ts 的 handle(action) 委派而来：handleSetup 覆盖「角色 → 现金 → 选房 →
 * 资格问答」阶段，handleFlow 覆盖「砍价 → 中介费 → 贷款方式 → 算账 → 筹钱 → 签约 →
 * 贷款（风控）→ 监管 → 过户 → 领证 → 交房 → 账单」阶段，两阶段按序依次捕获 action。
 * 全部分支直接操作 SimState（就地修改）并通过 HandlerCtx 回调页面（setData/nextScene/弹层）。
 */

import type { SimState } from "./constants";
import type { House, SceneKey } from "./constants";
import type { ModalData } from "./render";
import { handleSetup } from "./handlers-setup";
import { handleFlow } from "./handlers-flow";

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
  openDepositModal(): void;
  openNetSignModal(): void;
  openTaxModal(): void;
  confirmRisk(type: "deposit" | "liquidated" | "netTax", detail: string): void;
  setupHouse(h: House): void;
}

/**
 * 事件分发（移植 HiFi handle() 全部分支）.
 * 前置阶段（身份/现金/选房/资格问答）先捕获，未命中再交给后续流程阶段处理。
 */
export function handleAction(ctx: HandlerCtx, S: SimState, action: string): void {
  if (!handleSetup(ctx, S, action)) {
    handleFlow(ctx, S, action);
  }
}