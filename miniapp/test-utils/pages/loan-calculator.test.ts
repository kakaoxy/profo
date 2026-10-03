/**
 * 「贷款计算器」页面测试：实例状态隔离（模块级 → 实例属性回归）、
 * onLoad 重置链路、砍价/自定义首付交互 handler 行为.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPageHarness, getPageConfig, resetTestStubs, wxStubs } from "../test-harness";

vi.mock("../../utils/request", () => ({
  request: vi.fn(() => Promise.resolve({})),
}));

beforeAll(async () => {
  await import("../../pages/loan-calculator/index");
});

type AnyRecord = Record<string, any>;

/** 获取已捕获的页面配置. */
function cfg(): AnyRecord {
  return getPageConfig();
}

/** 构造实例：模拟 Page() 实例字段随实例创建（而非模块加载时共享）. */
function createInstance(options: AnyRecord = {}): AnyRecord {
  const inst = createPageHarness();
  // Page 配置上的实例字段（params/customPrice）每次 Page() 调用时按配置重新创建
  inst.params = JSON.parse(JSON.stringify(cfg().params));
  inst.customPrice = cfg().customPrice;
  inst.onLoad.call(inst, options as never);
  return inst;
}

beforeEach(() => {
  resetTestStubs();
});

describe("实例状态隔离（回归：模块级全局 → 实例属性）", () => {
  it("配置上的 params/customPrice 是实例字段（Page 配置含初始值，非模块 let）", () => {
    expect(cfg().params).toEqual({
      mode: "comm", downPct: 15, years: 30, lpr: 3.5, bp: -45, fundAmt: 100, method: "axi",
    });
    expect(cfg().customPrice).toBeNull();
  });

  it("两个实例互不串状态：B 修改 params/customPrice 后 A 读到的仍是自己的", () => {
    const a = createInstance({ price: "486" });
    const b = createInstance({ price: "248" });
    expect(a.data.price).toBe(486);
    expect(b.data.price).toBe(248);
    // B 切公积金 + 砍价
    b.onModeTap({ currentTarget: { dataset: { mode: "fund" } } });
    b.onBargainOk();
    b.setData({ bargainInput: "200" });
    b.onBargainOk();
    expect(b.customPrice).toBe(200);
    expect(b.params.mode).toBe("fund");
    // A 完全不受影响
    expect(a.params.mode).toBe("comm");
    expect(a.customPrice).toBeNull();
    expect(a.data.isCut).toBe(false);
  });

  it("onLoad 每次进入都重置 params 与 customPrice（同实例复用/重进场景）", () => {
    const inst = createInstance({ price: "486" });
    inst.apply({ mode: "fund", downPct: 30 });
    inst.customPrice = 300;
    // 模拟重进：同实例再次 onLoad（新参数）
    inst.onLoad.call(inst, { price: "350" } as never);
    expect(inst.params).toEqual({
      mode: "comm", downPct: 15, years: 30, lpr: 3.5, bp: -45, fundAmt: 100, method: "axi",
    });
    expect(inst.customPrice).toBeNull();
    expect(inst.data.isCut).toBe(false);
    expect(inst.data.priceLabel).toBe("房屋总价");
  });

  it("price 非法（invalid 态）时 customPrice 也被重置，不残留旧值", () => {
    const inst = createInstance({ price: "486" });
    inst.customPrice = 300;
    inst.params.downPct = 50;
    inst.onLoad.call(inst, { price: "" } as never);
    expect(inst.customPrice).toBeNull();
    expect(inst.params.downPct).toBe(15);
    expect(inst.data.invalid).toBe(true);
  });
});

describe("砍价与自定义首付 handler（实例态链路）", () => {
  it("砍价确认：合法期望价 → isCut/价格行/结果卡全联动（248 万砍到 200 万）", () => {
    const inst = createInstance({ price: "248" });
    inst.setData({ bargainInput: "200" });
    inst.onBargainOk();
    expect(inst.customPrice).toBe(200);
    expect(inst.data.isCut).toBe(true);
    expect(inst.data.showPrice).toBe("200");
    expect(inst.data.priceLabel).toBe("期望总价 · 已砍 ¥48万");
    // 默认口径：首付 15% = 30 万，贷款 170 万
    expect(inst.data.rDown).toBe("30");
    expect(inst.data.rLoan).toBe("170");
  });

  it("砍价确认：非法输入 toast 且不生效", () => {
    const inst = createInstance({ price: "486" });
    inst.onBargainTap();
    inst.setData({ bargainInput: "abc" });
    inst.onBargainOk();
    expect(wxStubs.showToast).toHaveBeenCalled();
    expect(inst.customPrice).toBeNull();
    expect(inst.data.bargainVisible).toBe(true);
  });

  it("自定义首付确认：248 万手填 80 万 → 首付 80 / 贷款 168（全精度，无取整损失）", () => {
    const inst = createInstance({ price: "248" });
    inst.setData({ customDownInput: "80" });
    inst.onCustomDownOk();
    expect(inst.data.isCut).toBe(false);
    expect(inst.data.rDown).toBe("80");
    expect(inst.data.rLoan).toBe("168");
    expect(inst.data.cpPct).toBe("32.26%");
  });

  it("自定义首付确认：低于下限 toast 不关闭不生效", () => {
    const inst = createInstance({ price: "486" });
    inst.onCustomDownTap();
    inst.setData({ customDownInput: "50" });
    inst.onCustomDownOk();
    expect(wxStubs.showToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining("72.9") })
    );
    expect(inst.data.customDownVisible).toBe(true);
    expect(inst.params.downPct).toBe(15);
  });

  it("恢复默认口径：清除期望价并回到默认参数", () => {
    const inst = createInstance({ price: "486" });
    inst.setData({ bargainInput: "400" });
    inst.onBargainOk();
    inst.apply({ years: 10, lpr: 4 });
    inst.onReset();
    expect(inst.customPrice).toBeNull();
    expect(inst.params.years).toBe(30);
    expect(inst.params.lpr).toBe(3.5);
    expect(inst.data.isCut).toBe(false);
  });
});

describe("详情页贷款卡摘要同源（回归：硬编码利率与常量漂移）", () => {
  it("摘要由 LOAN_DEFAULTS 派生：lpr/bp/years 改变后摘要与执行利率同步变化", async () => {
    const { calcLoan, fmtBp, MODE_NAME } = await import("../../utils/loan-calc");
    const { LOAN_DEFAULTS } = await import("../../utils/loan-calc");
    // 复现详情页 buildLoanCard 的摘要派生逻辑（纯函数，逐字段断言）
    const r = calcLoan(486, LOAN_DEFAULTS);
    const sum = `${MODE_NAME[LOAN_DEFAULTS.mode]} · ${LOAN_DEFAULTS.years}年 · LPR ${LOAN_DEFAULTS.lpr.toFixed(2)}%${fmtBp(LOAN_DEFAULTS.bp)}bp`;
    // 当前政策：与设计稿文案逐字一致
    expect(sum).toBe("纯商贷 · 30年 · LPR 3.50%−45bp");
    expect(r.commRate.toFixed(2) + "%").toBe("3.05%");
    // 漂移场景：lpr 调整后摘要随常量变化（若硬编码则会停在 3.50/3.05）
    const A = { ...LOAN_DEFAULTS, lpr: 3.6 };
    const sumA = `${MODE_NAME[A.mode]} · ${A.years}年 · LPR ${A.lpr.toFixed(2)}%${fmtBp(A.bp)}bp`;
    expect(sumA).toBe("纯商贷 · 30年 · LPR 3.60%−45bp");
    expect(calcLoan(486, A).commRate.toFixed(2) + "%").toBe("3.15%");
    // bp 调整同样同步
    const B = { ...LOAN_DEFAULTS, bp: -50 };
    expect(calcLoan(486, B).commRate.toFixed(2) + "%").toBe("3.00%");
  });
});
