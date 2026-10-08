/**
 * 分享记录页（keys/share-records）页面级测试.
 *
 * 覆盖：
 * - 卡片标题渲染为小区名（单套直显，多套「/」拼接，超限截断，缺失回退「N 套房源」）
 * - 状态过滤计数不受标题改造影响
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPageHarness, createRequestMock, pendingReqs, resetTestStubs } from "../test-harness";

vi.mock("../../utils/request", () => createRequestMock());

beforeAll(async () => {
  await import("../../pages/keys/share-records/index");
});

beforeEach(() => {
  resetTestStubs();
  // 默认已登录（getCAccessToken 读 c_access_token）
  (globalThis as unknown as { wx: Record<string, unknown> }).wx.getStorageSync = vi.fn((key: string) =>
    key === "c_access_token" ? "tok-1" : null,
  );
});

function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

interface ShareInput {
  community_names: string[];
  items_count: number;
}

function shareItem(input: ShareInput): Record<string, unknown> {
  return {
    id: `share-${input.community_names.join("-") || "empty"}`,
    token: "tok",
    status: "active",
    is_expired: false,
    community_names: input.community_names,
    items_count: input.items_count,
    viewed_count: 0,
    viewer_names: [],
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date().toISOString(),
    revoked_at: null,
  };
}

/** 载入分享记录页并 resolve 响应，返回页面实例. */
async function loadRecords(items: Record<string, unknown>[]): Promise<Record<string, any>> {
  const ctx = createPageHarness();
  ctx.onShow();
  expect(pendingReqs()).toHaveLength(1);
  pendingReqs()[0].resolve({ items });
  await flush();
  return ctx;
}

describe("分享记录卡标题（小区名）", () => {
  it("单套房源：标题为小区名而非「1 套房源」", async () => {
    const ctx = await loadRecords([shareItem({ community_names: ["阳光花园"], items_count: 1 })]);
    expect(ctx.data.items[0].itemsText).toBe("阳光花园");
    expect(ctx.data.filters[0].count).toBe(1);
  });

  it("多套房源：小区名「/」拼接", async () => {
    const ctx = await loadRecords([
      shareItem({ community_names: ["阳光花园", "翡翠湾"], items_count: 2 }),
    ]);
    expect(ctx.data.items[0].itemsText).toBe("阳光花园/翡翠湾");
  });

  it("小区名超限：截断加 …", async () => {
    const ctx = await loadRecords([
      shareItem({ community_names: ["阳光花园", "翡翠湾", "绿城桃园"], items_count: 3 }),
    ]);
    expect(ctx.data.items[0].itemsText).toBe("阳光花园/翡翠湾…");
  });

  it("小区名缺失：回退「N 套房源」", async () => {
    const ctx = await loadRecords([shareItem({ community_names: [], items_count: 4 })]);
    expect(ctx.data.items[0].itemsText).toBe("4 套房源");
  });
});
