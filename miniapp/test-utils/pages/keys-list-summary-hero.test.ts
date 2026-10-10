/**
 * 钥匙管理列表页（keys/list）指标 Hero 区测试（设计稿 docs/2026-10-10）.
 *
 * 覆盖：
 * - onShow 并发发出 /keys/properties + /keys/summary（无请求瀑布）；
 * - summary 渲染：三指标大数字 + 增量徽标 +N（+0 同样显示）、period.text 直出；
 * - ≥100 增量显示 +99+；
 * - summary 失败：无缓存时 hero 整卡隐藏（summary=null），列表不受影响；
 * - ⓘ 弹层：catchtap 切换开/收。
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPageHarness, createRequestMock, pendingReqs, resetTestStubs } from "../test-harness";

vi.mock("../../utils/request", () => ({
  ...createRequestMock(),
  getCacheData: () => undefined,
}));

beforeAll(async () => {
  await import("../../pages/keys/list/index");
});

beforeEach(() => {
  resetTestStubs();
  (globalThis as unknown as { wx: Record<string, unknown> }).wx.getStorageSync = vi.fn(() => "tok-1");
});

function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

/** /keys/summary 响应体（字段与后端 Schema 对齐）. */
function summaryResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    properties_with_keys: 9,
    shares_total: 15,
    views_total: 36,
    period_new_properties: 2,
    period_new_shares: 5,
    period_new_views: 12,
    period: { start: "2026-10-06", end: "2026-10-12", text: "10-06 周二 ~ 10-12 周一 · 剩 2 天" },
    ...overrides,
  };
}

function propertiesResponse(): Record<string, unknown> {
  return {
    items: [
      {
        project_id: "p1",
        name: "房源 p1",
        community_name: "阳光花园",
        address: "阳光花园 1 号",
        status: "selling",
        area: 89,
        manager_key_set: true,
        normal_active_count: 2,
        normal_pending_count: 0,
        normal_disabled_count: 0,
        active_share_count: 0,
        total_view_count: 0,
      },
    ],
  };
}

/** 载入页面并 resolve 两个请求（summary 可选拒绝），返回页面实例. */
async function loadAll(opts: { summary?: Record<string, unknown>; rejectSummary?: boolean } = {}) {
  const ctx = createPageHarness();
  ctx.onShow();
  const reqs = pendingReqs();
  expect(reqs).toHaveLength(2);
  expect(reqs.map((r) => r.opts.url).sort()).toEqual(["/keys/properties", "/keys/summary"]);
  const summaryReq = reqs.find((r) => r.opts.url === "/keys/summary")!;
  const propsReq = reqs.find((r) => r.opts.url === "/keys/properties")!;
  if (opts.rejectSummary) {
    summaryReq.reject({ statusCode: 500, body: { code: 1, message: "boom" } });
  } else {
    summaryReq.resolve(opts.summary ?? summaryResponse());
  }
  propsReq.resolve(propertiesResponse());
  await flush();
  return ctx;
}

describe("指标 Hero 区（/keys/summary）", () => {
  it("渲染三指标大数字 + +N 徽标 + 周期文案直出", async () => {
    const ctx = await loadAll();
    const s = ctx.data.summary;
    expect(s).not.toBeNull();
    expect(s.propertiesWithKeys).toBe(9);
    expect(s.sharesTotal).toBe(15);
    expect(s.viewsTotal).toBe(36);
    expect(s.deltaText).toBe("+2");
    expect(s.sharesDeltaText).toBe("+5");
    expect(s.viewsDeltaText).toBe("+12");
    expect(s.periodText).toBe("10-06 周二 ~ 10-12 周一 · 剩 2 天");
  });

  it("+0 增量同样显示 +0（设计稿口径②）", async () => {
    const ctx = await loadAll({
      summary: summaryResponse({ period_new_properties: 0, period_new_shares: 0, period_new_views: 0 }),
    });
    expect(ctx.data.summary.deltaText).toBe("+0");
    expect(ctx.data.summary.sharesDeltaText).toBe("+0");
    expect(ctx.data.summary.viewsDeltaText).toBe("+0");
  });

  it("增量 ≥100 显示 +99+（防三列挤压）", async () => {
    const ctx = await loadAll({ summary: summaryResponse({ period_new_views: 128 }) });
    expect(ctx.data.summary.viewsDeltaText).toBe("+99+");
  });

  it("summary 请求失败且无缓存：hero 整卡隐藏（summary=null），列表正常渲染", async () => {
    const ctx = await loadAll({ rejectSummary: true });
    expect(ctx.data.summary).toBeNull();
    expect(ctx.data.state).toBe("items");
    expect(ctx.data.items).toHaveLength(1);
  });

  it("ⓘ 弹层：默认收起，catchtap 切换开/收", async () => {
    const ctx = await loadAll();
    expect(ctx.data.summaryPopOpen).toBe(false);
    ctx.onToggleSummaryPop();
    expect(ctx.data.summaryPopOpen).toBe(true);
    ctx.onToggleSummaryPop();
    expect(ctx.data.summaryPopOpen).toBe(false);
  });

  it("刷新成功后弹层自动收起", async () => {
    const ctx = await loadAll();
    ctx.onToggleSummaryPop();
    expect(ctx.data.summaryPopOpen).toBe(true);
    ctx.onShow();
    // 请求队列不移除已 settle 项：取本轮（最后一次）发出的两个请求
    const reqs = pendingReqs();
    const summaryReq = reqs.filter((r) => r.opts.url === "/keys/summary").pop()!;
    const propsReq = reqs.filter((r) => r.opts.url === "/keys/properties").pop()!;
    summaryReq.resolve(summaryResponse());
    propsReq.resolve(propertiesResponse());
    await flush();
    expect(ctx.data.summaryPopOpen).toBe(false);
  });
});
