/**
 * 购房模拟器 · 页面（23 屏第一人称购房流程模拟）.
 *
 * 状态 S 为模块级单实例（对应 HiFi 全局 S），交互统一走 handle(action) 代理：
 * 改 S → derive()/iloan() → setData(buildScene(S) + HUD + 流程条 + 卖家情绪条)。
 * 纯前端本地计算，无后端依赖（PRD §10）；每次进入页面重新开始新模拟。
 *
 * ⚠️ 单文件 >500 行说明：handle() 事件分发与 HiFi 全局 handle 一一对应（23 屏全部
 * 分支），必须直接访问 Page 实例（setData/nextScene/弹层），拆分散会造成 this 传递
 * 环形依赖；场景文案/计算/配置已分别拆入 scenes.ts、calc.ts、constants.ts。
 */

import { buildScene } from "../utils/scenes";
import type { SceneBlock } from "../utils/scenes";
import {
  buildQA,
  derive,
  findN2Option,
  fmt,
  iloan,
  judgeQA,
  NEGO_R1,
  sellerFace,
  setOffer,
  stressFace,
} from "../utils/calc";
import {
  createInitialState,
  CUST_RING_OPTIONS,
  CUST_RING_VALUES,
  DAYS,
  downRateFor,
  HOUSES,
  INCOME,
  LOAN_TYPES,
  NODES,
  ROLES,
  SCENE_NODE,
  STAGES,
} from "../utils/constants";
import type { House, LoanTypeKey, SceneKey, SimState } from "../utils/constants";

/** 全局模拟状态（单实例）. */
let S: SimState;

/** HUD 顶部数据. */
interface HudData {
  stageLabel: string;
  stepText: string;
  cashText: string;
  /** 算账/筹钱/签约/监管/过户 阶段且现金 < 需现金 时置警示态. */
  cashLow: boolean;
  stressEmoji: string;
}

/** 12 节点流程条单节点. */
interface StepItem {
  label: string;
  mark: string;
  cls: string;
}

/** 卖家情绪条. */
interface SellerBarData {
  show: boolean;
  name: string;
  fill: number;
  face: string;
}

/** 底部弹层数据（信用贷红线二确认 / 到手价解释）. */
interface ModalData {
  type: "" | "credit" | "net";
  /** 到手价弹层：卖方税费分项说明. */
  lines: string[];
  /** 到手价弹层：转嫁税费合计. */
  total: string;
}

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
  closeModal(): void;
}

/** 轻提示. */
function toast(title: string): void {
  wx.showToast({ title, icon: "none" });
}

/** 场景 → 12 节点下标. */
function nodeIdx(scene: SceneKey): number {
  const k = SCENE_NODE[scene] ?? "start";
  const i = NODES.findIndex((n) => n.k === k);
  return i < 0 ? 0 : i;
}

/** 构建 HUD 数据. */
function buildHud(): HudData {
  const idx = nodeIdx(S.scene);
  const low =
    (S.scene === "funds" || S.scene === "borrow" || S.scene === "sign" || S.scene === "escrow" || S.scene === "transfer") &&
    S.cash < S.need;
  return {
    stageLabel: STAGES[S.scene],
    stepText: idx + 1 + "/12",
    cashText: fmt(S.cash) + "万",
    cashLow: low,
    stressEmoji: stressFace(S.stress),
  };
}

/** 构建 12 节点流程条 + 顶部步骤/天数文案. */
function buildSteps(): { steps: StepItem[]; stepPos: string; dayText: string } {
  const idx = nodeIdx(S.scene);
  const steps = NODES.map((n, i) => ({
    label: n.t,
    mark: i < idx ? "✓" : "",
    cls: i < idx ? "done" : i === idx ? "cur" : "",
  }));
  return {
    steps,
    stepPos: "第 " + (idx + 1) + " / 12 步 · " + NODES[idx].t,
    dayText: "第 " + (DAYS[S.scene] ?? 1) + " 天",
  };
}

/** 构建卖家情绪条（砍价 + 选房阶段显示）. */
function buildSellerBar(): SellerBarData {
  const show = S.scene.indexOf("nego") === 0 || S.scene === "select";
  return {
    show,
    name: S.house ? S.house.seller : "",
    fill: S.seller,
    face: sellerFace(S.seller),
  };
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
    modal: { type: "", lines: [], total: "" },
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
    this.setData({ formCash: "", custPrice: "", custArea: "", custRingIndex: 0, custTaxIndex: 0 });
    this.closeModal();
    this.render();
  },

  /** 依据 S 全量渲染当前场景 + HUD + 流程条 + 卖家情绪条. */
  render() {
    const stepsData = buildSteps();
    this.setData({
      blocks: buildScene(S),
      hud: buildHud(),
      steps: stepsData.steps,
      stepPos: stepsData.stepPos,
      dayText: stepsData.dayText,
      sellerBar: buildSellerBar(),
    });
  },

  nextScene(scene: SceneKey) {
    S.scene = scene;
    this.render();
  },

  /**
   * 事件分发（移植 HiFi handle() 全部分支）.
   * 角色 → 现金 → 选房 → 资格问答 → 砍价（含到手价）→ 中介费 → 贷款方式 → 算账
   * → 筹钱 → 签约 → 贷款（风控）→ 监管 → 过户 → 领证 → 交房 → 账单.
   */
  handle(action: string) {
    if (action === "start") {
      this.resetAll();
      return;
    }
    if (action === "select") {
      this.nextScene("select");
      return;
    }
    if (action === "role") {
      this.nextScene("role");
      return;
    }

    /* 身份角色（先选身份，再选现金，再选房） */
    if (action.indexOf("role:") === 0) {
      const k = action.split(":")[1] as keyof typeof ROLES;
      S.role = ROLES[k];
      S.agentRate = 0.02; /* 换角色重置中介费报价 */
      toast("👤 身份：" + S.role.emoji + " " + S.role.name);
      this.nextScene("cash");
      return;
    }

    /* 可动用现金（预设档 / 自定义） */
    if (action.indexOf("cash:") === 0) {
      const cashKey = action.split(":")[1];
      let amount: number;
      if (cashKey === "custom") {
        amount = parseFloat(this.data.formCash);
        if (!(amount > 0)) {
          toast("请输入大于 0 的金额");
          return;
        }
      } else {
        amount = parseInt(cashKey.replace("p", ""), 10);
      }
      S.cash = Math.round(amount) * 10000;
      S.cashSet = true;
      toast("💰 可动用现金 " + fmt(S.cash) + " 万");
      this.nextScene("select");
      return;
    }

    /* 选房（预设房源 / 自定义房源） */
    if (action === "pick:custom") {
      this.nextScene("custom");
      return;
    }
    if (action.indexOf("pick:") === 0) {
      const h = HOUSES.find((x) => x.id === action.split(":")[1]);
      if (h) {
        this.setupHouse(h);
      }
      return;
    }

    /* 自定义房源确认：按用户填写造一套房子，税费/环线口径落地 */
    if (action === "custOk") {
      const price = parseFloat(this.data.custPrice);
      const area = parseFloat(this.data.custArea);
      const ring = this.data.custRingValues[this.data.custRingIndex] ?? "内";
      const tax = this.data.custTaxValues[this.data.custTaxIndex] ?? "5u";
      if (!(price > 0) || !(area >= 20)) {
        toast("请填写合理的挂牌价与面积");
        return;
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
      };
      this.setupHouse(custom);
      return;
    }

    /* 资格问答 */
    if (action.indexOf("qa:") === 0) {
      const p = action.split(":");
      S.ans[p[1]] = p[2];
      const steps = buildQA(S);
      if (S.qaProg + 1 < steps.length) {
        S.qaProg++;
        this.nextScene("qa");
      } else {
        S.judge = judgeQA(S);
        if (S.judge.ok) {
          toast("✅ 随申办 · 购房资格核验通过");
          this.nextScene("nego1");
        } else {
          this.nextScene("blocked");
        }
      }
      return;
    }
    if (action === "qaBack") {
      if (S.qaProg > 0) {
        S.qaProg--;
      }
      this.nextScene("qa");
      return;
    }

    /* 砍价 */
    if (action.indexOf("n1:") === 0) {
      S.negoR1 = action.split(":")[1] as "hard" | "soft" | "chat";
      S.negoR2 = null; /* 重新进入第二轮 */
      const o1 = NEGO_R1[S.negoR1];
      S.stress += o1.stress;
      S.seller = Math.max(5, Math.min(100, S.seller + o1.mood));
      setOffer(S, o1.chip); /* 越线即刻记录，第二轮选项据此生成 */
      this.nextScene("nego2");
      return;
    }
    if (action.indexOf("n2:") === 0) {
      S.negoR2 = action.split(":")[1];
      const o2 = findN2Option(S, S.negoR2);
      if (!o2) {
        return;
      }
      S.stress += o2.stress;
      S.seller = Math.max(5, Math.min(100, S.seller + o2.mood));
      setOffer(S, o2.chip);
      this.nextScene("nego3");
      return;
    }
    if (action === "negoOk") {
      toast("🤝 口头成交 " + fmt(S.deal) + " 万，先谈中介费");
      this.nextScene("feeNego");
      return;
    }
    /* 叫停补救：接受底价 / 换房（房东已亮明底线，买家不再有“加价”空间） */
    if (action === "negoAccept") {
      S.negoCap = false;
      S.seller = Math.min(100, S.seller + 10);
      toast("🤝 按底价 " + fmt(S.deal) + " 万成交");
      this.nextScene("nego3"); /* 回成交页，走「到手价」确认 */
      return;
    }
    if (action === "negoQuit") {
      this.nextScene("select");
      return;
    }

    /* —— 成交后的「到手价」暗坑选择 —— */
    if (action === "n3NetYes") {
      S.netDeal = true;
      derive(S);
      toast("🤝 到手价成交——卖方税费将转嫁给你");
      this.nextScene("feeNego");
      return;
    }
    if (action === "n3NetAsk") {
      this.openNetModal();
      return;
    }
    if (action === "n3NetNo") {
      S.netDeal = false;
      derive(S);
      toast("👍 按含税价成交，卖方税费房东自担");
      this.nextScene("feeNego");
      return;
    }
    if (action === "netYes2") {
      this.closeModal();
      S.netDeal = true;
      derive(S);
      toast("🤝 到手价成交——卖方税费将转嫁给你");
      this.nextScene("feeNego");
      return;
    }
    if (action === "netNo2") {
      this.closeModal();
      S.netDeal = false;
      derive(S);
      toast("👍 按含税价成交，卖方税费房东自担");
      this.nextScene("feeNego");
      return;
    }

    /* 中介费协商（1%–2%，谈成 1%）→ 选贷款方式 */
    if (action === "fee2") {
      S.agentRate = 0.02;
      derive(S);
      this.nextScene("loanType");
      return;
    }
    if (action === "fee1") {
      S.agentRate = 0.01;
      S.stress += 3;
      derive(S);
      toast("🤝 中介费谈成 1%：" + fmt(S.agentFee) + " 万");
      this.nextScene("loanType");
      return;
    }

    /* 贷款方式选择（纯商贷 / 组合贷 / 纯公积金） */
    if (action === "ltOk") {
      this.nextScene("funds");
      return;
    }
    if (action.indexOf("lt:") === 0) {
      S.loanType = action.split(":")[1] as LoanTypeKey;
      derive(S);
      toast("🏦 贷款方式：" + LOAN_TYPES[S.loanType].name + " · 最低首付 " + (downRateFor(S.role!.k, S.house!.ring, S.loanType) * 100).toFixed(0) + "%");
      this.nextScene("loanType");
      return;
    }
    /* 首付档位：0=最低 / 0.3 / 0.5 / 1=全款不贷款（重新进 funds 前均停留在本屏确认） */
    if (action.indexOf("ds:") === 0) {
      S.downSel = parseFloat(action.split(":")[1]) || 0;
      derive(S);
      toast(S.downRate >= 1 ? "💰 已选全款 · 无需贷款" : "首付已调整至 " + (S.downRate * 100).toFixed(0) + "%");
      this.nextScene("loanType");
      return;
    }

    /* 借款 */
    if (action === "bor:family") {
      const gapF = S.need - S.cash;
      if (gapF > 0) {
        const addF = Math.min(300000, gapF);
        S.cash += addF;
        S.borrowed += addF;
        S.usedBorrow.family = true;
        S.stress += 10;
      }
      this.nextScene("borrow");
      return;
    }
    if (action === "bor:gjj") {
      const gapG = S.need - S.cash;
      if (gapG > 0) {
        const addG = Math.min(200000, gapG);
        S.cash += addG;
        S.borrowed += addG;
        S.usedBorrow.gjj = true;
        S.stress += 15;
      }
      this.nextScene("borrow");
      return;
    }
    if (action === "bor:credit") {
      this.openCreditModal();
      return;
    }
    if (action === "creditYes") {
      this.closeModal();
      const gapC = S.need - S.cash;
      if (gapC > 0) {
        const addC = Math.min(200000, gapC);
        S.cash += addC;
        S.borrowed += addC;
      }
      S.usedBorrow.credit = true;
      S.stress += 35;
      this.nextScene("borrow");
      return;
    }
    if (action === "creditNo") {
      this.closeModal();
      return;
    }

    if (action === "sign" || action === "borrow") {
      this.nextScene(action);
      return;
    }
    if (action === "signOk") {
      S.cash -= S.deposit;
      toast("🤝 居间协议已签 · 定金 " + fmt(S.deposit) + " 万已支付");
      this.nextScene("signNet");
      return;
    }
    if (action === "signNetOk") {
      toast("✅ 网签备案完成 · 上海市房地产买卖合同已生效");
      this.nextScene("loan");
      return;
    }
    if (action.indexOf("ly:") === 0) {
      S.loanYears = parseInt(action.split(":")[1], 10);
      iloan(S);
      this.nextScene("loan");
      return;
    }
    if (action === "loanOk") {
      this.nextScene("loanChk");
      return;
    }
    if (action === "loanOkAllCash") {
      toast("💰 全款支付 · 跳过贷款审批");
      this.nextScene("escrow");
      return;
    }

    /* 贷款审批（风控）分支 */
    if (action === "lcOk") {
      toast("🏦 批贷函已出 · 贷款审批通过");
      this.nextScene("escrow");
      return;
    }
    if (action === "lcLong") {
      S.loanYears = 30;
      iloan(S);
      this.nextScene("loanChk");
      return;
    }
    if (action === "lcPay") {
      const Lp = S.loan;
      const fp = Lp.monthly / (S.deal - S.down);
      const addP = Math.max(10000, Math.ceil((Lp.monthly - INCOME * 0.5) / fp / 10000) * 10000);
      // 追加首付按整万元向上补齐（银行风控惯例），非金额精度损失
      S.down += addP; /* 追加首付并入首付，过户前随监管一起扣 */
      S.stress += 8;
      iloan(S);
      toast("💰 追加首付 " + fmt(addP) + " 万，重新送审");
      this.nextScene("loanChk");
      return;
    }
    if (action === "lcStick") {
      S.stress += 20;
      toast("❌ 银行拒批：月供超收入一半");
      this.nextScene("loan");
      return;
    }
    if (action === "lcChange") {
      this.nextScene("select");
      return;
    }

    if (action === "escrowOk") {
      S.cash -= S.down - S.deposit; /* 定金已付，冲抵首付 */
      toast("🔒 首付已入资金监管账户");
      this.nextScene("transfer");
      return;
    }
    if (action === "trOk") {
      S.cash -= S.taxes + S.netTax; /* 到手价转嫁税费随过户一并缴纳 */
      toast("📄 过户完成 · 一网通办出证");
      this.nextScene("deed");
      return;
    }
    if (action === "deedOk") {
      toast("🏦 放款完成 · 尾款已划转卖方");
      this.nextScene("handover");
      return;
    }

    /* 交房交割 */
    if (action === "hoOk") {
      toast("🔑 交房完成，恭喜新房东");
      this.nextScene("final");
      return;
    }
    if (action === "hoHold") {
      S.holdback = Math.round(S.deal * 0.01 * 100) / 100; /* 尾款扣押演示 1%，精确到分 */
      S.stress += 6;
      toast("🤝 尾款扣押 " + fmt(S.holdback) + " 万，迁出后结清");
      this.nextScene("final");
      return;
    }
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
    this.setData({ modal: { type: "credit", lines: [], total: "" } });
  },

  /** 「到手价」解释弹层：把卖方税费金额算给用户看. */
  openNetModal() {
    const lines: string[] = [];
    if (S.vat) {
      lines.push("增值税约 " + fmt(S.vat + S.vatAdd) + " 万（未满 2 年全额 5% + 附加）");
    }
    if (S.sellerTax) {
      lines.push("个税约 " + fmt(S.sellerTax) + " 万（不唯一核定 1%）");
    }
    const total = "约 " + fmt(S.vat + S.vatAdd + S.sellerTax) + " 万";
    this.setData({ modal: { type: "net", lines, total } });
  },

  closeModal() {
    this.setData({ modal: { type: "", lines: [], total: "" } });
  },
});