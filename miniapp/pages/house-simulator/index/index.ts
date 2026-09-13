/**
 * 购房模拟器 · 页面（23 屏第一人称购房流程模拟）.
 *
 * 状态 S 为模块级单实例（对应 HiFi 全局 S），交互统一走 handle(action) 代理：
 * 改 S → derive()/iloan() → setData(buildScene(S) + HUD + 流程条 + 卖家情绪条)。
 * 纯前端本地计算，无后端依赖（PRD §10）；每次进入页面重新开始新模拟。
 *
 * 页面职责已按层拆分（本文件仅保留 Page 实例与薄方法）：
 *  - utils/scenes*.ts：场景内容块构建（23 屏文案）
 *  - utils/calc.ts：税费/贷款/限购/砍价纯计算
 *  - utils/handlers*.ts：handle() 事件分发（前置阶段 + 流程阶段）
 *  - utils/render.ts：HUD / 流程条 / 卖家情绪 / 弹层数据构建
 *  - utils/constants.ts：房源/角色/贷款方式等数据配置
 *  - utils/riskLog.ts：风险确认记录（本地持久化）
 */

import { buildScene } from "../utils/scenes";
import type { SceneBlock } from "../utils/scenes";
import { derive } from "../utils/calc";
import {
  createInitialState,
  CUST_RING_OPTIONS,
  CUST_RING_VALUES,
  ROLES,
} from "../utils/constants";
import type { House, RiskRecord, SceneKey, SimState } from "../utils/constants";
import { clearRiskLog, fmtTs, pushRiskLog } from "../utils/riskLog";
import {
  buildHud,
  buildSellerBar,
  buildSteps,
  depositModal,
  emptyModal,
  netModal,
  netSignModal,
  taxRiskModal,
} from "../utils/render";
import type { HudData, ModalData, SellerBarData, StepItem } from "../utils/render";
import { handleAction } from "../utils/handlers";

/** 全局模拟状态（单实例）. */
let S: SimState;

interface PageData {
  blocks: SceneBlock[];
  hud: HudData;
  stepPos: string;
  dayText: string;
  steps: StepItem[];
  sellerBar: SellerBarData;
  /** 自定义现金（万元）. */
  formCash: string;
  custPrice: string;
  custArea: string;
  custRingOptions: string[];
  /** 环线口径值（与 custRingOptions 同序），picker 回传下标后据此取值. */
  custRingValues: House["ring"][];
  custRingIndex: number;
  custTaxOptions: string[];
  custTaxValues: string[];
  custTaxIndex: number;
  modal: ModalData;
}

interface PageCustom {
  onAction(e: WechatMiniprogram.TouchEvent): void;
  onCashInput(e: WechatMiniprogram.Input): void;
  onCustInput(e: WechatMiniprogram.Input): void;
  onCustRingChange(e: WechatMiniprogram.PickerChange): void;
  onCustTaxChange(e: WechatMiniprogram.PickerChange): void;
  onModalMask(): void;
  noop(): void;
  resetAll(): void;
  render(): void;
  nextScene(scene: SceneKey): void;
  handle(action: string): void;
  setupHouse(h: House): void;
  openCreditModal(): void;
  openNetModal(): void;
  openDepositModal(): void;
  openNetSignModal(): void;
  openTaxModal(): void;
  confirmRisk(type: "deposit" | "liquidated" | "netTax", detail: string): void;
  closeModal(): void;
}

Page<PageData, PageCustom>({
  data: {
    blocks: [],
    hud: { stageLabel: "", stepText: "", cashText: "", cashLow: false, stressEmoji: "😌" },
    stepPos: "",
    dayText: "",
    steps: [],
    sellerBar: { show: false, name: "", fill: 70, face: "🙂" },
    formCash: "",
    custPrice: "",
    custArea: "",
    custRingOptions: CUST_RING_OPTIONS,
    custRingValues: CUST_RING_VALUES,
    custRingIndex: 0,
    custTaxOptions: [
      "新房（免增值税 / 无卖方个税）",
      "满五唯一（免增值税、免个税）",
      "满五不唯一（免增值税、个税核定 1%）",
      "满二不唯一（免增值税、个税核定 1%）",
      "不满 2 年（全额增值税 5% + 附加 + 个税 1%）",
    ],
    custTaxValues: ["new", "5u", "5n", "2n", "0n"],
    custTaxIndex: 0,
    modal: emptyModal(),
  },

  onLoad() {
    this.resetAll();
  },

  /** 事件代理：所有 data-act 点击统一分发到 handle. */
  onAction(e: WechatMiniprogram.TouchEvent) {
    const act = e.currentTarget.dataset.act as string | undefined;
    if (act) {
      this.handle(act);
    }
  },

  onCashInput(e: WechatMiniprogram.Input) {
    this.setData({ formCash: e.detail.value });
  },

  onCustInput(e: WechatMiniprogram.Input) {
    const field = e.currentTarget.dataset.field as string;
    this.setData({ [field]: e.detail.value });
  },

  onCustRingChange(e: WechatMiniprogram.PickerChange) {
    this.setData({ custRingIndex: parseInt(String(e.detail.value), 10) || 0 });
  },

  onCustTaxChange(e: WechatMiniprogram.PickerChange) {
    this.setData({ custTaxIndex: parseInt(String(e.detail.value), 10) || 0 });
  },

  /** 点弹层遮罩关闭（sheet 内 catchtap 阻断冒泡，不会误关）. */
  onModalMask() {
    this.closeModal();
  },

  noop() {
    // sheet 内点击阻断冒泡，防止触发遮罩关闭
  },

  /** 重置为初始状态并渲染开始屏（等同 HiFi resetAll）. */
  resetAll() {
    S = createInitialState();
    clearRiskLog(); /* 交易凭证随本次模拟生命周期结束，重新开始即清空 */
    this.setData({ formCash: "", custPrice: "", custArea: "", custRingIndex: 0, custTaxIndex: 0 });
    this.closeModal();
    this.render();
  },

  /** 依据 S 全量渲染当前场景 + HUD + 流程条 + 卖家情绪条. */
  render() {
    const stepsData = buildSteps(S);
    this.setData({
      blocks: buildScene(S),
      hud: buildHud(S),
      steps: stepsData.steps,
      stepPos: stepsData.stepPos,
      dayText: stepsData.dayText,
      sellerBar: buildSellerBar(S),
    });
  },

  nextScene(scene: SceneKey) {
    S.scene = scene;
    this.render();
  },

  /** 事件代理：前置（身份/现金/选房/资格）与流程（砍价→账单）两阶段依次捕获. */
  handle(action: string) {
    handleAction(this, S, action);
  },

  /** 选房后统一入口：落定房源、清空砍价/问答态，先核验资格. */
  setupHouse(h: House) {
    if (!S.role) {
      S.role = ROLES.first; /* 兜底：未选身份默认刚需 */
    }
    S.house = h;
    S.slash = 0;
    S.negoCap = false;
    S.netDeal = false;
    S.judge = null;
    S.ans = {};
    S.qaProg = 0;
    if (S.stress < 8) {
      S.stress = 8;
    }
    derive(S);
    this.nextScene("qa");
  },

  /** 信用贷二次确认（红线）：弹层仅作风险教育，不收集信息. */
  openCreditModal() {
    this.setData({ modal: { ...emptyModal(), type: "credit" } });
  },

  /** 「到手价」解释弹层：把卖方税费金额算给用户看. */
  openNetModal() {
    this.setData({ modal: netModal(S) });
  },

  /** 居间协议签署前：定金罚则强制确认弹层（不可关闭，确认后才付定金）. */
  openDepositModal() {
    this.setData({ modal: depositModal(S) });
  },

  /** 网签前：违约金 20% 强制确认弹层（不可关闭，确认后才完成网签）. */
  openNetSignModal() {
    this.setData({ modal: netSignModal(S) });
  },

  /** 「到手价」税费风险强制确认弹层：分项列明卖方税费转嫁明细，勾选后才可确认（不可关闭）. */
  openTaxModal() {
    this.setData({ modal: taxRiskModal(S) });
  },

  /** 记录一次风险确认（写本地存储 + 镜像 S.riskLog），作为交易凭证一部分. */
  confirmRisk(type: "deposit" | "liquidated" | "netTax", detail: string) {
    const rec: RiskRecord = {
      type,
      title:
        type === "deposit"
          ? "居间签约 · 定金罚则确认"
          : type === "liquidated"
            ? "网签 · 违约金 20% 确认"
            : "到手价 · 税费风险确认",
      ts: fmtTs(),
      detail,
    };
    pushRiskLog(rec);
    S.riskLog = S.riskLog.concat([rec]);
  },

  closeModal() {
    this.setData({ modal: emptyModal() });
  },
});