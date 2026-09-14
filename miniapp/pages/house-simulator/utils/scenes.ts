/**
 * 购房模拟器 · 场景视图构建分发器（22 屏 → 有序 SceneBlock 列表）.
 *
 * 与 HiFi 原型 renderScene(scene) 一一对应：每屏产出「顺序化内容块」，
 * WXML 按块类型（banner/chat/rows/opts/cta/...）渲染，天然保留 HiFi 的
 * 文案顺序与交互层级。纯函数，仅依赖 SimState 与 calc 工具，便于单测。
 *
 * 各屏构建函数按流程阶段拆分（开场·身份·现金·选房·资格 → 砍价 → 贷款方式·算账·
 * 筹钱·签约 → 贷款·风控 → 监管·过户·领证·交房·账单），本文件仅保留 switch 分发：
 *  - scenes-common.ts：块类型与公共构造（bubble/pmtY/loanRowLabel）
 *  - scenes-start.ts / scenes-nego.ts / scenes-money.ts / scenes-loan.ts / scenes-close.ts：分阶段场景文案
 */

import type { SimState } from "./constants";
import type { SceneBlock } from "./scenes-common";
import {
  sceneBlocked,
  sceneCash,
  sceneCustom,
  sceneQa,
  sceneRole,
  sceneSelect,
  sceneStart,
} from "./scenes-start";
import { sceneFeeNego, sceneNego1, sceneNego2, sceneNego3 } from "./scenes-nego";
import { sceneBorrow, sceneFunds, sceneLoanType, sceneSign, sceneSignNet } from "./scenes-money";
import { sceneLoan, sceneLoanChk, sceneLoanContract } from "./scenes-loan";
import {
  sceneDeed,
  sceneFinal,
  sceneHandover,
  sceneSettle,
  sceneTransfer,
} from "./scenes-close";
import {
  sceneRenovClean,
  sceneRenovDemo,
  sceneRenovDesign,
  sceneRenovDone,
  sceneRenovElec,
  sceneRenovInstall,
  sceneRenovPaint,
  sceneRenovPlan,
  sceneRenovTile,
  sceneRenovWall,
  sceneRenovWood,
} from "./scenes-renov";

/** 构建当前场景内容块（每次 setData 全量重建）. */
export function buildScene(S: SimState): SceneBlock[] {
  switch (S.scene) {
    case "start":
      return sceneStart();
    case "role":
      return sceneRole(S);
    case "cash":
      return sceneCash(S);
    case "custom":
      return sceneCustom();
    case "select":
      return sceneSelect(S);
    case "qa":
      return sceneQa(S);
    case "blocked":
      return sceneBlocked(S);
    case "nego1":
      return sceneNego1(S);
    case "nego2":
      return sceneNego2(S);
    case "nego3":
      return sceneNego3(S);
    case "feeNego":
      return sceneFeeNego(S);
    case "loanType":
      return sceneLoanType(S);
    case "funds":
      return sceneFunds(S);
    case "borrow":
      return sceneBorrow(S);
    case "sign":
      return sceneSign(S);
    case "signNet":
      return sceneSignNet(S);
    case "loan":
      return sceneLoan(S);
    case "loanChk":
      return sceneLoanChk(S);
    case "loanContract":
      return sceneLoanContract(S);
    case "transfer":
      return sceneTransfer(S);
    case "deed":
      return sceneDeed(S);
    case "handover":
      return sceneHandover(S);
    case "settle":
      return sceneSettle(S);
    case "final":
      return sceneFinal(S);
    case "renovDesign":
      return sceneRenovDesign(S);
    case "renovPlan":
      return sceneRenovPlan(S);
    case "renovDemo":
      return sceneRenovDemo(S);
    case "renovWall":
      return sceneRenovWall(S);
    case "renovElec":
      return sceneRenovElec(S);
    case "renovTile":
      return sceneRenovTile(S);
    case "renovWood":
      return sceneRenovWood(S);
    case "renovPaint":
      return sceneRenovPaint(S);
    case "renovInstall":
      return sceneRenovInstall(S);
    case "renovClean":
      return sceneRenovClean(S);
    case "renovDone":
      return sceneRenovDone(S);
    default:
      return [];
  }
}

export type { SceneBlock } from "./scenes-common";