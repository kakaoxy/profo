/**
 * 购房模拟器 · 场景视图构建分发器（38 屏 → SceneView：有序内容块 + 主按钮）.
 *
 * 各屏构建函数按模块 / 阶段拆分，本文件仅保留 switch 分发：
 *  - scenes-start.ts：开场·身份·现金·选房（含自定义房源）·资格核验·资格结果
 *  - scenes-nego.ts：三轮砍价 · 到手价 · 中介费
 *  - scenes-money.ts：贷款方式 · 算账 · 筹钱 · 签约·网签（12 项深坑）
 *  - scenes-loan.ts：贷款方案 · 贷款审批 · 贷款合同
 *  - scenes-close.ts：过户 · 缴税领证 · 交房 · 交割结算 · 完成总账
 *  - scenes-renov.ts：装修流程（预算 / 设计师 / 合同清单 / 10 张上划卡 / 完成总账）
 *
 * 纯函数（stageDays 会就地抽一次经历天数并缓存进 S.drawn，与 derive 同类）。
 */

import type { SimState } from "./constants";
import type { SceneView } from "./scenes-common";
import { plainView } from "./scenes-common";
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
import { sceneDeed, sceneFinal, sceneHandover, sceneSettle, sceneTransfer } from "./scenes-close";
import {
  RENOV_CARD_SCENES,
  sceneRenovCard,
  sceneRenovContract,
  sceneRenovDesign,
  sceneRenovDone,
  sceneRenovStart,
} from "./scenes-renov";

/** 构建当前场景视图（每次 setData 全量重建）. */
export function buildScene(S: SimState): SceneView {
  switch (S.scene) {
    case "start":
      return sceneStart();
    case "role":
      return sceneRole(S);
    case "cash":
      return sceneCash(S);
    case "custom":
      return sceneCustom(S);
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
    case "renovStart":
      return plainView(sceneRenovStart(S));
    case "renovDesign":
      return plainView(sceneRenovDesign(S));
    case "renovContract":
      return plainView(sceneRenovContract(S));
    case "renovDone":
      return plainView(sceneRenovDone(S));
    default:
      /* 10 个非决策装修阶段（renovDemo…renovWarr）共用上划卡 */
      if (RENOV_CARD_SCENES.indexOf(S.scene) >= 0) {
        return plainView(sceneRenovCard(S));
      }
      return plainView([]);
  }
}

export type { SceneBlock, SceneView } from "./scenes-common";