/**
 * 购房模拟器 · 事件分发入口（前置阶段 → 流程阶段 → 装修阶段依次捕获）.
 *
 * handleAction 是页面 handle() 的唯一入口：把 data-act 的动作字符串分发到三个
 * 阶段处理器（handlers-setup / handlers-flow / handlers-renov）。全部分支就地修改
 * SimState，并通过 HandlerCtx 回调页面（render / nextScene / 弹层 / 风险确认 / 重置）。
 *
 * ️ 换屏统一走 ctx.nextScene(k)：页面侧负责「记录走过的屏 + 结算到站学费单 + 重算天数」
 * （口径见 calc.settleMines / calc.elapsed），处理器不直接改 S.scene。
 */

import type { SceneKey } from "./constants";
import { SimState } from "./constants";
import type { PayKind } from "./flow";
import type { ModalData } from "./render";
import { handleSetup } from "./handlers-setup";
import { handleFlow } from "./handlers-flow";
import { handleRenov } from "./handlers-renov";

/** 处理器需要读写的页面数据（表单草稿与弹层）. */
export interface HandlerData {
  /** 自定义现金输入框（万元）. */
  formCash: string;
  /** 自定义房源：挂牌价（万元）. */
  custPrice: string;
  /** 自定义房源：建筑面积（㎡）. */
  custArea: string;
  /** 自定义房源：取得原值（万元，继承 / 赠与口径）. */
  custBase: string;
  /** 底部弹层数据. */
  modal: ModalData;
}

/** 页面回调（由 index.ts 实现）. */
export interface HandlerCtx {
  /** 当前页面数据（只读）.*/
  data: HandlerData;
  setData(patch: Record<string, unknown>): void;
  /** 就地重绘（停留本屏，不推进天数、不结算学费单）.*/
  render(): void;
  /** 换屏：记录走过的屏 + 结算到站学费单 + 重算已走天数 + 重绘.*/
  nextScene(k: SceneKey): void;
  /** 重新开始一次模拟.*/
  resetAll(): void;
  /** 打开付款确认弹窗（金额与警示口径见 render.payModal）.*/
  openPayModal(kind: PayKind): void;
  /** 关闭弹层.*/
  closeModal(): void;
  /** 记录一次风险确认（交易凭证，本地持久化）.*/
  confirmRisk(type: "deposit" | "liquidated" | "netTax", detail: string): void;
}

/** 事件分发：前置 → 流程 → 装修（与既有实现同一套 action 语义）. */
export function handleAction(ctx: HandlerCtx, S: SimState, action: string): void {
  if (handleSetup(ctx, S, action)) {
    return;
  }
  handleFlow(ctx, S, action);
  handleRenov(ctx, S, action);
}