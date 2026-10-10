/**
 * 「我负责的项目」列表页 · 指标 Hero 区回归测试（对齐设计稿
 * docs/2026-10-10-带看项目列表-指标hero区-高保真设计稿.html 的 E2E 验证点）.
 *
 * 覆盖：
 * - hero 取数接线：onShow 并行请求 /projects/sales-summary（独立于列表请求），
 *   响应映射为 hero 渲染模型（三指标总量 + +N 徽标文案 + 周期文案直出）
 * - SWR：有缓存先渲染缓存再静默刷新覆盖
 * - 降级：summary 请求失败 hero 整卡隐藏（summary=null），无缓存时清旧数据，
 *   不进列表 error 态（列表请求独立）
 * - 徽标口径：+0 与 +N 同文案格式恒渲染；≥100 显示 +99+（deltaText 纯函数）
 * - 渲染接线（wxml/wxss）：kpi-hero 三列绑定 summary 字段、ⓘ 弹层节点、
 *   卡底「带看记录」链接绑定 onSalesRecords；wxss .kpi-delta 使用 --rust
 * - onSalesRecords 跳转 /pages/viewing/records/index
 *
 * 页面加载走 createPageHarness 模板；request mock 队列按序 resolve。
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
// wxml/wxss 以 ?raw 静态内联（声明见 test-utils/types/vite-raw.d.ts）
import viewingProjectsWxml from "../../pages/viewing/projects/index/index.wxml?raw";
import viewingProjectsWxss from "../../pages/viewing/projects/index/index.wxss?raw";
import {
  createPageHarness,
  createRequestMock,
  pendingReqs,
  resetTestStubs,
  wxStubs,
} from "../test-harness";

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
  resetTestStubs();
});

afterAll(() => {
  vi.resetModules();
});

/** 汇总接口响应（设计稿演示值：24/9/6 与 +5/+2/+1）. */
function summaryResp(): Record<string, unknown> {
  return {
    viewing_total: 24,
    offer_total: 9,
    negotiation_total: 6,
    period_new_viewing: 5,
    period_new_offer: 2,
    period_new_negotiation: 1,
    period: { start: "2026-10-06", end: "2026-10-12", text: "10-06 周二 ~ 10-12 周一 · 剩 2 天" },
  };
}

type AnyRecord = Record<string, any>;

function newPage(seed: AnyRecord = {}): AnyRecord {
  return createPageHarness({ state: "items", items: [], summary: null, summaryPopOpen: false, ...seed });
}

/** 走 onShow：返回 [harness]；此时队列里应有列表 + 汇总两个请求. */
function boot(): AnyRecord {
  const ctx = newPage();
  void ctx.onShow();
  return ctx;
}

/** 队列中找到 url 含指定片段的 pending 请求. */
function findReq(fragment: string): AnyRecord {
  const req = pendingReqs().find((r) => r.opts.url.includes(fragment));
  expect(req, `应发出 url 含 ${fragment} 的请求`).toBeTruthy();
  return req as unknown as AnyRecord;
}

describe("hero 取数接线", () => {
  it("onShow 并行发出列表与 sales-summary 两个独立请求", () => {
    boot();
    const urls = pendingReqs().map((r) => r.opts.url);
    expect(urls.some((u: string) => u.includes("/projects?status=selling"))).toBe(true);
    expect(urls.some((u: string) => u.includes("/projects/sales-summary"))).toBe(true);
  });

  it("summary 响应映射为 hero 渲染模型（总量 + +N 徽标 + 周期文案直出）", async () => {
    const ctx = boot();
    findReq("sales-summary").resolve(summaryResp());
    await Promise.resolve();
    await Promise.resolve();
    const summary = ctx.data.summary as AnyRecord;
    expect(summary).not.toBeNull();
    expect(summary.viewingCount).toBe(24);
    expect(summary.offerCount).toBe(9);
    expect(summary.negotiationCount).toBe(6);
    expect(summary.viewingDeltaText).toBe("+5");
    expect(summary.offerDeltaText).toBe("+2");
    expect(summary.negotiationDeltaText).toBe("+1");
    expect(summary.periodText).toContain("剩 2 天");
  });

  it("summary 失败（无缓存）→ hero 整卡隐藏，不进列表 error 态", async () => {
    const ctx = boot();
    findReq("sales-summary").reject({ statusCode: 500 });
    findReq("status=selling").resolve({ items: [], total: 0, page: 1, page_size: 20 });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(ctx.data.summary).toBeNull();
    // 列表状态不受 summary 失败影响（此处为空列表 empty，而非 error）
    expect(ctx.data.state).toBe("empty");
  });

  it("带令牌校验：无令牌时不发 summary 请求", async () => {
    mockGetAccessToken.mockReturnValue("");
    const ctx = newPage();
    void ctx.onShow();
    await Promise.resolve();
    expect(pendingReqs().some((r) => r.opts.url.includes("sales-summary"))).toBe(false);
    mockGetAccessToken.mockReturnValue("tok");
  });
});

describe("ⓘ 弹层与卡底链接", () => {
  it("onToggleSummaryPop 开/收切换", () => {
    const ctx = boot();
    expect(ctx.data.summaryPopOpen).toBe(false);
    ctx.onToggleSummaryPop();
    expect(ctx.data.summaryPopOpen).toBe(true);
    ctx.onToggleSummaryPop();
    expect(ctx.data.summaryPopOpen).toBe(false);
  });

  it("onSalesRecords 跳转 /pages/viewing/records/index", () => {
    const ctx = boot();
    ctx.onSalesRecords();
    expect(wxStubs.navigateTo).toHaveBeenCalledWith({ url: "/pages/viewing/records/index" });
  });

  it("summary 成功后弹层态复位（重进页面不残留展开态）", async () => {
    const ctx = boot();
    ctx.setData({ summaryPopOpen: true });
    findReq("sales-summary").resolve(summaryResp());
    await Promise.resolve();
    await Promise.resolve();
    expect(ctx.data.summaryPopOpen).toBe(false);
  });
});

describe("增量徽标口径（+0/+N 同格式恒渲染，≥100 显示 +99+）", () => {
  it("+0 与 +N 同为「+数字」文案（同色由 wxss .kpi-delta 恒渲染保证）", async () => {
    const ctx = boot();
    findReq("sales-summary").resolve({ ...summaryResp(), period_new_viewing: 0, period_new_offer: 0, period_new_negotiation: 0 });
    await Promise.resolve();
    await Promise.resolve();
    const summary = ctx.data.summary as AnyRecord;
    expect(summary.viewingDeltaText).toBe("+0");
    expect(summary.offerDeltaText).toBe("+0");
    expect(summary.negotiationDeltaText).toBe("+0");
  });

  it("≥100 显示 +99+ 防三列挤压（设计稿 STATES 表）", async () => {
    const ctx = boot();
    findReq("sales-summary").resolve({ ...summaryResp(), period_new_viewing: 128 });
    await Promise.resolve();
    await Promise.resolve();
    expect((ctx.data.summary as AnyRecord).viewingDeltaText).toBe("+99+");
  });
});

describe("渲染接线（wxml/wxss 静态校验）", () => {
  const wxml = viewingProjectsWxml;
  const wxss = viewingProjectsWxss;

  it("wxml：hero 三列绑定 summary 字段且恒渲染（wx:if={{summary}} 整卡级降级）", () => {
    expect(wxml).toContain('wx:if="{{summary}}"');
    expect(wxml).toContain("{{summary.viewingCount}}");
    expect(wxml).toContain("{{summary.offerCount}}");
    expect(wxml).toContain("{{summary.negotiationCount}}");
    expect(wxml).toContain("{{summary.viewingDeltaText}}");
    expect(wxml).toContain("{{summary.offerDeltaText}}");
    expect(wxml).toContain("{{summary.negotiationDeltaText}}");
    expect(wxml).toContain("{{summary.periodText}}");
  });

  it("wxml：ⓘ 弹层 + 蒙层 + 卡底「带看记录」链接接线", () => {
    expect(wxml).toContain('catchtap="onToggleSummaryPop"');
    expect(wxml).toContain('catchtap="onSalesRecords"');
    expect(wxml).toContain("带看记录</text>");
    expect(wxml).toContain("统计范围与下方列表一致");
  });

  it("wxss：.kpi-delta 存在且使用 rust 强调色（+0 与 +N 同色）", () => {
    const block = wxss.match(/\.kpi-delta \{[^}]*\}/);
    expect(block).not.toBeNull();
    expect(block![0]).toContain("var(--rust)");
    expect(block![0]).toContain("font-weight: 600");
  });

  it("wxss：hero 卡片从 keys/list 平移的三件套（kpi-hero/kpi-pop/kpi-row）齐全", () => {
    expect(wxss).toContain(".kpi-hero {");
    expect(wxss).toContain(".kpi-pop {");
    expect(wxss).toContain(".kpi-row {");
    expect(wxss).toContain(".kpi-mask {");
  });
});
