/**
 * 购房模拟器 · 页面（38 屏第一人称购房 + 装修流程模拟）.
 *
 * 状态 S 为模块级单实例，交互统一走 handle(action) 代理：
 * 改 S → setData(buildScene(S) + 状态带 / 装修流程条 / 弹层)。
 * 纯前端本地计算，无后端依赖；每次进入页面重新开始新模拟。
 *
 * 页面职责已按层拆分（本文件仅保留 Page 实例与薄方法）：
 *  - utils/scenes*.ts：场景内容块 + 主按钮（38 屏）
 *  - utils/flow.ts：购房 24 屏流程数据（常规周期 / 等谁 / 一句现场 / 坑 / 签约 12 项）
 *  - utils/calc.ts：税费 / 贷款 / 限购 / 砍价 / 经历周期时间线纯计算
 *  - utils/handlers*.ts：handle() 事件分发（前置 / 流程 / 装修阶段）
 *  - utils/render.ts：状态带 / 装修流程条与双条 / 付款确认弹窗数据
 *  - utils/constants.ts：房源 / 角色 / 贷款方式等配置与 SimState
 *  - utils/riskLog.ts：风险确认记录（本地持久化，交易凭证）
 */

import { buildScene } from "../utils/scenes";
import type { SceneBlock, SceneView } from "../utils/scenes";
import type { PrimaryAction, SwipeBlock } from "../utils/scenes-common";
import { elapsed, payAmount, settleMines, stressFace } from "../utils/calc";
import { createInitialState } from "../utils/constants";
import type { RiskRecord, SceneKey, SimState } from "../utils/constants";
import { clearRiskLog, fmtTs, pushRiskLog } from "../utils/riskLog";
import {
  buildGuard,
  buildRenovMeters,
  buildRenovSteps,
  emptyModal,
  payModal,
  renovStageLabel,
} from "../utils/render";
import type { GuardData, ModalData, RenovMeters, StepItem } from "../utils/render";
import type { PayKind } from "../utils/flow";
import { handleAction } from "../utils/handlers";
import type { HandlerCtx, HandlerData } from "../utils/handlers";
import { commitCustom } from "../utils/handlers-setup";
import { cashChips, cashPrimary, customPrimary, customTaxRows } from "../utils/scenes-start";

/** 全局模拟状态（单实例）. */
let S: SimState;

interface PageData extends HandlerData {
  blocks: SceneBlock[];
  /** 主按钮（页面渲染在内容块之后；输入框改值时可单独 patch）. */
  primary: PrimaryAction | null;
  /** 购房状态带（装修屏为 null，走装修流程条 + 双条）. */
  guard: GuardData | null;
  /** 装修阶段流程条（购房屏为空数组）. */
  steps: StepItem[];
  stepPos: string;
  dayText: string;
  /** 装修阶段徽章文案. */
  renovLabel: string;
  /** 装修期双条（钱 / 工）. */
  meters: RenovMeters | null;
  /** 装修期压力表情. */
  stressEmoji: string;
  /** 自定义房源：是否展示「取得原值」输入框（取得方式 = 继承 / 赠与）. */
  custBaseVisible: boolean;
  /** 舞台顶部动态锚点 id（换屏时递增变化，配合 scroll-into-view 强制回顶）. */
  anchor: string;
  intoView: string;
}

interface PageCustom {
  onAction(e: WechatMiniprogram.TouchEvent): void;
  /** 事件分发（前置 → 流程 → 装修）；ctx 回调由 Page 实例自身承担. */
  handle(action: string): void;
  onCashInput(e: WechatMiniprogram.Input): void;
  onCustInput(e: WechatMiniprogram.Input): void;
  /** 就地替换某个内容块的数据（输入框改值时不整屏重绘，避免失焦与光标跳位）. */
  patchBlock(key: string, patch: Record<string, unknown>): void;
  resetAll(): void;
  render(): void;
  nextScene(scene: SceneKey): void;
  /** 打开付款确认弹窗. */
  openPayModal(kind: PayKind): void;
  closeModal(): void;
  /** 记录风险确认（交易凭证，本地持久化）. */
  confirmRisk(type: "deposit" | "liquidated" | "netTax", detail: string): void;
  noop(): void;
  onStageScroll(e: { detail: { scrollTop: number } }): void;
  onStageTouchStart(e: WechatMiniprogram.TouchEvent): void;
  onStageTouchEnd(e: WechatMiniprogram.TouchEvent): void;
  trySwipe(dy: number): void;
  measureStage(): void;
  anchorN?: number;
  curScene?: string;
  swipeAction?: string;
  stageH?: number;
  scH?: number;
  scrollT?: number;
  touchY0?: number;
  swipeAt?: number;
  onLoad(): void;
}

Page<PageData, PageCustom>({
  data: {
    blocks: [],
    primary: null,
    guard: null,
    steps: [],
    stepPos: "",
    dayText: "",
    renovLabel: "",
    meters: null,
    stressEmoji: "",
    custBaseVisible: false,
    anchor: "top0",
    intoView: "top0",
    modal: emptyModal(),
    formCash: "",
    custPrice: "",
    custArea: "",
    custBase: "",
  },

  onLoad() {
    this.anchorN = 0; /* 动态锚点序号，换屏回顶用 */
    this.swipeAt = 0; /* 上划翻卡节流起点 */
    this.resetAll();
  },

  /** 事件代理：所有 data-act 点击统一分发到 handle. */
  onAction(e: WechatMiniprogram.TouchEvent) {
    const act = e.currentTarget.dataset.act as string | undefined;
    if (act) {
      this.handle(act);
    }
  },

  /** 现金自定义输入：实时更新家底并只刷新现金胶囊与主按钮（整屏重绘会让输入框失焦）. */
  onCashInput(e: WechatMiniprogram.Input) {
    const v = parseFloat(e.detail.value);
    this.setData({ formCash: e.detail.value });
    S.cashSet = v > 0;
    if (v > 0) {
      S.cash = Math.round(v * 10000);
      S.borrowed = 0;
      S.usedBorrow = {};
    }
    this.patchBlock("cash", { items: cashChips(S) });
    this.setData({ primary: cashPrimary(S) });
  },

  /** 自定义房源输入：落定口径并只刷新税费预览与主按钮. */
  onCustInput(e: WechatMiniprogram.Input) {
    const field = e.currentTarget.dataset.field as string;
    this.setData({ [field]: e.detail.value });
    commitCustom(this, S, {}, false);
    this.patchBlock("custTax", { items: customTaxRows(S) });
    this.setData({ primary: customPrimary(S) });
  },

  /** 就地替换内容块数据（按块 key 定位）. */
  patchBlock(key: string, patch: Record<string, unknown>) {
    const blocks = this.data.blocks as { key?: string }[];
    for (let i = 0; i < blocks.length; i++) {
      if (blocks[i].key === key) {
        const path: Record<string, unknown> = {};
        for (const k of Object.keys(patch)) {
          path["blocks[" + i + "]." + k] = patch[k];
        }
        this.setData(path);
        return;
      }
    }
  },

  noop() {
    // sheet 内点击阻断冒泡，防止触发遮罩关闭
  },

  /** 重置为初始状态并渲染开始屏. */
  resetAll() {
    S = createInitialState();
    clearRiskLog(); /* 交易凭证随本次模拟生命周期结束，重新开始即清空 */
    this.setData({ formCash: "", custPrice: "", custArea: "", custBase: "" });
    this.closeModal();
    this.render();
  },

  /**
   * 依据 S 全量渲染当前场景 + 状态带 + 装修流程条 + 弹层。
   * 换屏时递增动态锚点并置 intoView 强制回顶（一次 setData 同步变更 id 与目标，
   * id 变化保证每次都触发滚动）；就地更新（如签约清单勾选）不动锚点 → 不回顶。
   */
  render() {
    const view: SceneView = buildScene(S);
    const sw = view.blocks.find((b) => b.t === "swipe") as SwipeBlock | undefined;
    this.swipeAction = sw?.action ?? "";
    const renov = S.scene.indexOf("renov") === 0;
    const stepsData = renov ? buildRenovSteps(S) : { steps: [] as StepItem[], stepPos: "", dayText: "第 " + S.day + " 天" };
    const sceneChanged = S.scene !== this.curScene;
    this.curScene = S.scene;
    const patch: Record<string, unknown> = {
      blocks: view.blocks,
      primary: view.primary,
      guard: buildGuard(S),
      steps: stepsData.steps,
      stepPos: stepsData.stepPos,
      dayText: stepsData.dayText,
      renovLabel: renov ? renovStageLabel(S) : "",
      meters: buildRenovMeters(S),
      stressEmoji: stressFace(S.stress),
      custBaseVisible: S.scene === "custom" && !!S.custom && S.custom.acq === "inherit",
    };
    if (sceneChanged || this.anchorN === undefined) {
      this.anchorN = (this.anchorN ?? 0) + 1;
      const anchor = "top" + this.anchorN;
      patch.anchor = anchor;
      patch.intoView = anchor;
    }
    this.setData(patch, () => this.measureStage());
  },

  /**
   * 换屏：记录走过的屏（决定累加哪些段的经历天数）→ 结算到站学费单 → 重算已走天数 → 重绘。
   * 顺序与设计稿一致：先结算本屏埋的雷，天数才是含坑的总量。
   */
  nextScene(scene: SceneKey) {
    S.scene = scene;
    if (S.walked.indexOf(scene) < 0) {
      S.walked.push(scene);
    }
    settleMines(S, scene);
    S.day = elapsed(S);
    this.render();
  },

  /** 事件代理：前置（身份/现金/选房/资格）→ 流程（砍价→总账）→ 装修 三阶段依次捕获. */
  handle(action: string) {
    handleAction(this, S, action);
  },

  /** 打开付款确认弹窗（金额与「下一节点」口径见 render.payModal）. */
  openPayModal(kind: PayKind) {
    this.setData({ modal: payModal(S, kind, payAmount(S, kind)) });
  },

  closeModal() {
    this.setData({ modal: emptyModal() });
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

  /** 舞台滚动：跟踪 scrollTop（供上划到底判定）. */
  onStageScroll(e: { detail: { scrollTop: number } }) {
    this.scrollT = e.detail.scrollTop;
  },

  /** 舞台上划手势：记录起点 Y. */
  onStageTouchStart(e: WechatMiniprogram.TouchEvent) {
    const t = e.touches && e.touches[0];
    if (t) {
      this.touchY0 = t.clientY;
    }
  },

  /** 舞台上划手势：上划位移超阈值且已滚到底 → 翻卡. */
  onStageTouchEnd(e: WechatMiniprogram.TouchEvent) {
    const t = e.changedTouches && e.changedTouches[0];
    if (!t || this.touchY0 === undefined) {
      return;
    }
    const dy = this.touchY0 - t.clientY;
    this.touchY0 = undefined;
    this.trySwipe(dy);
  },

  /**
   * 上划翻卡判定：上划位移 > 46px、已滚到距底部 16px 内、420ms 节流；
   * 只有带 action 的上划卡（装修阶段）可跳过——购房屏（含过户/领证）不设上划动作，
   * 避免上划绕过付款确认。
   */
  trySwipe(dy: number) {
    if (dy <= 46 || !this.swipeAction) {
      return;
    }
    const now = Date.now();
    if (now - (this.swipeAt ?? 0) < 420) {
      return;
    }
    if (this.stageH === undefined || this.scH === undefined) {
      return;
    }
    if ((this.scrollT ?? 0) + this.stageH < this.scH - 16) {
      return;
    }
    this.swipeAt = now;
    this.handle(this.swipeAction);
  },

  /** 测量舞台视口 / 内容高度与当前滚动位（px； setData 回调后调用，供上划判定）. */
  measureStage() {
    this.createSelectorQuery()
      .select(".stage")
      .boundingClientRect()
      .select(".stage")
      .scrollOffset()
      .select(".sc")
      .boundingClientRect()
      .exec((res) => {
        const stage = res[0] as { height: number } | null;
        const off = res[1] as { scrollTop: number } | null;
        const sc = res[2] as { height: number } | null;
        if (stage) {
          this.stageH = stage.height;
        }
        if (off) {
          this.scrollT = off.scrollTop;
        }
        if (sc) {
          this.scH = sc.height;
        }
      });
  },
});