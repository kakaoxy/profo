/**
 * 「投资测算器」页面测试：手机号门禁、默认口径锚点（与 docs/To-Do/​​calculator.html 一致）、
 * 输入联动（贷款默认买进价 80%）、滑杆/快捷片/分段控件/开关、重置、复制文案.
 *
 * 计算锚点由 utils/invest-calc 的 HTML 参照实现对拍保证（7/7 用例逐字段一致），
 * 此处断言页面渲染值与复制文案的关键内容。
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPageHarness, getPageConfig, resetTestStubs, wxStubs } from "../test-harness";

/** request mock（vi.mock 提升后经此转发，便于逐用例设定返回值）. */
const requestMock = vi.hoisted(() => vi.fn());

vi.mock("../../utils/request", () => ({
  request: requestMock,
}));

beforeAll(async () => {
  await import("../../pages/invest-calculator/index/index");
});

type AnyRecord = Record<string, any>;

function cfg(): AnyRecord {
  return getPageConfig();
}

function createInstance(): AnyRecord {
  const inst = createPageHarness();
  inst.loanAuto = cfg().loanAuto;
  inst.copyTimer = null;
  inst.onLoad.call(inst);
  return inst;
}

beforeEach(() => {
  resetTestStubs();
  requestMock.mockReset();
  // 门禁测试默认模拟已登录（c_access_token 由 request.ts 自动注入 /public/*）
  (wxStubs.getStorageSync as unknown as ReturnType<typeof vi.fn>).mockImplementation((key: string) =>
    key === "c_access_token" ? "c-token" : ""
  );
});

describe("手机号门禁（仅完善过手机号的用户可用）", () => {
  it("未登录（storage 无令牌）→ gate=false，展示登录引导", async () => {
    (wxStubs.getStorageSync as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => "");
    const inst = createInstance();
    await inst.loadGate();
    expect(requestMock).not.toHaveBeenCalled();
    expect(inst.data.gate).toBe(false);
    expect(inst.data.loggedIn).toBe(false);
  });

  it("令牌请求失败（401 刷新后仍失败）→ gate=false，按未登录展示登录引导", async () => {
    requestMock.mockRejectedValue({ statusCode: 401 });
    const inst = createInstance();
    await inst.loadGate();
    expect(inst.data.gate).toBe(false);
    expect(inst.data.loggedIn).toBe(false);
  });

  it("已登录但未绑定手机号 → gate=false，loggedIn=true（文案为完善手机号引导）", async () => {
    requestMock.mockResolvedValue({ username: "u1", phone: null, is_internal: false });
    const inst = createInstance();
    await inst.loadGate();
    expect(inst.data.gate).toBe(false);
    expect(inst.data.loggedIn).toBe(true);
  });

  it("已登录且已绑定手机号 → gate=true，主区可渲染", async () => {
    requestMock.mockResolvedValue({ username: "u1", phone: "138****5678", is_internal: false });
    const inst = createInstance();
    await inst.loadGate();
    expect(inst.data.gate).toBe(true);
    expect(inst.data.loggedIn).toBe(true);
  });
});

describe("默认口径锚点（HTML 默认值：600/750/30 月/89㎡/480 万/3.05%）", () => {
  it("首帧 recalc 后结果卡与 HTML 一致（30 月 ≥24 → 增值税免征）", () => {
    const inst = createInstance();
    expect(inst.data.profit).toBe("86.40");
    expect(inst.data.profitNeg).toBe(false);
    expect(inst.data.note).toBe("毛利 99.90 万（未扣税） · 利息 36.60 万");
    expect(inst.data.chipInvest).toBe("126.00 万");
    expect(inst.data.chipTax).toBe("13.50 万");
    expect(inst.data.chipMargin).toBe("68.6%");
    expect(inst.data.chipAnnual).toBe("27.4%");
    expect(inst.data.dockProfit).toBe("86.40 万");
  });

  it("增值税卡：30 个月已满 2 年 → 免征；切 12 个月后恢复自动征收", () => {
    const inst = createInstance();
    expect(inst.data.vatStateOk).toBe(true);
    expect(inst.data.vatChip).toBe("满 2 年 · 免征");
    expect(inst.data.vatAmt).toBe("0.00 万");
    expect(inst.data.vatCap).toBe("持有满 2 年，增值税及附加免征");
    expect(inst.data.vatHint).toBe("已满 2 年，免征自动生效");
    inst.onHoldChipTap({ currentTarget: { dataset: { m: 12 } } });
    expect(inst.data.vatStateOk).toBe(false);
    expect(inst.data.vatChip).toBe("不满 2 年 · 自动征收");
    expect(inst.data.vatAmt).toBe("23.16 万");
    expect(inst.data.vatCap).toBe("计税：核定 750.00 ÷ 1.03 × 3.18%（含附加）");
    expect(inst.data.vatHint).toBe("持有 12 个月，未满 2 年，须缴纳增值税及附加");
  });

  it("个税卡：12 个月自动取低（全额 1% < 差额 20% 时取全额）", () => {
    const inst = createInstance();
    inst.onHoldChipTap({ currentTarget: { dataset: { m: 12 } } });
    // 全额 (750-23.16)*1%=7.27 万；差额 (750-23.16-600)*20%=25.37 万 → 取低 7.27
    expect(inst.data.pitStateOk).toBe(false);
    expect(inst.data.pitChip).toBe("自动取低 · 全额 1%");
    expect(inst.data.pitAmt).toBe("7.27 万");
    expect(inst.data.pitHintCls).toBe("hintline");
    expect(inst.data.pitHint).toBe("距离满五唯一免征还差 48 个月（保持家庭唯一）");
  });

  it("契税卡：唯一 + ≤140㎡ → 1.0%，计税基础 = 买入核定", () => {
    const inst = createInstance();
    expect(inst.data.deedChip).toBe("1.0%");
    expect(inst.data.deedAmt).toBe("6.00 万");
    expect(inst.data.deedCap).toBe("家庭唯一住房，按面积 ≤140㎡ 套档 · 计税：买入核定 600.00 × 1.0%");
  });

  it("成本总览：税费合计 13.50 / 总成本 663.60 / 结算过程文案", () => {
    const inst = createInstance();
    expect(inst.data.tTax).toBe("13.50");
    expect(inst.data.tCost).toBe("663.60");
    expect(inst.data.fTax).toBe("增值税 0.00 + 契税 6.00 + 个税 7.50 = 13.50 万");
    expect(inst.data.fCost).toBe("买进 600.00 + 税费 13.50 + 佣金 13.50 + 名额 0.00 + 装修 0.00 + 利息 36.60 = 663.60 万");
    expect(inst.data.fInterest).toBe("480.00 万 × 年化 3.05% × 2.5 年");
    expect(inst.data.fVat).toBe("持有满 2 年 · 免征");
  });
});

describe("输入联动", () => {
  it("买进价联动贷款金额默认 80%（手动改贷款后不再联动，等价 HTML loanAuto）", () => {
    const inst = createInstance();
    inst.onBuyInput({ detail: { value: "500" } });
    expect(inst.data.loan).toBe("400");
    // 手动修改贷款 → 不再联动
    inst.onLoanInput({ detail: { value: "300" } });
    inst.onBuyInput({ detail: { value: "800" } });
    expect(inst.data.loan).toBe("300");
  });

  it("持有时间快捷片：60 月 + 唯一 → 个税满五唯一免征", () => {
    const inst = createInstance();
    inst.onHoldChipTap({ currentTarget: { dataset: { m: 60 } } });
    expect(inst.data.pitStateOk).toBe(true);
    expect(inst.data.pitChip).toBe("满五唯一 · 免征");
    expect(inst.data.pitAmt).toBe("0.00 万");
    expect(inst.data.holdTip).toBe("已满 5 年：唯一住房个税免征，增值税亦免征");
    expect(inst.data.hold.y).toBe("5 年整");
    expect(inst.data.holdChips.find((c: AnyRecord) => c.m === 60).on).toBe(true);
  });

  it("滑杆 bindchange 同步 months 并重算（30 → 12 → 24；仅松手触发一次）", () => {
    const inst = createInstance();
    inst.onHoldInput({ detail: { value: 12 } });
    expect(inst.data.months).toBe(12);
    expect(inst.data.hold.y).toBe("1 年整");
    expect(inst.data.vatStateOk).toBe(false);
    inst.onHoldInput({ detail: { value: 24 } });
    expect(inst.data.months).toBe(24);
    expect(inst.data.vatStateOk).toBe(true);
  });

  it("快捷片集合为 3/6/12/24/60 月（需求指定；84 月已移除）", () => {
    const inst = createInstance();
    expect(inst.data.holdChips.map((c: AnyRecord) => c.m)).toEqual([3, 6, 12, 24, 60]);
    inst.onHoldChipTap({ currentTarget: { dataset: { m: 3 } } });
    expect(inst.data.months).toBe(3);
    expect(inst.data.hold.y).toBe("不满 1 年");
    expect(inst.data.holdChips.find((c: AnyRecord) => c.m === 3).on).toBe(true);
  });

  it("分段控件：家庭第 2 套 + >140㎡ → 契税 2%；持有 12 月切 3.15% 城镇档", () => {
    const inst = createInstance();
    inst.onSegFam({ currentTarget: { dataset: { v: "second" } } });
    inst.onAreaInput({ detail: { value: "150" } });
    expect(inst.data.deedChip).toBe("2.0%");
    // 计税基础 600 → 12 万
    expect(inst.data.deedAmt).toBe("12.00 万");
    inst.onHoldChipTap({ currentTarget: { dataset: { m: 12 } } });
    inst.onSegVat({ currentTarget: { dataset: { v: "0.0315" } } });
    // 卖出核定 750 ÷1.03 × 3.15% = 22.94 万
    expect(inst.data.vatAmt).toBe("22.94 万");
  });

  it("个税分段：差额 20% 口径展示计算过程（负差额按 0 计）", () => {
    const inst = createInstance();
    inst.onSegPit({ currentTarget: { dataset: { v: "p20" } } });
    expect(inst.data.pitAmt).toBe("30.00 万");
    expect(inst.data.pitCap).toBe("计税：差额：(核定 750.00 − 增值税 0.00 − 原值 600.00 − 装修 0.00) × 20%");
    // 亏本卖出：差额为负 → 按 0 计
    inst.onSellInput({ detail: { value: "500" } });
    expect(inst.data.pitAmt).toBe("0.00 万");
    expect(inst.data.pitCap).toContain("，现无增值按 0 计");
  });

  it("买入上家不满 2 年：增值税由买方承担并抵减契税计税基础", () => {
    const inst = createInstance();
    inst.onBuyUnder2Change({ detail: { value: true } });
    // 买入增值税 = 600/1.03*3.18% = 18.52；契税计税基础 600-18.52=581.48 → 5.81
    expect(inst.data.showBuyVat).toBe(true);
    expect(inst.data.bBuyVat).toBe("18.52");
    expect(inst.data.deedAmt).toBe("5.81 万");
    expect(inst.data.deedCap).toContain("（已扣买入增值税 18.52）");
    expect(inst.data.fTax).toContain("+ 买入增值税 18.52");
  });

  it("佣金率可调：买卖各 2% 时佣金行同步更新", () => {
    const inst = createInstance();
    inst.onBuyCommRateInput({ detail: { value: "2" } });
    inst.onSellCommRateInput({ detail: { value: "2" } });
    expect(inst.data.buyCommTag).toBe("2%");
    expect(inst.data.sellCommTag).toBe("2%");
    expect(inst.data.bBuyComm).toBe("12.00 万");
    expect(inst.data.bSellComm).toBe("15.00 万");
  });
});

describe("重置与复制", () => {
  it("onReset 恢复 HTML 默认值与控件状态", () => {
    const inst = createInstance();
    inst.onBuyInput({ detail: { value: "800" } });
    inst.onSegFam({ currentTarget: { dataset: { v: "three" } } });
    inst.onHoldChipTap({ currentTarget: { dataset: { m: 60 } } });
    inst.onSoleChange({ detail: { value: false } });
    inst.onReset();
    expect(inst.data.buy).toBe("600");
    expect(inst.data.sell).toBe("750");
    expect(inst.data.months).toBe(30);
    expect(inst.data.loan).toBe("480");
    expect(inst.loanAuto).toBe(true);
    expect(inst.data.segFam.find((o: AnyRecord) => o.v === "sole").on).toBe(true);
    expect(inst.data.segVat.find((o: AnyRecord) => o.v === "0.0318").on).toBe(true);
    expect(inst.data.segPit.find((o: AnyRecord) => o.v === "auto").on).toBe(true);
    expect(inst.data.sole).toBe(true);
    expect(inst.data.profit).toBe("86.40");
    // wx.pageScrollTo 回顶
    expect(wxStubs.pageScrollTo).toHaveBeenCalled();
  });

  it("onCopy 写入剪贴板文案与 HTML btnCopy 汇总一致", () => {
    vi.useFakeTimers();
    try {
      const inst = createInstance();
      inst.onCopy();
    expect(wxStubs.setClipboardData).toHaveBeenCalledTimes(1);
    const txt = wxStubs.setClipboardData.mock.calls[0][0].data as string;
    const lines = txt.split("\n");
    expect(lines[0]).toBe("【友席美房投资测算工具 · 上海 2026/2/25 税政】");
    expect(lines[1]).toBe("买进 600.00 万 → 卖出 750.00 万，持有 30 个月");
    expect(lines[2]).toBe("增值税及附加：0.00 万（满2年免征）");
    expect(lines[3]).toBe("个人所得税：7.50 万（自动取低（全额 1%））");
    expect(lines[4]).toBe("契税：6.00 万 · 买入增值税：0.00 万");
    expect(lines[5]).toBe("贷款利息：36.60 万 · 装修 0.00 万 · 名额费 0.00 万");
    expect(lines[6]).toBe("佣金（买 1% / 卖 1%）：13.50 万");
    expect(lines[7]).toBe("初始投入 126.00 万 · 税费合计 13.50 万 · 总成本 663.60 万");
    expect(lines[8]).toBe("★ 预计净利润 86.40 万（利润率 68.6%，年化 27.4%）");
    // 复制后按钮置「已复制 ✓」，1.6s 后复原
    expect(inst.data.copyDone).toBe(true);
    vi.runAllTimers();
    expect(inst.data.copyDone).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
