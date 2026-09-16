/**
 * 购房模拟器 · 事件分发（handleAction）流程单测.
 *
 * 覆盖 handlers.ts / handlers-setup.ts / handlers-flow.ts 拆出的页面事件链：
 * 身份 → 现金 → 选房 → 资格问答 → 砍价（含到手价）→ 中介费 → 贷款方式 → 算账 →
 * 筹钱 → 签约 → 贷款审批 → 监管 → 过户 → 交房，断言场景流转与金额/状态位移。
 * 通过伪造 HandlerCtx（镜像 index.ts 的 setupHouse 等薄方法）驱动，避免依赖 Page/wx。
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createInitialState, HOUSES, ROLES, SimState } from "../../pages/house-simulator/utils/constants";
import { derive, nego2Options } from "../../pages/house-simulator/utils/calc";
import { handleAction, HandlerCtx } from "../../pages/house-simulator/utils/handlers";
import { renovArrive } from "../../pages/house-simulator/utils/handlers-renov";
import { contractPriceOf, paidTotalOf } from "../../pages/house-simulator/utils/renov-data";
import { emptyModal, netModal, payModal, taxRiskModal, agreementModal } from "../../pages/house-simulator/utils/render";

/* wx API 存根（handlers 内 toast 使用）. */
beforeAll(() => {
  (globalThis as unknown as Record<string, unknown>).wx = {
    showToast: () => {},
    getStorageSync: () => [],
    setStorageSync: () => {},
    removeStorageSync: () => {},
  };
});

/** 测试桩页面：记录调用序列，镜像 index.ts 的薄方法行为，便于驱动 handleAction. */
class FakePage {
  calls: string[] = [];
  data: Record<string, any> = {
    formCash: "80",
    custPrice: "360",
    custArea: "90",
    custRingValues: ["内", "外"],
    custRingIndex: 0,
    custTaxValues: ["new", "5u", "5n", "2n", "0n"],
    custTaxIndex: 0,
    modal: emptyModal(),
  };

  constructor(public S: SimState) {}

  /** setData 支持 "modal.checked"、"modal.agreement.all" 等点路径（含多级）. */
  setData(patch: Record<string, unknown>): void {
    for (const k of Object.keys(patch)) {
      if (k.indexOf(".") > 0) {
        const segs = k.split(".");
        let cur: Record<string, any> = this.data;
        for (let i = 0; i < segs.length - 1; i++) {
          if (cur[segs[i]] === undefined) {
            cur[segs[i]] = {};
          }
          cur = cur[segs[i]];
        }
        cur[segs[segs.length - 1]] = patch[k];
      } else {
        this.data[k] = patch[k];
      }
    }
  }

  nextScene(scene: string): void {
    this.S.scene = scene as SimState["scene"];
    this.calls.push("next:" + scene);
  }

  render(): void {}

  resetAll(): void {
    this.calls.push("resetAll");
  }

  closeModal(): void {
    this.setData({ modal: emptyModal() });
  }

  openCreditModal(): void {
    this.setData({ modal: { ...emptyModal(), type: "credit" } });
    this.calls.push("modal:credit");
  }

  openNetModal(): void {
    this.setData({ modal: netModal(this.S) });
    this.calls.push("modal:net");
  }

  openTaxModal(): void {
    this.setData({ modal: taxRiskModal(this.S) });
    this.calls.push("modal:taxRisk");
  }

  /** 镜像 index.ts openAgreementModal：居间协议核对清单（6 处逐项勾选）. */
  openAgreementModal(): void {
    this.setData({ modal: agreementModal() });
    this.calls.push("modal:agreement");
  }

  /** 镜像 index.ts openPayModal：付款确认弹层，确认（payOk）后才真实扣款. */
  openPayModal(kind: "deposit" | "firstPay" | "restPay" | "transfer" | "holdback"): void {
    this.setData({ modal: payModal(this.S, kind) });
    this.calls.push("modal:pay");
  }

  /** 镜像 index.ts openCalModal：模拟日历 · 时间快进（动画由页面驱动，桩仅记录目标与天数） */
  openCalModal(to: string, _fromDay?: number, _toDay?: number): void {
    this.calls.push("cal:" + to);
  }

  confirmRisk(type: string, _detail: string): void {
    this.calls.push("confirmRisk:" + type);
  }

  /** 镜像 index.ts setupHouse：落定房源、清空砍价/问答态、核验资格前重算. */
  setupHouse(h: (typeof HOUSES)[number]): void {
    if (!this.S.role) {
      this.S.role = ROLES.first;
    }
    this.S.house = h;
    this.S.slash = 0;
    this.S.negoCap = false;
    this.S.netDeal = false;
    this.S.judge = null;
    this.S.ans = {};
    this.S.qaProg = 0;
    if (this.S.stress < 8) {
      this.S.stress = 8;
    }
    derive(this.S);
    this.S.scene = "qa";
    this.calls.push("setupHouse:" + h.id);
  }
}

/** 构造测试桩 + 初始状态. */
function page(): FakePage {
  const S = createInitialState();
  return new FakePage(S);
}

function run(p: FakePage, ...acts: string[]): void {
  for (const a of acts) {
    handleAction(p as unknown as HandlerCtx, p.S, a);
  }
}

/** 全量核对居间协议清单并确认签署（signOk → 逐项勾选 → 确认 → 进入付款确认，不含 payOk）. */
const AGREE_TO_PAY = [
  "signOk",
  "agrCheck:0", "agrCheck:1", "agrCheck:2", "agrCheck:3", "agrCheck:4", "agrCheck:5", "agrCheck:6", "agrCheck:7",
  "agrOk",
];

describe("前置阶段：身份 / 现金 / 选房 / 资格问答", () => {
  it("role:first → 进入现金屏，角色落定且中介费率重置 2%", () => {
    const p = page();
    run(p, "role:first");
    expect(p.S.role!.k).toBe("first");
    expect(p.S.agentRate).toBe(0.02);
    expect(p.S.scene).toBe("cash");
  });

  it("cash:p70 → 现金 70 万并进入选房", () => {
    const p = page();
    run(p, "role:first", "cash:p70");
    expect(p.S.cash).toBe(700000);
    expect(p.S.cashSet).toBe(true);
    expect(p.S.scene).toBe("select");
  });

  it("cash:custom 非法金额被拦截，不离开现金屏", () => {
    const p = page();
    run(p, "role:first");
    p.data.formCash = "abc";
    run(p, "cash:custom");
    expect(p.S.scene).toBe("cash");
    expect(p.S.cashSet).toBe(false);
  });

  it("pick:B 预设房源 → setupHouse 落定并进入资格问答", () => {
    const p = page();
    run(p, "role:first", "cash:p70", "pick:B");
    expect(p.S.house!.id).toBe("B");
    expect(p.S.scene).toBe("qa");
  });

  it("custOk 按表单造房：环线下标口径与税费档位正确落地", () => {
    const p = page();
    run(p, "role:first", "cash:p70", "pick:custom");
    expect(p.S.scene).toBe("custom");
    p.data.custPrice = "360";
    p.data.custArea = "90";
    p.data.custRingIndex = 1; // 外环外
    p.data.custTaxIndex = 3; // 满二不唯一
    run(p, "custOk");
    expect(p.S.house!.ring).toBe("外");
    expect(p.S.house!.holdYears).toBe(2);
    expect(p.S.house!.unique).toBe(false);
    expect(p.S.house!.price).toBe(3600000);
    expect(p.S.scene).toBe("qa");
  });

  it("资格问答两题答满：沪籍已婚刚需 → 核验通过进入砍价", () => {
    const p = page();
    run(p, "role:first", "cash:p70", "pick:B", "qa:hukou:sh", "qa:married:married");
    expect(p.S.judge!.ok).toBe(true);
    expect(p.S.scene).toBe("nego1");
  });

  it("qaBack 回退上一题", () => {
    const p = page();
    run(p, "role:first", "cash:p70", "pick:B", "qa:hukou:sh", "qaBack");
    expect(p.S.qaProg).toBe(0);
    expect(p.S.scene).toBe("qa");
  });
});

describe("流程阶段：砍价 → 到手价 → 中介费 → 贷款方式", () => {
  /** 推进到砍价第一轮. */
  function atNego1(): { p: FakePage; S: SimState } {
    const p = page();
    run(p, "role:first", "cash:p70", "pick:B", "qa:hukou:sh", "qa:married:married");
    expect(p.S.scene).toBe("nego1");
    return { p, S: p.S };
  }

  it("n1:chat 未越线 → 第二轮，随后 n2 按选项成交至 nego3", () => {
    const { p, S } = atNego1();
    run(p, "n1:chat");
    expect(S.negoCap).toBe(false);
    expect(S.scene).toBe("nego2");
    run(p, "n2:m5");
    expect(S.scene).toBe("nego3");
    expect(S.deal).toBeCloseTo(4000000 * 0.95);
  });

  it("n1:hard 越线（-6% 超 B 房底线 5%）→ 成交价封顶底线 5%", () => {
    const { p, S } = atNego1();
    run(p, "n1:hard");
    expect(S.negoCap).toBe(true);
    expect(S.scene).toBe("nego2");
    expect(S.deal).toBeCloseTo(4000000 * 0.95);
    // 越线第二轮的「坚持原报价」仍按 6% 计（会被再次叫停），其余选项不越底线
    const r = nego2Options(S);
    expect(r.over).toBe(true);
    expect(r.opts.filter((o) => o.key !== "push").every((o) => o.chip <= 0.05)).toBe(true);
  });

  it("越线叫停后 negoAccept 接受底价，回到成交页走确认", () => {
    const { p, S } = atNego1();
    run(p, "n1:hard", "n2:acc", "negoAccept");
    expect(S.negoCap).toBe(false);
    expect(S.scene).toBe("nego3");
  });

  it("满五唯一（B 房）无卖方税费 → 直接确认成交进中介费", () => {
    const { p, S } = atNego1();
    run(p, "n1:chat", "n2:m5", "negoOk");
    expect(S.scene).toBe("feeNego");
  });

  it("未满 2 年（F 房）成交后出现「到手价」：同意 → 强制税费确认 → 勾选后落定转嫁", () => {
    const p = page();
    run(p, "role:first", "cash:p70", "pick:F", "qa:non-sh", "qa:permit:no", "qa:years:m1-3");
    // F 房 foreign? judgeQA: non-sh, permit no, years m1-3, F ring=内, owned 0 → ok
    expect(p.S.scene).toBe("nego1");
    run(p, "n1:chat", "n2:m5");
    expect(p.S.scene).toBe("nego3");
    // 未勾选确认被拦截
    run(p, "n3NetYes", "taxRiskOk");
    expect(p.S.netDeal).toBe(false);
    expect(p.S.scene).toBe("nego3");
    // 勾选后确认 → 到手价转嫁落定
    run(p, "taxCheck", "taxRiskOk");
    expect(p.S.netDeal).toBe(true);
    expect(p.S.netTax).toBeCloseTo(p.S.vat + p.S.vatAdd + p.S.sellerTax);
    expect(p.S.scene).toBe("feeNego");
  });

  it("同意含税价 n3NetNo → 无转嫁、仍按含税价成交", () => {
    const p = page();
    run(p, "role:first", "cash:p70", "pick:F", "qa:non-sh", "qa:permit:no", "qa:years:m1-3", "n1:chat", "n2:m5", "n3NetNo");
    expect(p.S.netDeal).toBe(false);
    expect(p.S.netTax).toBe(0);
    expect(p.S.scene).toBe("feeNego");
  });

  it("fee1 压中介费至 1%，随后选组合贷进入算账", () => {
    const { p, S } = atNego1();
    run(p, "n1:chat", "n2:m5", "negoOk", "fee1");
    expect(S.agentRate).toBe(0.01);
    expect(S.scene).toBe("loanType");
    run(p, "lt:combo");
    expect(S.loanType).toBe("combo");
    expect(S.scene).toBe("loanType");
    run(p, "ltOk");
    expect(S.scene).toBe("funds");
  });
});

describe("流程阶段：筹钱 / 签约 / 贷款 / 监管 / 过户 / 交房", () => {
  /** 推进到资金缺口屏（现金不足首付税费）. */
  function atFundsShort(): { p: FakePage; S: SimState } {
    const p = page();
    run(p, "role:first", "cash:p50", "pick:B", "qa:non-sh", "qa:permit:yes", "n1:chat", "n2:m5", "negoOk", "fee2", "lt:combo", "ltOk");
    // B 房(400万×0.95=380万)组合贷首套 20% → need≈76万+税费 > 现金 50 万 → 缺口
    expect(p.S.cash).toBe(500000);
    expect(p.S.scene).toBe("funds");
    return { p, S: p.S };
  }

  it("bor:family 视缺口借入（上限 30 万）并进入筹钱屏", () => {
    const { p, S } = atFundsShort();
    const before = S.cash;
    run(p, "bor:family");
    expect(S.borrowed).toBe(Math.min(300000, S.need - before));
    expect(S.cash).toBe(before + S.borrowed);
    expect(S.usedBorrow.family).toBe(true);
    expect(S.scene).toBe("borrow");
  });

  it("信用贷红线：bor:credit 仅弹层教育，creditYes 才放款且压力 +35", () => {
    const { p, S } = atFundsShort();
    run(p, "bor:credit");
    expect(p.calls).toContain("modal:credit");
    expect(S.usedBorrow.credit).toBeUndefined();
    const stress0 = S.stress;
    run(p, "creditYes");
    expect(S.usedBorrow.credit).toBe(true);
    expect(S.stress).toBe(stress0 + 35);
    expect(S.scene).toBe("borrow");
  });

  it("签约定金：signOk 先弹协议核对清单（6 处逐项勾选）→ 全部核对才进付款确认 → payOk 才扣定金进网签 → 网签确认记录违约金后进贷款", () => {
    const { p, S } = atFundsShort();
    run(p, "bor:family", "bor:gjj", "bor:credit", "creditYes", "sign");
    expect(S.cash - 0 >= S.need).toBe(true); // 三条渠道补足后无缺口
    expect(S.scene).toBe("sign");
    const cash0 = S.cash;
    // signOk 先进居间协议核对清单，不是直接进付款确认
    run(p, "signOk");
    expect(p.calls).toContain("modal:agreement");
    expect(p.data.modal.type).toBe("agreement");
    expect(p.data.modal.agreement!.items).toHaveLength(8);
    expect(p.data.modal.agreement!.all).toBe(false);
    // 未全部核对时 agrOk 被拦截：不进入付款确认、不扣款、不离开签约屏
    run(p, "agrCheck:0");
    expect(p.data.modal.agreement!.checked[0]).toBe(true);
    expect(p.data.modal.agreement!.all).toBe(false);
    run(p, "agrOk");
    expect(p.data.modal.type).toBe("agreement");
    expect(S.cash).toBe(cash0);
    expect(S.scene).toBe("sign");
    // 逐一核对剩余条款 → 全部核对完成 → agrOk 才进付款确认（deposit，含违约风险警示）
    run(p, "agrCheck:1", "agrCheck:2", "agrCheck:3", "agrCheck:4", "agrCheck:5", "agrCheck:6", "agrCheck:7");
    expect(p.data.modal.agreement!.all).toBe(true);
    run(p, "agrOk");
    expect(p.calls).toContain("modal:pay");
    expect(p.data.modal.pay!.kind).toBe("deposit");
    expect(p.data.modal.pay!.warn).toBeTruthy(); // 违约风险并入付款确认醒目警示
    // 付款确认只是弹层：未真实扣款、未离开签约屏
    expect(S.cash).toBe(cash0);
    expect(S.scene).toBe("sign");
    // 付款确认 → 记录风险并真实扣定金，弹层关闭
    run(p, "payOk");
    expect(p.calls).toContain("confirmRisk:deposit");
    expect(S.cash).toBe(cash0 - S.deposit);
    expect(S.scene).toBe("signNet");
    expect(p.data.modal.type).toBe("");
    // 网签确认：记录违约金 20% 风险，随即弹「首付先付」付款确认（网签同步支付首付并办贷款）
    run(p, "signNetOk");
    expect(p.calls).toContain("confirmRisk:liquidated");
    expect(p.data.modal.pay!.kind).toBe("firstPay");
    expect(p.data.modal.pay!.warn).toBeTruthy(); // 网签后违约按房价 20% 警示
    const cash1 = S.cash;
    run(p, "payOk");
    expect(S.cash).toBe(cash1 - S.firstPay);
    expect(S.scene).toBe("loan"); // 首付先付入监管 → 办理贷款
  });

  it("定金付款确认可取消：payCancel 关闭弹层且不扣款", () => {
    const { p, S } = atFundsShort();
    run(p, "bor:family", "bor:gjj", "bor:credit", "creditYes", "sign", ...AGREE_TO_PAY);
    const cash0 = S.cash;
    expect(p.data.modal.pay!.kind).toBe("deposit");
    run(p, "payCancel");
    expect(S.cash).toBe(cash0);
    expect(S.scene).toBe("sign");
    expect(p.data.modal.type).toBe("");
    expect(p.calls).not.toContain("confirmRisk:deposit");
  });

  it("贷款审批通过 → 签贷款合同 → 递交过户（收件收据/审税）→ 缴税领证 → 交房 → 交割尾款（扣押分支）", () => {
    /* 现金 200 万（无需借款，支付全部首付税费后仍有结余，足以扣押尾款）：
       借款恰好补足缺口时，支付完全部首付税费后现金为 0，扣不起尾款（hoHold 会因现金不足被拦截） */
    const p = page();
    run(p, "role:first", "cash:p200", "pick:B", "qa:non-sh", "qa:permit:yes",
      "n1:chat", "n2:m5", "negoOk", "fee2", "lt:combo", "ltOk");
    const S = p.S;
    expect(S.scene).toBe("funds");
    expect(S.need).toBeLessThanOrEqual(S.cash); // 资金充足，无需筹钱
    // 签约（核对清单 + 付款确认扣定金）/网签付首付先付/送审/批贷
    run(p, "sign", ...AGREE_TO_PAY, "payOk", "signNetOk", "payOk", "loanOk", "lcOk");
    expect(S.scene).toBe("loanContract");
    // 20% 档：网签已付清全部首付（firstPay=deal×20%−定金），无剩余补足 → 确认合同直接递交过户
    expect(S.firstPay).toBeCloseTo(S.deal * 0.2 - S.deposit);
    run(p, "lcContractOk");
    expect(S.scene).toBe("transfer");
    // 递交材料 → 交易中心收件收据 → 审税等待（cal:deed）
    run(p, "trDone");
    expect(p.calls).toContain("cal:deed");
    expect(S.scene).toBe("deed");
    // 审税结果 → 缴税领证：trOk 弹付款确认，payOk 扣税费并出证（taxed，回 deed 显示领证态）
    const cash0 = S.cash;
    run(p, "trOk");
    expect(p.calls).toContain("modal:pay");
    expect(S.cash).toBe(cash0); // 未确认不扣款
    run(p, "payOk");
    expect(S.cash).toBe(cash0 - (S.taxes + S.netTax));
    expect(S.taxed).toBe(true);
    expect(S.scene).toBe("deed");
    expect(p.data.modal.type).toBe("");
    // 产证拍照给银行 → 放款完成 → 交房 → 扣押尾款 → 交割结算支付扣押尾款
    run(p, "deedOk");
    expect(S.scene).toBe("handover");
    run(p, "hoHold");
    expect(S.holdback).toBeCloseTo(Math.round(S.deal * 0.01 * 100) / 100);
    expect(S.scene).toBe("settle");
    const cash1 = S.cash;
    run(p, "stOk");
    expect(p.data.modal.pay!.kind).toBe("holdback");
    run(p, "payOk");
    expect(S.cash).toBe(cash1 - S.holdback);
    expect(S.scene).toBe("final");
  });

  it("时间快进仅交易流程展示：前期无快进；申贷 → cal:loanChk / 递交过户 → cal:deed / 领证放款 → cal:handover", () => {
    const { p } = atFundsShort();
    run(p, "bor:family", "bor:gjj", "bor:credit", "creditYes", "sign", ...AGREE_TO_PAY, "payOk", "signNetOk", "payOk", "loanOk", "lcOk");
    expect(p.calls).not.toContain("cal:select"); // 前期（现金/选房/资格/砍价/筹钱）均不再弹时间快进
    expect(p.calls).not.toContain("cal:nego1");
    const c0 = p.calls.indexOf("cal:loanChk"); // 送银行审批：贷款审批 7 天
    expect(c0).toBeGreaterThan(-1);
    run(p, "lcContractOk"); // 20% 档无剩余补足，直接递交过户
    run(p, "trDone");
    expect(p.calls.slice(c0)).toContain("cal:deed"); // 递交材料 → 审税 7 天 → 缴税领证
    run(p, "trOk", "payOk");
    run(p, "deedOk");
    expect(p.calls.slice(c0)).toContain("cal:handover"); // 领证/放款 → 交房（1 天）
  });

  it("模拟日历弹层 calOk 关闭", () => {
    const p = page();
    run(p, "role:first", "cash:p70", "pick:B");
    run(p, "calOk");
    expect(p.data.modal.type).toBe("");
  });
});

describe("流程阶段：风控追加首付（lcPay）", () => {
  /**
   * 走完整流程到「贷款审批 · 风控拦截」：F 房（550 万 · 不满 2 年）砍价 5% → 522.5 万 + 到手价 +
   * 组合贷 20 年，月供 23,108 元 > 收入一半 20,000 元。cashWan = 现金屏金额（万元）。
   */
  function atLoanChkRisk(cashWan: string): { p: FakePage; S: SimState } {
    const p = page();
    p.data.formCash = cashWan;
    run(p, "role:first", "cash:custom", "pick:F", "qa:non-sh", "qa:permit:no", "qa:years:m1-3",
      "n1:chat", "n2:m5", "n3NetYes", "taxCheck", "taxRiskOk",
      "fee2", "lt:combo", "ltOk", "sign", ...AGREE_TO_PAY, "payOk", "signNetOk", "payOk", "ly:20", "loanOk");
    return { p, S: p.S };
  }

  it("lcPay 追加首付后重算需现金，走完贷款合同/过户现金不为负", () => {
    const { p, S } = atLoanChkRisk("220");
    expect(S.scene).toBe("loanChk");
    expect(S.netTax).toBe(344850); // 到手价 · 522.5 万 × 6.6%
    const needBefore = S.need; // 154.67 万（首付 104.50 万 + 税费 15.68 万 + 转嫁 34.49 万）
    run(p, "lcPay");
    expect(S.down).toBe(1615000); // 104.50 万 + 风控要求追加 57 万
    expect(S.need).toBeCloseTo(needBefore + 570000); // 需现金随之抬到 211.67 万
    expect(S.need).toBeCloseTo(S.down + S.taxes + S.netTax); // 与 derive 同口径
    // 重审通过 → 贷款合同确认 → 追加的 57 万作为剩余首付补足入监管（网签已付 firstPay）
    run(p, "lcOk");
    expect(S.scene).toBe("loanContract");
    run(p, "lcContractOk");
    expect(p.data.modal.pay!.kind).toBe("restPay");
    run(p, "payOk");
    expect(S.cash).toBeGreaterThanOrEqual(0);
    expect(S.scene).toBe("transfer");
    run(p, "trDone");
    run(p, "trOk", "payOk");
    expect(S.scene).toBe("deed");
    expect(S.cash).toBeGreaterThanOrEqual(0);
    expect(S.cash).toBeCloseTo(2200000 - (S.down + S.taxes + S.netTax));
  });

  it("50% 档首付分期：网签付 20%（含定金 5%），贷款合同后补足 30%", () => {
    const p = page();
    // B 房（400 万，砍价 5% → 380 万），50% 档 → 首付 190 万
    run(p, "role:first", "cash:p200", "pick:B", "qa:hukou:sh", "qa:married:married",
      "n1:chat", "n2:m5", "negoOk", "fee2", "lt:combo", "ds:0.5", "ltOk", "sign",
      ...AGREE_TO_PAY, "payOk");
    const S = p.S;
    expect(S.downRate).toBe(0.5);
    expect(S.down).toBeCloseTo(S.deal * 0.5);
    // 网签首付先付 = 成交价 × 20% − 定金 5%（即再付 15%）
    run(p, "signNetOk");
    expect(p.data.modal.pay!.kind).toBe("firstPay");
    const firstExpected = S.deal * 0.2 - S.deposit;
    expect(S.firstPay).toBe(0); // 未确认支付前不记录
    run(p, "payOk");
    expect(S.firstPay).toBeCloseTo(firstExpected);
    expect(S.cash).toBeCloseTo(2000000 - S.deposit - firstExpected);
    expect(S.scene).toBe("loan");
    // 审批通过 → 贷款合同确认 → 补足剩余 30%（= down − deposit − firstPay）
    run(p, "loanOk", "lcOk");
    expect(S.scene).toBe("loanContract");
    const restExpected = S.down - S.deposit - S.firstPay;
    expect(restExpected).toBeCloseTo(S.deal * 0.3);
    run(p, "lcContractOk");
    expect(p.data.modal.pay!.kind).toBe("restPay");
    run(p, "payOk");
    expect(S.cash).toBeCloseTo(2000000 - S.down);
    expect(S.scene).toBe("transfer");
  });

  /**
   * 装修全流程 v4（quick 口径：f25 主流档 + 免费设计 + 13 项合同全没提）：
   * final 决策 → 预算屏 → 设计屏 → 合同屏（一项不写直接签约）→ 10 张上划卡 → 完成总账 → 回 final。
   * 锁住「合同没写 = 到站增项」的经济口径：13 张增项单 87,100 元 / 返工 27 天。
   */
  it("装修流程：13 项全没提 → 到站连环爆单 → 总账回 final（入口消失）", () => {
    const p = page();
    run(p, "role:first", "cash:p70", "pick:B", "qa:hukou:sh", "qa:married:married",
      "n1:chat", "n2:m5", "negoOk", "fee2", "lt:combo", "ltOk", "sign",
      ...AGREE_TO_PAY, "payOk", "signNetOk", "payOk", "loanOk", "lcOk",
      "lcContractOk", "trDone", "trOk", "payOk", "deedOk", "hoOk", "stOk");
    const S = p.S;
    expect(S.scene).toBe("final");
    expect(S.renovDone).toBe(false);
    // final 决策 → 预算屏（B 房 88㎡ × 2500 元/㎡ = 22 万）
    run(p, "renovGo");
    expect(S.scene).toBe("renovStart");
    run(p, "renovPick:f25");
    expect(S.renovPkg).toBe("f25");
    expect(S.renovBudget).toBe(220000);
    // 开工：交易完成次日（第 17 天）进设计屏
    run(p, "renovBegin");
    expect(S.scene).toBe("renovDesign");
    expect(S.renovDay).toBe(17);
    // 设计屏门槛：未选设计师档位时 renovNext 不响应（不可上划跳过）
    run(p, "renovNext:renovContract");
    expect(S.scene).toBe("renovDesign");
    run(p, "renovTier:free");
    expect(S.renovDesignFee).toBe(0);
    run(p, "renovNext:renovContract");
    expect(S.scene).toBe("renovContract");
    expect(S.renovDay).toBe(27); // 17 + 设计 10 天
    expect(contractPriceOf(S)).toBe(220000); // 一项没写：合同价看着低
    // 不勾任何项直接签约 → 13 项全部埋「增项单雷」
    run(p, "renovNext:renovDemo");
    expect(S.scene).toBe("renovDemo");
    expect(S.renovMines).toHaveLength(11); // 埋 13 张 − 拆除到站已结算 铲墙/砌墙 2 张
    // 拆除到站：铲墙 10,800 + 砌墙 2,400（返工 1 天）
    expect(S.renovBurst).toHaveLength(2);
    expect(S.renovExtra).toBe(13200);
    expect(S.renovDay).toBe(31); // 30 + 1 天返工
    // 逐张上划卡推进（CTA 与上划手势共用 renovNext；Warr 屏再推一跳进总账）
    run(p,
      "renovNext:renovElec", "renovNext:renovSeal", "renovNext:renovTileWood",
      "renovNext:renovPaint", "renovNext:renovMain", "renovNext:renovInstall",
      "renovNext:renovClean", "renovNext:renovAir", "renovNext:renovWarr",
      "renovNext:renovDone");
    expect(S.scene).toBe("renovDone");
    // 经济口径：13 张增项单合计 87,100；结账价 = 22 万 + 87,100 = 307,100
    expect(S.renovBills).toHaveLength(13);
    expect(S.renovExtra).toBe(87100);
    expect(paidTotalOf(S)).toBe(307100);
    expect(S.renovMines).toHaveLength(0); // 全部爆完
    expect(S.renovLog.filter((l) => l.text.indexOf("🧾") === 0)).toHaveLength(13);
    // 工期：17 开工 + 基础 103 天 + 返工 27 天 = 第 147 天完工入住；质保叙事 +1 年
    expect(S.renovDoneDay).toBe(147);
    expect(S.renovDay).toBe(147 + 365);
    // 总账 → 回 final，入口消失
    run(p, "renovFinish");
    expect(S.renovDone).toBe(true);
    expect(S.renovSkipped).toBe(false);
    expect(S.scene).toBe("final");
    run(p, "renovGo");
    expect(S.scene).toBe("final");
  });

  it("合同清单：写入累计合同价、明确不做当场埋风险雷、没提的到站按增项价爆单", () => {
    const p = page();
    run(p, "role:first", "cash:p70", "pick:B", "qa:hukou:sh", "qa:married:married",
      "n1:chat", "n2:m5", "negoOk", "fee2", "lt:combo", "ltOk", "sign",
      ...AGREE_TO_PAY, "payOk", "signNetOk", "payOk", "loanOk", "lcOk",
      "lcContractOk", "trDone", "trOk", "payOk", "deedOk", "hoOk", "stOk",
      "renovGo", "renovPick:f15", "renovBegin", "renovTier:free", "renovNext:renovContract");
    const S = p.S;
    expect(S.renovBudget).toBe(132000); // 88㎡ × 1500
    expect(contractPriceOf(S)).toBe(132000);
    // 写进合同：合同价按写入价上涨（清单上不预先标价）
    run(p, "renovCl:chan:do");
    expect(contractPriceOf(S)).toBe(140000); // + 铲墙 8,000
    // 明确不做（risk 项）：当场埋风险雷，不等到站
    run(p, "renovCl:wire:no");
    expect(S.renovMines).toHaveLength(1);
    expect(S.renovMines[0].at).toBe("Elec");
    expect(contractPriceOf(S)).toBe(140000); // 「不做」不涨价
    // 签约结算：其余 11 项没提 → 增项单雷（chan 已写、wire 已明确不做）
    run(p, "renovNext:renovDemo");
    expect(S.renovMines).toHaveLength(11); // 11 张没提 + 1 张风险雷 − 拆除到站已结算砌墙
    // 拆除到站：只有砌墙爆单（铲墙已写进合同）
    expect(S.renovBurst).toHaveLength(1);
    expect(S.renovExtra).toBe(2400);
    expect(S.renovBills[0].src).toContain("砌墙粉墙");
    // 水电到站：wire 风险雷爆单，溯源标记「你选了不做」
    run(p, "renovNext:renovElec");
    expect(S.renovExtra).toBe(2400 + 2700);
    expect(S.renovBills[1].stage).toBe("水电");
    expect(S.renovBills[1].src).toContain("你选了「明确不做」");
  });

  it("爆雷结算（renovArrive）：到站消耗 支出/工期/压力 并转入记事；质保先快照完工日再叙事 +365", () => {
    const p = page();
    const S = p.S;
    S.renovDay = 80;
    S.renovMines = [{ at: "Install", days: 2, lines: [["插座被挡", 6000]], text: "插座被柜子挡住", src: "点位没核对", hint: "交底对点位图", scope: null }];
    renovArrive(S, "Install");
    expect(S.renovExtra).toBe(6000);
    expect(S.renovDay).toBe(82);
    expect(S.renovBurst).toHaveLength(1);
    expect(S.renovBills[0].no).toBe("#01");
    expect(S.renovBills[0].stage).toBe("安装");
    expect(S.renovMines).toHaveLength(0);
    expect(S.renovLog[0].text).toContain("🧾");
    // 质保到站：先快照完工入住日（不含质保期内返工），再叙事推进一年
    const p2 = page();
    const S2 = p2.S;
    S2.renovDay = 120;
    S2.renovMines = [{ at: "Warr", days: 5, lines: [["铰链维修", 500]], text: "铰链响了", src: "易耗件", hint: "留证据", scope: null }];
    renovArrive(S2, "Warr");
    expect(S2.renovDoneDay).toBe(120);
    expect(S2.renovDay).toBe(120 + 365 + 5);
  });

  it("跳过装修：renovSkip 置 renovDone 并回 final", () => {
    const p = page();
    run(p, "role:first", "cash:p70", "pick:B", "qa:hukou:sh", "qa:married:married",
      "n1:chat", "n2:m5", "negoOk", "fee2", "lt:combo", "ltOk", "sign",
      ...AGREE_TO_PAY, "payOk", "signNetOk", "payOk", "loanOk", "lcOk",
      "lcContractOk", "trDone", "trOk", "payOk", "deedOk", "hoOk", "stOk", "renovSkip");
    expect(p.S.renovDone).toBe(true);
    expect(p.S.renovSkipped).toBe(true);
    expect(p.S.scene).toBe("final");
  });
});

describe("流程阶段：换房 / 尾款扣押的现金一致性（防死胡同）", () => {
  /** 推进到筹钱屏（B 房 380 万成交 · 现金 50 万 · 缺口 ≈37.4 万）. */
  function atBorrow(): { p: FakePage; S: SimState } {
    const p = page();
    run(p, "role:first", "cash:p50", "pick:B", "qa:non-sh", "qa:permit:yes",
      "n1:chat", "n2:m5", "negoOk", "fee2", "lt:combo", "ltOk", "bor:family");
    expect(p.S.borrowed).toBe(300000);
    expect(p.S.scene).toBe("borrow");
    return { p, S: p.S };
  }

  it("筹钱屏换房（changeHouse）：已借资金退还，现金回到初始值", () => {
    const { p, S } = atBorrow();
    run(p, "changeHouse");
    expect(S.scene).toBe("select");
    expect(S.cash).toBe(500000); // 借款 30 万退还，不再虚高
    expect(S.borrowed).toBe(0);
    expect(S.usedBorrow.family).toBeUndefined();
  });

  it("贷款被拒换房（lcChange）：定金 / 首付先付 / 借款全额退还，现金回到签约前", () => {
    const p = page();
    p.data.formCash = "220";
    /* F 房（550 万 · 不满 2 年）砍价 5% → 522.5 万 + 到手价 + 组合贷 20 年 → 月供超线被风控拦截 */
    run(p, "role:first", "cash:custom", "pick:F", "qa:non-sh", "qa:permit:no", "qa:years:m1-3",
      "n1:chat", "n2:m5", "n3NetYes", "taxCheck", "taxRiskOk",
      "fee2", "lt:combo", "ltOk", "sign", ...AGREE_TO_PAY, "payOk", "signNetOk", "payOk", "ly:20", "loanOk");
    expect(p.S.scene).toBe("loanChk");
    expect(p.S.firstPay).toBeGreaterThan(0); // 定金 + 网签首付先付已付
    run(p, "lcChange");
    expect(p.S.scene).toBe("select");
    expect(p.S.cash).toBe(2200000); // 全额退还，恢复签约前原始现金
    expect(p.S.borrowed).toBe(0);
    expect(p.S.firstPay).toBe(0);
    expect(p.S.holdback).toBe(0);
    expect(p.S.taxed).toBe(false);
  });

  it("尾款扣押现金不足：hoHold 被拦截留在交房屏，可改选直接结清，现金不为负", () => {
    const { p, S } = atBorrow();
    /* 借款恰补足缺口（B 房 380 万）：付清首付税费后现金恰为 0，扣不起 1% 尾款 */
    run(p, "bor:gjj", "bor:credit", "creditYes", "sign",
      ...AGREE_TO_PAY, "payOk", "signNetOk", "payOk", "loanOk", "lcOk",
      "lcContractOk", "trDone", "trOk", "payOk", "deedOk");
    expect(S.scene).toBe("handover");
    expect(S.cash).toBe(0);
    run(p, "hoHold");
    expect(S.holdback).toBe(0); // 拦截：现金不足无法扣押
    expect(S.scene).toBe("handover");
    run(p, "hoOk", "stOk");
    expect(S.scene).toBe("final");
    expect(S.cash).toBeGreaterThanOrEqual(0);
  });
});