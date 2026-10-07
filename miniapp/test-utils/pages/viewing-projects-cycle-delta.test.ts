/**
 * 「我负责的项目」列表页 · 周期新增角标回归测试（对齐设计稿
 * docs/2026-10-07-带看出价面谈周期角标-高保真设计稿.html 的 E2E 验证点）.
 *
 * 覆盖：
 * - toDisplay 派生字段：周期内/外记录的 +N/+0 数值（带看/出价/面谈各自独立统计）
 * - 周期边界双向验证：周二起点计入、周一（上周一）不计入、上周二在周一视角计入
 * - 跨年周期（2026-12-29 周二 → 2027-01-04 周一）
 * - 边界情况：非法 record_date（NaN）、未来日期、同日多条、非法 price 不影响计数
 * - 渲染接线：wxml 三个 count-delta 节点绑定 delta 字段且恒渲染（含 +0），
 *   wxss 存在 .count-delta 且使用 --rust（防止「数据有了但样式缺失」静默回归）
 * - append 无状态残留：触底追加后旧卡片角标不变、新卡片正确派生
 *
 * 页面加载走 createPageHarness 模板；周期起点用 vi.useFakeTimers 固定系统时间。
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
// wxml/wxss 以 ?raw 静态内联（声明见 test-utils/types/vite-raw.d.ts）
import viewingProjectsWxml from "../../pages/viewing/projects/index/index.wxml?raw";
import viewingProjectsWxss from "../../pages/viewing/projects/index/index.wxss?raw";
import {
  createPageHarness,
  createRequestMock,
  pendingReqs,
  resetTestStubs,
} from "../test-harness";

/** project-list-page 除 request 外还 import getCacheData/invalidateCache，mock 需一并提供；token 用可变返回值控制登录态. */
const mockGetAccessToken = vi.fn(() => "tok");
vi.mock("../../utils/request", () => ({
  ...createRequestMock(),
  getCacheData: vi.fn(() => undefined),
  invalidateCache: vi.fn(),
}));
vi.mock("../../utils/token", () => ({
  getAccessToken: () => mockGetAccessToken(),
}));

beforeAll(async () => {
  await import("../../pages/viewing/projects/index/index");
});

afterEach(() => {
  vi.useRealTimers();
  resetTestStubs();
});

afterAll(() => {
  vi.resetModules();
});

/** mock 系统时间到指定日期（本地时区正午，避免 DST/边界歧义）. */
function atNow(y: number, m: number, d: number): void {
  vi.useFakeTimers({ now: new Date(y, m - 1, d, 12, 0, 0) });
}

/** 构造项目响应：sales_records 支持 {record_type, record_date, price} 简写. */
function project(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "p1",
    address: "金杨七街坊",
    community_name: null,
    status: "selling",
    created_at: "2026-09-01T10:00:00+08:00",
    sales_records: [],
    ...overrides,
  };
}

/** 构造一条销售记录（price 仅出价需要，其他类型可省）. */
function rec(type: string, date: string, price?: number): Record<string, unknown> {
  return price === undefined
    ? { record_type: type, record_date: date }
    : { record_type: type, record_date: date, price };
}

type AnyRecord = Record<string, any>;

/**
 * toDisplay 快捷入口：工厂返回对象不展开 config（toDisplay 在闭包内），
 * 通过 applyItems("replace") 走真实链路（排序 + toDisplay）后取展示项.
 */
function display(p: Record<string, unknown>): AnyRecord {
  const ctx = createPageHarness({ state: "items" }) as AnyRecord;
  ctx.applyItems([p as never], "replace");
  return (ctx.data.items as AnyRecord[])[0];
}

describe("周期新增角标 · toDisplay 派生字段", () => {
  it("周期内 1 条 viewing、周期外 1 条 offer → 带看 +1，出价 +0（角标逐项独立）", () => {
    atNow(2026, 10, 7); // 周三：周期起点 2026-10-06 周二
    const d = display(
      project({
        sales_records: [
          rec("viewing", "2026-10-07T10:00:00+08:00"), // 周期内
          rec("offer", "2026-10-05T10:00:00+08:00"), // 上周一：周期外
        ],
      }),
    );
    expect(d.viewingDelta).toBe(1);
    expect(d.offerDelta).toBe(0);
    expect(d.negotiationDelta).toBe(0);
    // 主计数与角标同源：全量统计不受周期过滤影响
    expect(d.viewingCount).toBe(1);
    expect(d.offerCount).toBe(1);
  });

  it("周期起点当天（周二）记录计入，前一天（周一）不计入（边界双向验证）", () => {
    atNow(2026, 10, 7); // 周三打开，起点周二 10-06
    const d = display(
      project({
        sales_records: [
          rec("viewing", "2026-10-06T00:30:00+08:00"), // 周期起点当天 → 计入
          rec("offer", "2026-10-05T23:00:00+08:00"), // 起点 12 小时前 → 不计入
        ],
      }),
    );
    expect(d.viewingDelta).toBe(1);
    expect(d.offerDelta).toBe(0);
  });

  it("周一打开：上周二记录计入、上周一不计入（跨周窗口）", () => {
    atNow(2026, 10, 12); // 周一：周期 = 上周二 10-06 → 本周一
    const d = display(
      project({
        sales_records: [
          rec("viewing", "2026-10-06T08:00:00+08:00"), // 上周二 → 计入
          rec("offer", "2026-10-05T18:00:00+08:00"), // 上周一 → 不计入
        ],
      }),
    );
    expect(d.viewingDelta).toBe(1);
    expect(d.offerDelta).toBe(0);
  });

  it("周二打开：新周期第一天，昨天（周一）的新记录不计入", () => {
    atNow(2026, 10, 6); // 周二，起点 = 今天 00:00
    const d = display(
      project({
        sales_records: [
          rec("viewing", "2026-10-06T09:00:00+08:00"), // 今天 → 计入
          rec("viewing", "2026-10-05T20:00:00+08:00"), // 昨天 → 不计入
        ],
      }),
    );
    expect(d.viewingDelta).toBe(1);
    expect(d.viewingCount).toBe(2); // 主计数仍为全量
  });

  it("跨年周期：2027-01-04 周一打开，2026-12-29 周二的记录计入", () => {
    atNow(2027, 1, 4); // 周一，起点 2026-12-29 周二
    const d = display(
      project({
        sales_records: [
          rec("negotiation", "2026-12-29T10:00:00+08:00"), // 跨年周期内
          rec("negotiation", "2026-12-28T10:00:00+08:00"), // 上周一 → 不计入
        ],
      }),
    );
    expect(d.negotiationDelta).toBe(1);
  });

  it("非法 record_date（NaN）不计入角标", () => {
    atNow(2026, 10, 7);
    const d = display(
      project({
        sales_records: [
          rec("viewing", "not-a-date"),
          rec("offer", "2026-10-07T08:00:00+08:00"),
        ],
      }),
    );
    expect(d.viewingDelta).toBe(0);
    expect(d.offerDelta).toBe(1);
  });

  it("未来日期（误录入）计入角标（与主计数宽松口径一致）", () => {
    atNow(2026, 10, 7);
    const d = display(project({ sales_records: [rec("viewing", "2026-10-09T10:00:00+08:00")] }));
    expect(d.viewingDelta).toBe(1);
  });

  it("同日多条记录全部计入", () => {
    atNow(2026, 10, 7);
    const d = display(
      project({
        sales_records: [
          rec("viewing", "2026-10-07T09:00:00+08:00"),
          rec("viewing", "2026-10-07T15:00:00+08:00"),
        ],
      }),
    );
    expect(d.viewingDelta).toBe(2);
  });

  it("角标按记录条数计：非法 price 的 offer 也计入 +N，但不影响最高出价", () => {
    atNow(2026, 10, 7);
    const d = display(
      project({
        sales_records: [
          rec("offer", "2026-10-07T09:00:00+08:00", 0), // 非法价
          rec("offer", "2026-10-07T10:00:00+08:00", 485), // 有效价
        ],
      }),
    );
    expect(d.offerDelta).toBe(2);
    expect(d.maxOfferText).toBe("485万");
    expect(d.hasOffer).toBe(true);
  });
});

describe("周期新增角标 · 列表加载与 append", () => {
  /** 走完整 loadList：首屏 1 页 + 触底追加 1 页，返回最终 items. */
  async function loadTwoPages(): Promise<AnyRecord[]> {
    atNow(2026, 10, 7);
    const ctx = createPageHarness({ state: "items", items: [], page: 1, total: 2, hasMore: true });
    const loading = ctx.loadList();
    expect(pendingReqs()).toHaveLength(1);
    pendingReqs()[0].resolve({
      items: [project({ id: "p1", sales_records: [rec("viewing", "2026-10-07T10:00:00+08:00")] })],
      total: 2,
      page: 1,
      page_size: 20,
    });
    await loading;
    expect(ctx.data.items).toHaveLength(1);

    // 触底追加：捕获 promise 等待完成（不能用触发时未捕获调用的返回值之外的方式排空）
    const reachBottom = ctx.onReachBottom();
    expect(pendingReqs()[1].opts.url).toContain("page=2");
    pendingReqs()[1].resolve({
      items: [project({ id: "p2", sales_records: [rec("offer", "2026-10-06T10:00:00+08:00")] })],
      total: 2,
      page: 2,
      page_size: 20,
    });
    await reachBottom;
    return ctx.data.items as AnyRecord[];
  }

  it("触底追加后旧卡片角标不变、新卡片正确派生", async () => {
    const items = await loadTwoPages();
    expect(items).toHaveLength(2);
    expect(items[0].viewingDelta).toBe(1); // 旧卡片角标不变
    expect(items[1].offerDelta).toBe(1); // 新卡片独立派生
  });
});

describe("周期新增角标 · 渲染接线（wxml/wxss）", () => {
  const wxml = viewingProjectsWxml;
  const wxss = viewingProjectsWxss;

  it("wxml：三个计数标签后各有一个 count-delta 节点，绑定 delta 字段", () => {
    const deltas = wxml.match(/<text class="count-delta">\+\{\{item\.(\w+)\}\}<\/text>/g) ?? [];
    expect(deltas).toHaveLength(3);
    expect(deltas.join("\n")).toContain("viewingDelta");
    expect(deltas.join("\n")).toContain("offerDelta");
    expect(deltas.join("\n")).toContain("negotiationDelta");
  });

  it("wxss：.count-delta 存在且使用 rust 强调色与 nowrap", () => {
    const block = wxss.match(/\.count-delta \{[^}]*\}/);
    expect(block).not.toBeNull();
    const css = block![0];
    expect(css).toContain("var(--rust)");
    expect(css).toContain("nowrap");
    expect(css).toContain("font-weight: 600");
  });
});
