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
import { emptyModal, netModal, payModal, taxRiskModal } from "../../pages/house-simulator/utils/render";

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

  private has(k: string): boolean {
    return k in this.data && this.data[k] !== undefined;
  }

  /** setData 支持 "modal.checked" 点路径. */
  setData(patch: Record<string, unknown>): void {
    for (const k of Object.keys(patch)) {
      if (k.indexOf(".") > 0) {
        const [a, b] = k.split(".");
        if (this.has(a)) {
          this.data[a][b] = patch[k];
        }
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

  /** 镜像 index.ts openPayModal：付款确认弹层，确认（payOk）后才真实扣款. */
  openPayModal(kind: "deposit" | "escrow" | "transfer"): void {
    this.setData({ modal: payModal(this.S, kind) });
    this.calls.push("modal:pay");
  }

  /** 镜像 index.ts openCalModal：模拟日历 · 时间快进（动画由页面驱动，桩仅记录） */
  openCalModal(to: string): void {
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

  it("签约定金：signOk 直接进付款确认（含违约风险警示，不扣款）→ payOk 才扣定金进网签 → 网签确认记录违约金后进贷款", () => {
    const { p, S } = atFundsShort();
    run(p, "bor:family", "bor:gjj", "bor:credit", "creditYes", "sign");
    expect(S.cash - 0 >= S.need).toBe(true); // 三条渠道补足后无缺口
    expect(S.scene).toBe("sign");
    const cash0 = S.cash;
    run(p, "signOk");
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
    // 网签确认：记录违约金 20% 风险，随即进入贷款申请
    run(p, "signNetOk");
    expect(p.calls).toContain("confirmRisk:liquidated");
    expect(S.scene).toBe("loan");
  });

  it("定金付款确认可取消：payCancel 关闭弹层且不扣款", () => {
    const { p, S } = atFundsShort();
    run(p, "bor:family", "bor:gjj", "bor:credit", "creditYes", "sign", "signOk");
    const cash0 = S.cash;
    expect(p.data.modal.pay!.kind).toBe("deposit");
    run(p, "payCancel");
    expect(S.cash).toBe(cash0);
    expect(S.scene).toBe("sign");
    expect(p.data.modal.type).toBe("");
    expect(p.calls).not.toContain("confirmRisk:deposit");
  });

  it("贷款审批通过 → 监管扣首付 → 过户扣税费 → 领证交房 → 扣押分支", () => {
    const { p, S } = atFundsShort();
    // 补足缺口并完成签约（付款确认扣定金）/网签/送审
    run(p, "bor:family", "bor:gjj", "bor:credit", "creditYes", "sign",
      "signOk", "payOk", "signNetOk", "loanOk", "lcOk");
    expect(S.scene).toBe("escrow");
    const cash0 = S.cash;
    // 付款确认：escrowOk 仅弹层，payOk 确认后冲抵定金扣首付尾款，且弹层关闭
    run(p, "escrowOk");
    expect(p.calls).toContain("modal:pay");
    expect(S.cash).toBe(cash0); // 未确认不扣款
    run(p, "payOk");
    expect(S.cash).toBe(cash0 - (S.down - S.deposit));
    expect(S.scene).toBe("transfer");
    expect(p.data.modal.type).toBe(""); // 确认支付后面临弹层关闭
    const cash1 = S.cash;
    run(p, "trOk");
    expect(p.calls).toContain("modal:pay");
    run(p, "payOk");
    expect(S.cash).toBe(cash1 - (S.taxes + S.netTax));
    expect(S.scene).toBe("deed");
    expect(p.data.modal.type).toBe("");
    run(p, "deedOk");
    expect(S.scene).toBe("handover");
    run(p, "hoHold");
    expect(S.holdback).toBeCloseTo(Math.round(S.deal * 0.01 * 100) / 100);
    expect(S.scene).toBe("final");
  });

  it("时间快进仅交易流程展示：前期无快进；申贷 → cal:loanChk / 缴税 → cal:deed / 领证 → cal:handover", () => {
    const { p } = atFundsShort();
    run(p, "bor:family", "bor:gjj", "bor:credit", "creditYes", "sign", "signOk", "payOk", "signNetOk", "loanOk", "lcOk");
    expect(p.calls).not.toContain("cal:select"); // 前期（现金/选房/资格/砍价/筹钱）均不再弹时间快进
    expect(p.calls).not.toContain("cal:nego1");
    const c0 = p.calls.indexOf("cal:loanChk"); // 送银行审批：贷款审批 7 天
    expect(c0).toBeGreaterThan(-1);
    run(p, "escrowOk", "payOk");
    run(p, "trOk", "payOk");
    expect(p.calls.slice(c0)).toContain("cal:deed"); // 过户缴税 → 过户审税 7 天 → 缴税出产证
    run(p, "deedOk");
    expect(p.calls.slice(c0)).toContain("cal:handover"); // 出证/放款 → 交房（1 天）
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
      "fee2", "lt:combo", "ltOk", "sign", "signOk", "payOk", "signNetOk", "ly:20", "loanOk");
    return { p, S: p.S };
  }

  it("lcPay 追加首付后重算需现金，走完监管/过户现金不为负", () => {
    const { p, S } = atLoanChkRisk("220");
    expect(S.scene).toBe("loanChk");
    expect(S.netTax).toBe(344850); // 到手价 · 522.5 万 × 6.6%
    const needBefore = S.need; // 154.67 万（首付 104.50 万 + 税费 15.68 万 + 转嫁 34.49 万）
    run(p, "lcPay");
    expect(S.down).toBe(1615000); // 104.50 万 + 风控要求追加 57 万
    expect(S.need).toBeCloseTo(needBefore + 570000); // 需现金随之抬到 211.67 万
    expect(S.need).toBeCloseTo(S.down + S.taxes + S.netTax); // 与 derive 同口径
    run(p, "escrowOk", "payOk"); // 弹付款确认并确认支付
    expect(S.cash).toBeGreaterThanOrEqual(0);
    run(p, "trOk", "payOk");
    expect(S.scene).toBe("deed");
    expect(S.cash).toBeGreaterThanOrEqual(0);
    expect(S.cash).toBeCloseTo(2200000 - (S.down + S.taxes + S.netTax));
  });
});