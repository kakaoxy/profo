/**
 * 购房模拟器 · 事件分发（handleAction）流程单测.
 *
 * 覆盖 handlers.ts / handlers-setup.ts / handlers-flow.ts / handlers-renov.ts 的完整事件链：
 * 身份 → 现金 → 选房（含自定义房源）→ 资格问答 → 砍价（含越线叫停 / 到手价）→ 中介费 →
 * 贷款方式与首付档 → 算账 → 筹钱 → 签约 / 网签（付款确认 + 12 项深坑埋雷）→ 贷款方案 / 审批 /
 * 合同 → 过户 → 缴税领证 → 交房（尾款扣押）→ 交割结算 → 装修（预算 / 设计 / 合同清单 / 上划卡 / 总账）.
 * 通过伪造 HandlerCtx（镜像 index.ts 的 render / nextScene / openPayModal 等薄方法）驱动，不依赖 Page/wx。
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createInitialState, HOUSES, ROLES } from "../../pages/house-simulator/utils/constants";
import type { SceneKey, SimState } from "../../pages/house-simulator/utils/constants";
import { contractPriceOf, paidTotalOf, RENOV_CONTRACT } from "../../pages/house-simulator/utils/renov-data";
import { elapsed, money, payAmount, round2, settleMines } from "../../pages/house-simulator/utils/calc";
import { handleAction } from "../../pages/house-simulator/utils/handlers";
import type { HandlerCtx, HandlerData } from "../../pages/house-simulator/utils/handlers";
import { renovArrive } from "../../pages/house-simulator/utils/handlers-renov";
import { emptyModal, payModal } from "../../pages/house-simulator/utils/render";
import type { PayKind } from "../../pages/house-simulator/utils/flow";

/* wx API 存根（handlers 内 toast 使用）. */
beforeAll(() => {
  (globalThis as unknown as Record<string, unknown>).wx = {
    showToast: () => {},
    getStorageSync: () => [],
    setStorageSync: () => {},
    removeStorageSync: () => {},
  };
});

/** 测试桩页面：记录调用序列，镜像 index.ts 的薄方法（含 nextScene 的记账顺序）. */
class FakePage implements HandlerCtx {
  calls: string[] = [];
  data: HandlerData = { formCash: "", custPrice: "", custArea: "", custBase: "", modal: emptyModal() };

  constructor(public S: SimState) {}

  setData(patch: Record<string, unknown>): void {
    Object.assign(this.data, patch);
  }

  render(): void {
    this.calls.push("render");
  }

  /** 镜像 index.ts nextScene：记录走过的屏 → 结算到站学费单 → 重算已走天数 → 重绘. */
  nextScene(k: SceneKey): void {
    this.S.scene = k;
    if (this.S.walked.indexOf(k) < 0) {
      this.S.walked.push(k);
    }
    settleMines(this.S, k);
    this.S.day = elapsed(this.S);
    this.calls.push("next:" + k);
    this.render();
  }

  resetAll(): void {
    this.calls.push("resetAll");
  }

  openPayModal(kind: PayKind): void {
    this.setData({ modal: payModal(this.S, kind, payAmount(this.S, kind)) });
    this.calls.push("modal:pay:" + kind);
  }

  closeModal(): void {
    this.setData({ modal: emptyModal() });
    this.calls.push("modal:close");
  }

  confirmRisk(type: string, _detail: string): void {
    this.calls.push("confirmRisk:" + type);
  }
}

function page(): FakePage {
  return new FakePage(createInitialState());
}

function run(p: FakePage, ...acts: string[]): void {
  for (const a of acts) {
    handleAction(p, p.S, a);
  }
}

/** 前置导航：开场 → 身份 → 现金 → 选房（落定房源），停在选房屏. */
function toSelect(cashWan: number, houseId: string): FakePage {
  const p = page();
  run(p, "next", "role:first", "next", "cash:" + cashWan, "next", "house:" + houseId);
  expect(p.S.scene).toBe("select");
  expect(p.S.house!.id).toBe(houseId);
  return p;
}

/** 选房 → 资格核验（沪籍答一题即出结果）→ 砍价第一轮. */
function toNego1(cashWan: number, houseId: string): FakePage {
  const p = toSelect(cashWan, houseId);
  run(p, "next", "qa:hukou:sh", "next");
  expect(p.S.scene).toBe("nego1");
  return p;
}

/** 砍价两轮到成交屏（第一轮 chat，第二轮按房东底线成交，含税价）. */
function toNego3(cashWan: number, houseId: string): FakePage {
  const p = toNego1(cashWan, houseId);
  run(p, "n1:chat", "n2:bottom");
  expect(p.S.scene).toBe("nego3");
  return p;
}

/** 推到算账屏（指定房源成交 · 现金 cashWan 万 · 组合贷 2% 中介费）. */
function toFunds(cashWan: number, houseId = "B"): FakePage {
  const p = toNego3(cashWan, houseId);
  run(p, "next", "fee:0.02", "lt:combo", "next");
  expect(p.S.scene).toBe("funds");
  return p;
}

/** 推到资金缺口屏（B 房 380 万成交 · 现金 50 万 · 需现金 87.408 万 → 缺口 37.408 万）. */
function toFundsShort(): FakePage {
  const p = toFunds(50);
  expect(p.S.need).toBe(874080);
  return p;
}

/** 推到签约屏（现金不足时先经筹钱补齐三条渠道）. */
function toSign(cashWan = 50, houseId = "B"): FakePage {
  const p = toFunds(cashWan, houseId);
  run(p, "next"); // funds → borrow（有缺口）或 sign
  if (p.S.scene === "borrow") {
    run(p, "bor:family", "bor:gjj", "bor:credit", "next");
  }
  expect(p.S.scene).toBe("sign");
  return p;
}

/** 推到资金充足的签约屏（现金 200 万，无需筹钱）. */
function toSignRich(): FakePage {
  return toSign(200);
}

describe("前置阶段：身份 / 现金 / 选房 / 自定义房源 / 资格问答", () => {
  it("reset → 交给页面 resetAll（不继续走流程阶段）", () => {
    const p = page();
    run(p, "reset");
    expect(p.calls).toContain("resetAll");
    expect(p.S.scene).toBe("start");
  });

  it("role:first 落定身份并把中介费报价重置回 2%（停留身份屏）", () => {
    const p = page();
    run(p, "next"); // 开场 → 身份屏
    expect(p.S.scene).toBe("role");
    p.S.agentRate = 0.01;
    run(p, "role:first");
    expect(p.S.role!.k).toBe("first");
    expect(p.S.agentRate).toBe(0.02);
    expect(p.S.scene).toBe("role"); // 停留本屏，主按钮推进
    expect(p.calls).toContain("render");
  });

  it("cash:70 落定现金并清空已筹；非法金额被拦截", () => {
    const p = page();
    run(p, "next", "role:first", "next");
    expect(p.S.scene).toBe("cash");
    run(p, "cash:70");
    expect(p.S.cash).toBe(700000);
    expect(p.S.cashSet).toBe(true);
    p.S.borrowed = 100000;
    run(p, "cash:300");
    expect(p.S.cash).toBe(3000000);
    expect(p.S.borrowed).toBe(0);
    run(p, "cash:abc");
    expect(p.S.cash).toBe(3000000);
  });

  it("house:B 落定房源并重算税费；主按钮从选房屏直达资格核验", () => {
    const p = toSelect(200, "B");
    expect(p.S.deal).toBe(4000000);
    run(p, "next");
    expect(p.S.scene).toBe("qa"); // 选房 + 已选房源 → 直奔资格核验
  });

  it("house:ZZ 未知房源被忽略（消费动作但不改状态）", () => {
    const p = page();
    run(p, "next", "role:first", "next", "cash:200", "next");
    expect(p.S.scene).toBe("select");
    run(p, "house:ZZ");
    expect(p.S.house).toBeNull();
    expect(p.S.scene).toBe("select");
  });

  it("看房屏点「自定义房源」卡 → 自定义屏；四组口径点选即定稿（输入框为空时沿用默认口径）", () => {
    const p = page();
    run(p, "next", "role:first", "next", "cash:200", "next", "house:custom");
    expect(p.S.scene).toBe("custom");
    run(p, "ring:外", "cy:2", "cu:0", "ca:buy");
    const c = p.S.custom!;
    expect(p.S.house).toBeNull();
    expect(c.ring).toBe("外");
    expect(c.holdYears).toBe(2);
    expect(c.unique).toBe(false);
    expect(c.acq).toBe("buy");
    expect(c.price).toBe(4500000); // 未输入 → 默认 450 万
    expect(c.tag).toBe("满二不唯一");
    run(p, "ca:inherit");
    expect(p.S.custom!.acq).toBe("inherit");
    expect(p.S.custom!.tag).toContain("继承所得");
  });

  it("自定义房源输入框：挂牌价 / 面积 / 原值落定", () => {
    const p = page();
    run(p, "next", "role:first", "next", "cash:200", "next", "house:custom");
    p.data.custPrice = "360";
    p.data.custArea = "90";
    p.data.custBase = "120";
    run(p, "ca:inherit");
    expect(p.S.custom!.price).toBe(3600000);
    expect(p.S.custom!.areaNum).toBe(90);
    expect(p.S.custom!.base).toBe(1200000);
  });

  it("资格问答：沪籍一题即出结果；非沪籍逐题推进到社保年限才出结果", () => {
    const sh = toSelect(200, "B");
    run(sh, "next");
    expect(sh.S.scene).toBe("qa");
    run(sh, "qa:hukou:sh");
    expect(sh.S.judge!.ok).toBe(true);
    expect(sh.S.scene).toBe("blocked");

    const non = toSelect(200, "B");
    run(non, "next", "qa:hukou:non-sh");
    expect(non.S.qaProg).toBe(1);
    expect(non.S.scene).toBe("qa");
    run(non, "qa:permit:no");
    expect(non.S.qaProg).toBe(2);
    run(non, "qa:years:m3p");
    expect(non.S.judge!.ok).toBe(true);
    expect(non.S.scene).toBe("blocked");

    const permit = page();
    run(permit, "next", "role:invest", "next", "cash:200", "next", "house:B", "next",
      "qa:hukou:non-sh", "qa:permit:yes");
    expect(permit.S.judge!.ok).toBe(false); // 名下 1 套 → 居住证满 5 年全市限购 1 套
    expect(permit.S.scene).toBe("blocked");
  });

  it("requalify 重核资格 / backSelect 退回选房（退还已筹借款）", () => {
    const p = toSelect(200, "B");
    run(p, "next", "qa:hukou:non-sh", "qa:permit:no");
    run(p, "requalify");
    expect(p.S.ans).toEqual({});
    expect(p.S.judge).toBeNull();
    expect(p.S.scene).toBe("qa");

    p.S.borrowed = 300000;
    p.S.cash += 300000;
    run(p, "backSelect");
    expect(p.S.scene).toBe("select");
    expect(p.S.borrowed).toBe(0);
    expect(p.S.cash).toBe(2000000);
    expect(p.S.deal).toBe(0);
  });
});

describe("流程阶段：砍价 / 到手价 / 中介费 / 贷款方式", () => {
  it("n1:hard 越过底线（B 房 5%）：成交价封顶底线价，第二轮只剩叫停出口", () => {
    const p = toNego1(200, "B");
    run(p, "n1:hard");
    expect(p.S.negoCap).toBe(true);
    expect(p.S.slash).toBe(0.05);
    expect(p.S.deal).toBe(3800000);
    expect(p.S.scene).toBe("nego2");
  });

  it("n2Accept 接受底价 → 成交屏（越线态清空）", () => {
    const p = toNego1(200, "B");
    run(p, "n1:hard", "n2Accept");
    expect(p.S.negoCap).toBe(false);
    expect(p.S.scene).toBe("nego3");
    expect(p.S.negoR2).toBeNull();
  });

  it("n2:bottom 按房东底线成交（成交价 = 挂牌价 ×(1−底线)）", () => {
    const p = toNego3(200, "D"); // D 房底线 8%
    run(p, "n1:soft", "n2:bottom");
    expect(p.S.slash).toBe(0.08);
    expect(p.S.deal).toBeCloseTo(3000000 * 0.92);
  });

  it("满五唯一无卖方税费：直接确认成交进中介费；fee:0.01 压到 1%", () => {
    const p = toNego3(200, "B");
    expect(p.S.vat + p.S.sellerTax).toBe(0);
    run(p, "next");
    expect(p.S.scene).toBe("feeNego");
    run(p, "fee:0.01");
    expect(p.S.agentRate).toBe(0.01);
    expect(p.S.agentFee).toBe(38000);
    expect(p.S.scene).toBe("loanType");
  });

  it("未满 2 年出现「到手价」：net:yes 记录税费风险并转嫁；net:no 按含税价", () => {
    const yes = toNego3(400, "F"); // F 550 万 · 不满 2 年
    const sellerTax = yes.S.vat + yes.S.sellerTax;
    expect(sellerTax).toBeGreaterThan(0);
    run(yes, "net:yes");
    expect(yes.S.netDeal).toBe(true);
    expect(yes.S.netTax).toBe(yes.S.vat + yes.S.vatAdd + yes.S.sellerTax);
    expect(yes.calls).toContain("confirmRisk:netTax");
    expect(yes.S.scene).toBe("feeNego");

    const no = toNego3(400, "F");
    run(no, "net:no");
    expect(no.S.netDeal).toBe(false);
    expect(no.S.netTax).toBe(0);
    expect(no.S.scene).toBe("feeNego");

    const ask = toNego3(400, "F");
    run(ask, "net:ask");
    expect(ask.S.netDeal).toBe(false);
    expect(ask.S.scene).toBe("feeNego");
  });

  it("lt / ds / ly 就地改方案（停留本屏），并重算月供与需现金", () => {
    const p = toNego3(200, "B");
    run(p, "next", "fee:0.02");
    run(p, "lt:comm");
    expect(p.S.loanType).toBe("comm");
    expect(p.S.downRate).toBe(0.15); // 首套商贷
    expect(p.S.scene).toBe("loanType");
    run(p, "ds:0.5");
    expect(p.S.downRate).toBe(0.5);
    expect(p.S.down).toBe(round2(p.S.deal * 0.5));
    expect(p.S.scene).toBe("loanType");
    run(p, "next");
    expect(p.S.scene).toBe("funds");
    run(p, "ly:20");
    expect(p.S.loanYears).toBe(20);
  });
});

describe("流程阶段：算账 / 筹钱（含换房退款与换房出口）", () => {
  it("资金充足 next → 签约；缺口 next → 筹钱；backLoanType 回贷款方式", () => {
    const rich = toFunds(200);
    run(rich, "fundsNext");
    expect(rich.S.scene).toBe("sign");
    run(rich, "backLoanType");
    expect(rich.S.scene).toBe("loanType");

    const short = toFundsShort();
    run(short, "fundsNext");
    expect(short.S.scene).toBe("borrow");
  });

  it("bor:family / bor:gjj / bor:credit 各按缺口与渠道上限补入，再点一次退回该渠道", () => {
    const p = toFundsShort();
    run(p, "next"); // funds → borrow
    expect(p.S.scene).toBe("borrow");
    const before = p.S.cash;
    run(p, "bor:family");
    expect(p.S.borrowed).toBe(300000); // family 上限 30 万
    expect(p.S.cash).toBe(before + 300000);
    expect(p.S.usedBorrow.family).toBe(300000);

    run(p, "bor:family"); // 再点一次 → 退回
    expect(p.S.cash).toBe(before);
    expect(p.S.borrowed).toBe(0);
    expect(p.S.usedBorrow.family).toBeUndefined();

    run(p, "bor:gjj", "bor:credit");
    expect(p.S.borrowed).toBe(374080); // 补齐缺口为止（20 万 + 17.408 万）
    expect(p.S.usedBorrow.gjj).toBe(200000);
    expect(p.S.usedBorrow.credit).toBe(174080);
    run(p, "bor:credit"); // 缺口已补齐 → 退回
    expect(p.S.usedBorrow.credit).toBeUndefined();
    run(p, "bor:credit");
    expect(p.S.cash).toBe(before + 374080);
    run(p, "next"); // 缺口已补齐 → 签约
    expect(p.S.scene).toBe("sign");
  });

  it("缺口超出三渠道上限：借款动作不再补入，changeHouse 退还已筹并回流选房", () => {
    const p = toFunds(50, "E");
    run(p, "next");
    expect(p.S.scene).toBe("borrow");
    run(p, "bor:family", "bor:gjj", "bor:credit");
    expect(p.S.borrowed).toBe(700000); // 三渠道合计上限 70 万
    run(p, "bor:family"); // 退回一条验证现金复原
    expect(p.S.cash).toBe(500000 + 700000 - 300000);
    run(p, "changeHouse");
    expect(p.S.scene).toBe("select");
    expect(p.S.borrowed).toBe(0);
    expect(p.S.cash).toBe(500000);
    expect(p.S.deal).toBe(0);
  });
});

describe("流程阶段：签约 / 网签（付款确认 + 12 项深坑）", () => {
  it("签约：pay:deposit 只弹付款确认（不扣款），payOk 才扣款记账并进网签", () => {
    const p = toSignRich();
    const cash0 = p.S.cash;
    run(p, "pay:deposit");
    expect(p.calls).toContain("modal:pay:deposit");
    expect(p.data.modal.pay!.kind).toBe("deposit");
    expect(p.data.modal.pay!.warn).toBeTruthy(); // 定金罚则警示
    expect(p.S.cash).toBe(cash0);
    expect(p.S.scene).toBe("sign");
    run(p, "payOk");
    expect(p.calls).toContain("confirmRisk:deposit");
    expect(p.S.cash).toBe(cash0 - p.S.deposit);
    expect(p.S.paid).toBe(p.S.deposit);
    expect(p.S.scene).toBe("signNet");
    expect(p.data.modal.type).toBe("");

    run(p, "pay:firstPay");
    expect(p.data.modal.pay!.warn).toBeTruthy(); // 网签后违约按房价 20%
    const cash1 = p.S.cash;
    run(p, "payOk");
    expect(p.calls).toContain("confirmRisk:liquidated");
    expect(p.S.firstPay).toBeCloseTo(p.S.deal * 0.2 - p.S.deposit);
    expect(p.S.cash).toBe(cash1 - p.S.firstPay);
    expect(p.S.scene).toBe("loan");
  });

  it("payCancel 关闭弹层且不扣款", () => {
    const p = toSignRich();
    const cash0 = p.S.cash;
    run(p, "pay:deposit", "payCancel");
    expect(p.S.cash).toBe(cash0);
    expect(p.S.scene).toBe("sign");
    expect(p.data.modal.type).toBe("");
    expect(p.calls).not.toContain("confirmRisk:deposit");
  });

  it("cl:<k>:<do|no> 逐项结论；fastSign 把本屏 6 项一次标成「先不写」", () => {
    const p = toSignRich();
    run(p, "cl:chan:do");
    expect(p.S.con.chan).toBe("do");
    run(p, "cl:chan:no");
    expect(p.S.con.chan).toBe("no");
    run(p, "cl:chan:bad"); // 非法取值被忽略
    expect(p.S.con.chan).toBe("no");

    run(p, "fastSign");
    const signHalf = ["chan", "owner", "school", "net", "deposit", "paynode"];
    expect(signHalf.every((k) => p.S.con[k] === "no")).toBe(true);
    expect(p.S.con.breach).toBeUndefined(); // signNet 的 6 项不受影响
  });

  it("网签屏 fastSign 只覆盖「合同里写死」那 6 项", () => {
    const p = toSignRich();
    run(p, "pay:deposit", "payOk", "fastSign");
    expect(p.S.scene).toBe("signNet");
    const netHalf = ["breach", "date", "loanfail", "holdback", "arrears", "stuff"];
    expect(netHalf.every((k) => p.S.con[k] === "no")).toBe(true);
    expect(p.S.con.chan).toBeUndefined();
  });

  it("埋的雷到站爆成学费单：签约全「先不写」→ 贷款屏爆产权人、审批屏爆违约金与批贷条款", () => {
    const p = toSignRich();
    run(p, "fastSign", "pay:deposit", "payOk", "fastSign", "pay:firstPay", "payOk");
    expect(p.S.scene).toBe("loan");
    expect(p.S.lessons.map((l) => l.k)).toEqual(["owner"]); // owner.omit.at = loan
    expect(p.S.burst).toHaveLength(1);
    expect(p.S.lessons[0].days).toBe(7);
    expect(p.S.day).toBe(elapsed(p.S));

    run(p, "next");
    expect(p.S.scene).toBe("loanChk");
    expect(p.S.lessons.map((l) => l.k).sort()).toEqual(["breach", "loanfail", "owner"]);
    expect(p.S.burst).toHaveLength(2);
    expect(p.S.burst.every((l) => l.cost === 0)).toBe(true); // 两项都是「钱解决不了」
  });

  it("全款：网签付 30% 房款后直达贷款合同屏（跳过贷款方案与审批）", () => {
    const p = toSign(500);
    run(p, "ds:1");
    expect(p.S.downRate).toBe(1);
    run(p, "pay:deposit", "payOk");
    expect(p.S.firstPay).toBe(0); // 未确认支付前不记录
    const cash0 = p.S.cash;
    run(p, "pay:firstPay", "payOk");
    expect(p.S.firstPay).toBeCloseTo(p.S.deal * 0.3);
    expect(p.S.cash).toBeCloseTo(cash0 - p.S.deal * 0.3, 0);
    expect(p.S.scene).toBe("loanContract");
    expect(p.S.loan.monthly).toBe(0);
    run(p, "pay:restPay");
    expect(p.data.modal.pay!.kind).toBe("restPay");
    expect(p.data.modal.pay!.pay).toBeDefined();
    run(p, "payOk");
    expect(p.S.scene).toBe("transfer");
    expect(p.S.cash).toBeGreaterThanOrEqual(0);
    expect(p.S.cash).toBeCloseTo(5000000 - p.S.down, 0); // 定金 + 先付 + 补足 = 房款首付
  });

  it("资格不过：网签屏被真实拦下（无法网签），不摆付款主按钮", () => {
    const p = page();
    run(p, "next", "role:invest", "next", "cash:600", "next", "house:B", "next",
      "qa:hukou:non-sh", "qa:permit:yes", "next",
      "n1:chat", "n2:bottom", "net:no", "fee:0.02", "lt:combo", "next", "next",
      "pay:deposit", "payOk");
    expect(p.S.scene).toBe("signNet");
    expect(p.S.judge!.ok).toBe(false);
  });
});

describe("流程阶段：贷款审批风控 / 合同 / 过户 / 交房 / 结算", () => {
  /** 推到贷款审批风控拦截（F 房 522.5 万 · 组合贷 10 年 → 月供超收入一半）. */
  function toLoanChkRisk(cashWan: number): FakePage {
    const p = toNego3(cashWan, "F");
    run(p, "net:no", "fee:0.02", "lt:combo", "next", "next",
      "pay:deposit", "payOk", "pay:firstPay", "payOk", "ly:10", "next");
    expect(p.S.scene).toBe("loanChk");
    expect(p.S.loanYears).toBe(10);
    return p;
  }

  it("lc:pay 追加首付提档后重送审；现金仍不够则回退并提示换房", () => {
    const ok = toLoanChkRisk(600);
    expect(ok.S.loanYears).toBe(10);
    const need0 = ok.S.need;
    run(ok, "lc:pay");
    expect(ok.S.downRate).toBe(0.7); // 10 年下第一档能压回风控线
    expect(ok.S.need).toBeGreaterThan(need0);
    expect(ok.S.loanRejected).toBe(false);
    expect(ok.S.scene).toBe("loanChk");

    const poor = toLoanChkRisk(400);
    run(poor, "lc:pay");
    expect(poor.S.downRate).toBe(0.2); // 提档后仍差钱 → 回退
    expect(poor.S.need).toBeCloseTo(1201830);
  });

  it("lc:long 拉长到 30 年月供降档；lc:stick 坚持硬上被拒批", () => {
    const p = toLoanChkRisk(600);
    run(p, "lc:long");
    expect(p.S.loanYears).toBe(30);
    expect(p.S.loanRejected).toBe(false);
    expect(p.S.loan.monthly / 40000).toBeLessThanOrEqual(0.5);

    const stick = toLoanChkRisk(600);
    run(stick, "lc:stick");
    expect(stick.S.loanRejected).toBe(true);
    expect(stick.S.scene).toBe("loanChk");
  });

  it("lc:change 换房：回选房并清掉已签结论与已出款记账", () => {
    const p = toLoanChkRisk(600);
    expect(p.S.firstPay).toBeGreaterThan(0);
    run(p, "lc:change");
    expect(p.S.scene).toBe("select");
    expect(p.S.deal).toBe(0);
    expect(p.S.deposit).toBe(0);
    expect(p.S.firstPay).toBe(0);
    expect(p.S.paid).toBe(0);
    expect(p.S.con).toEqual({});
    expect(p.S.borrowed).toBe(0);
  });

  it("审批通过 → 贷款合同补足剩余首付 → 过户递交 → 缴税领证 → 交房扣押尾款 → 结算（扣押不占买方现金）", () => {
    const p = toLoanChkRisk(600);
    run(p, "lc:pay", "next");
    expect(p.S.scene).toBe("loanContract");
    const rest = Math.max(0, p.S.down - p.S.deposit - p.S.firstPay);
    run(p, "pay:restPay");
    expect(p.data.modal.pay!.kind).toBe("restPay");
    const cash0 = p.S.cash;
    run(p, "payOk");
    expect(p.S.cash).toBeCloseTo(cash0 - rest, 0);
    expect(p.S.scene).toBe("transfer");

    run(p, "next");
    expect(p.S.scene).toBe("deed");
    const tax = payAmount(p.S, "transfer");
    run(p, "pay:transfer");
    expect(p.data.modal.pay!.kind).toBe("transfer");
    const cash1 = p.S.cash;
    run(p, "payOk");
    expect(p.S.cash).toBeCloseTo(cash1 - tax, 0);
    expect(p.S.scene).toBe("handover");

    run(p, "ho:hold");
    expect(p.S.handHold).toBe(true);
    expect(p.S.hand.util).toBe(false);
    expect(p.S.scene).toBe("settle");
    run(p, "pay:holdback");
    const modal = p.data.modal.pay!;
    expect(modal.kind).toBe("holdback");
    expect(modal.after).toBe(modal.now); // 现金不变（从卖方房款中扣留）
    const cash2 = p.S.cash;
    const paid2 = p.S.paid;
    run(p, "payOk");
    expect(p.S.cash).toBe(cash2); // 扣押不占用买方现金
    expect(p.S.paid).toBe(paid2); // 也不计入已出款
    expect(p.S.scene).toBe("final");
  });

  it("ho:ok 逐项结清不扣押：结算屏 next 直达总账，全程现金不为负", () => {
    const p = toLoanChkRisk(600);
    run(p, "lc:pay", "next", "pay:restPay", "payOk", "next", "pay:transfer", "payOk", "ho:ok");
    expect(p.S.handHold).toBe(false);
    expect(p.S.scene).toBe("settle");
    run(p, "next");
    expect(p.S.scene).toBe("final");
    expect(p.S.cash).toBeGreaterThanOrEqual(0);
    expect(p.S.cash).toBeCloseTo(6000000 - p.S.paid, 0);
    expect(money(p.S).total).toBe(Math.round((p.S.need + money(p.S).lessons) * 100) / 100);
  });
});

describe("装修阶段：预算 / 设计 / 合同清单 / 上划卡 / 总账", () => {
  /** 走完购房全流程到总账屏（B 房 88㎡ · 现金 200 万 · 沪籍首套组合贷）. */
  function toFinal(): FakePage {
    const p = page();
    run(p, "role:first", "next", "cash:200", "next", "house:B", "next", "qa:hukou:sh", "next",
      "n1:chat", "n2:bottom", "next", "fee:0.02", "lt:combo", "next", "next",
      "pay:deposit", "payOk", "pay:firstPay", "payOk", "next", "next",
      "pay:restPay", "payOk", "next", "pay:transfer", "payOk", "ho:ok", "next");
    expect(p.S.scene).toBe("final");
    return p;
  }

  it("B 房 88㎡ × 主流档 3000 元/㎡ = 26.4 万；开工日为交易完成次日", () => {
    const p = toFinal();
    const doneDay = p.S.day;
    run(p, "renovGo");
    expect(p.S.scene).toBe("renovStart");
    run(p, "renovPick:f30");
    expect(p.S.renovPkg).toBe("f30");
    expect(p.S.renovBudget).toBe(264000);
    run(p, "renovBegin");
    expect(p.S.scene).toBe("renovDesign");
    expect(p.S.renovStartDay).toBe(doneDay);
    expect(p.S.renovDay).toBe(doneDay + 1);
  });

  it("设计屏：档位未选不可上划；档位可改选，设计费随最后一次选择重算", () => {
    const p = toFinal();
    run(p, "renovGo", "renovPick:f30", "renovBegin");
    run(p, "renovNext:renovContract");
    expect(p.S.scene).toBe("renovDesign"); // 决策屏门槛
    run(p, "renovTier:d400");
    expect(p.S.renovDesignFee).toBe(15000);
    run(p, "renovTier:free");
    expect(p.S.renovDesignFee).toBe(0);
    run(p, "renovNext:renovContract");
    expect(p.S.scene).toBe("renovContract");
    expect(p.S.renovDay).toBe(p.S.renovStartDay + 1 + 10);
  });

  it("13 项一项没提 → 到站连环爆单：拆除 3 张 / 合计 103,000 元 / 返工 60 天", () => {
    const p = toFinal();
    run(p, "renovGo", "renovPick:f30", "renovBegin", "renovTier:free", "renovNext:renovContract");
    expect(contractPriceOf(p.S)).toBe(264000); // 一项没写：合同价看着低
    run(p, "renovNext:renovDemo");
    expect(p.S.scene).toBe("renovDemo");
    expect(p.S.renovMines).toHaveLength(10); // 13 − 拆除到站已结算 3 张
    expect(p.S.renovBurst).toHaveLength(3);
    expect(p.S.renovExtra).toBe(21100); // 铲墙 13,500 + 砌墙 2,400 + 垃圾清运 5,200
    const start = p.S.renovStartDay;
    expect(p.S.renovDay).toBe(start + 1 + 10 + 3 + 4); // 计划 13 天 + 拆除返工 4 天

    run(p, "renovNext:renovMain", "renovNext:renovElec", "renovNext:renovSeal",
      "renovNext:renovTileWood", "renovNext:renovPaint", "renovNext:renovInstall",
      "renovNext:renovClean", "renovNext:renovAir", "renovNext:renovWarr", "renovNext:renovWarr");
    expect(p.S.scene).toBe("renovDone");
    expect(p.S.renovBills).toHaveLength(13);
    expect(p.S.renovExtra).toBe(103000);
    expect(paidTotalOf(p.S)).toBe(264000 + 103000);
    expect(p.S.renovMines).toHaveLength(0);
    expect(p.S.renovDoneDay).toBe(start + 104 + 60); // 计划 104 天 + 返工 60 天
    run(p, "renovFinish");
    expect(p.S.renovDone).toBe(true);
    expect(p.S.renovSkipped).toBe(false);
    expect(p.S.scene).toBe("final");
    run(p, "renovGo");
    expect(p.S.scene).toBe("final"); // 入口消失
  });

  it("合同清单：写进合同按价累计；明确不做当场埋雷、改点写进合同撤雷；一键写清只覆盖未决项", () => {
    const p = toFinal();
    run(p, "renovGo", "renovPick:f20", "renovBegin", "renovTier:free", "renovNext:renovContract");
    expect(p.S.renovBudget).toBe(176000); // 88㎡ × 2000
    run(p, "renovCl:chan:do");
    expect(contractPriceOf(p.S)).toBe(186000); // + 铲墙 10,000
    run(p, "renovCl:junk:no");
    expect(p.S.renovMines).toHaveLength(1);
    expect(p.S.renovMines[0].at).toBe("Demo");
    run(p, "renovCl:junk:no", "renovCl:junk:no"); // 反复点不重复埋雷
    expect(p.S.renovMines).toHaveLength(1);
    run(p, "renovCl:junk:do"); // 改主意 → 撤雷（但不重复计价：junk 只算一次）
    expect(p.S.renovMines).toHaveLength(0);
    expect(contractPriceOf(p.S)).toBe(186000 + 3200);

    run(p, "renovWriteRisk");
    expect(RENOV_CONTRACT.filter((it) => it.noKind === "risk" && !p.S.renovCon[it.k])).toHaveLength(0);
    expect(p.S.renovCon.chan).toBe("do"); // 已定结论不被覆盖
    /* 8 项 risk 写清：铲墙 10,000 + 垃圾清运 3,200 + 入户线 2,000 计价（其余 doPrice = 0） */
    expect(contractPriceOf(p.S)).toBe(186000 + 3200 + 0 + 0 + 2000 + 0 + 0 + 0);
  });

  it("半包：自购主材项只列清单不计合同价；签约另埋 3 笔自购雷", () => {
    const p = toFinal();
    run(p, "renovGo", "renovPick:half", "renovBegin", "renovTier:free", "renovNext:renovContract");
    expect(p.S.renovBudget).toBe(88000);
    run(p, ...RENOV_CONTRACT.map((it) => "renovCl:" + it.k + ":do"));
    expect(contractPriceOf(p.S)).toBe(88000 + 17000); // 半包 halfOwn 只列清单
    run(p, "renovNext:renovDemo");
    expect(p.S.renovBills).toHaveLength(0);
    expect(p.S.renovMines).toHaveLength(3);
    run(p, "renovNext:renovMain", "renovNext:renovElec", "renovNext:renovSeal",
      "renovNext:renovTileWood", "renovNext:renovPaint", "renovNext:renovInstall",
      "renovNext:renovClean", "renovNext:renovAir", "renovNext:renovWarr", "renovNext:renovWarr");
    expect(p.S.renovBills).toHaveLength(3);
    expect(p.S.renovExtra).toBe(8400); // 3,200 + 2,400 + 2,800
    expect(p.S.renovDoneDay).toBe(p.S.renovStartDay + 104 + 21);
  });

  it("renovArrive：到站消耗支出 / 工期 / 压力并转入记事；质保只快照完工日", () => {
    const p = page();
    const S = p.S;
    S.renovDay = 80;
    S.renovMines = [{
      at: "Install", days: 2, lines: [["插座被挡", 6000]], text: "插座被柜子挡住",
      src: "点位没核对", hint: "交底对点位图", scope: null,
    }];
    const stress0 = S.stress;
    renovArrive(S, "Install");
    expect(S.renovExtra).toBe(6000);
    expect(S.renovDay).toBe(82);
    expect(S.stress).toBe(stress0 + 6);
    expect(S.renovBurst).toHaveLength(1);
    expect(S.renovBills[0].no).toBe("#01");
    expect(S.renovBills[0].stage).toBe("安装");
    expect(S.renovMines).toHaveLength(0);
    expect(S.renovLog[0].text).toContain("插座被柜子挡住");

    const t = page();
    t.S.renovDay = 120;
    t.S.renovMines = [{
      at: "Warr", days: 5, lines: [["铰链维修", 500]], text: "铰链响了",
      src: "易耗件", hint: "留证据", scope: null,
    }];
    renovArrive(t.S, "Warr");
    expect(t.S.renovDoneDay).toBe(120); // 快照发生在结算之前
    expect(t.S.renovDay).toBe(125);
  });

  it("renovSkip 直接入住：置 renovDone 且回总账", () => {
    const p = toFinal();
    run(p, "renovSkip");
    expect(p.S.renovDone).toBe(true);
    expect(p.S.renovSkipped).toBe(true);
    expect(p.S.scene).toBe("final");
  });
});

describe("流程阶段：现金一致性（防死胡同）", () => {
  it("筹钱补足全程走完：现金不为负，且「初始自有 + 已筹 − 已出款 = 现金」恒成立", () => {
    const cash0 = 500000;
    const p = toSign();
    run(p, "pay:deposit", "payOk", "pay:firstPay", "payOk", "next", "next",
      "pay:restPay", "payOk", "next", "pay:transfer", "payOk", "ho:ok", "next");
    expect(p.S.scene).toBe("final");
    expect(p.S.cash).toBeGreaterThanOrEqual(0);
    expect(p.S.cash).toBeCloseTo(cash0 + p.S.borrowed - p.S.paid, 2);
    expect(p.S.paid).toBeCloseTo(p.S.down + p.S.taxes, -3); // 首付 + 税费（登记费 80 元级误差）
  });

  it("换房后重走：借款退还、上一套结论清空、第二套现金不再虚高", () => {
    const p = toFunds(50, "E");
    run(p, "next", "bor:family", "bor:gjj", "bor:credit", "changeHouse");
    expect(p.S.scene).toBe("select");
    expect(p.S.cash).toBe(500000);
    run(p, "house:A", "next", "qa:hukou:sh", "next", "n1:chat", "n2:bottom", "next", "fee:0.01",
      "lt:combo", "next", "next", "pay:deposit", "payOk", "pay:firstPay", "payOk",
      "next", "next", "pay:restPay", "payOk", "next", "pay:transfer", "payOk", "ho:ok", "next");
    expect(p.S.scene).toBe("final");
    expect(p.S.cash).toBeGreaterThanOrEqual(0);
  });

  it("三个身份都能走通全程（结算现金不为负）", () => {
    for (const role of ["first", "trade", "invest"] as const) {
      const p = page();
      run(p, "next", "role:" + role, "next", "cash:300", "next", "house:A", "next", "qa:hukou:sh",
        "next", "n1:chat", "n2:bottom", "next", "fee:0.01", "lt:combo", "next", "next",
        "pay:deposit", "payOk", "pay:firstPay", "payOk", "next", "next",
        "pay:restPay", "payOk", "next", "pay:transfer", "payOk", "ho:ok", "next");
      expect(p.S.scene, role).toBe("final");
      expect(p.S.cash, role).toBeGreaterThanOrEqual(0);
      expect(ROLES[role].k).toBe(role);
    }
  });
});

/* 房源表与角色表被用例引用，避免「测试与配置脱节」 */
it("配置自洽：6 套预设房源 + 3 个身份", () => {
  expect(HOUSES).toHaveLength(6);
  expect(Object.keys(ROLES).sort()).toEqual(["first", "invest", "trade"]);
});