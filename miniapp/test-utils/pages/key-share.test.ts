/**
 * 钥匙分享 · 经纪人访客页「带看注意事项」聚合测试.
 *
 * 覆盖缺陷修复行为：多条房源备注时每条都必须携带归属地址
 * （修复前第一条备注恒为空地址，经纪人无法判断该条注意事项属于哪套房源，
 * 可能将门锁位置/进门方式等指示错误套用到其他房源）；仅单条时省略地址标签。
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPageHarness, createRequestMock, pendingReqs, resetTestStubs } from "../test-harness";

vi.mock("../../utils/request", () => createRequestMock());

beforeAll(async () => {
  await import("../../pages/key-share/index");
});

beforeEach(() => {
  resetTestStubs();
});

function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

interface ShareItemInput {
  project_id: string;
  address: string;
  key_id: string;
  key_note: string | null;
}

function shareResponse(items: ShareItemInput[]): Record<string, unknown> {
  return {
    status: "active",
    is_expired: false,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    revoked_at: null,
    sharer_name: "张分享",
    items_count: items.length,
    viewed_by_me_count: 0,
    items: items.map((it) => ({
      project_id: it.project_id,
      project_name: "房源",
      address: it.address,
      key_id: it.key_id,
      key_deleted: false,
      key_note: it.key_note,
      viewed: false,
      last_viewed_at: null,
    })),
  };
}

/** 载入分享页并 resolve 分享响应，返回页面实例. */
async function loadShareWith(items: ShareItemInput[]): Promise<Record<string, any>> {
  const ctx = createPageHarness();
  ctx.onLoad({ token: "tok-1" });
  expect(pendingReqs()).toHaveLength(1);
  pendingReqs()[0].resolve(shareResponse(items));
  await flush();
  return ctx;
}

describe("带看注意事项聚合（buildNoteLines）", () => {
  it("多房源各带备注：每条都携带归属地址（首条不得缺失）", async () => {
    const ctx = await loadShareWith([
      { project_id: "p-1", address: "幸福路 1 号", key_id: "k-1", key_note: "门锁在左手边柜后" },
      { project_id: "p-2", address: "平安路 2 号", key_id: "k-2", key_note: "需先按门铃" },
    ]);
    expect(ctx.data.noteLines).toEqual([
      { addr: "幸福路 1 号", text: "门锁在左手边柜后" },
      { addr: "平安路 2 号", text: "需先按门铃" },
    ]);
  });

  it("单房源备注：省略地址标签", async () => {
    const ctx = await loadShareWith([
      { project_id: "p-1", address: "幸福路 1 号", key_id: "k-1", key_note: "门锁在左手边柜后" },
    ]);
    expect(ctx.data.noteLines).toEqual([{ addr: "", text: "门锁在左手边柜后" }]);
  });

  it("同房源多条目去重：仅取一条", async () => {
    const ctx = await loadShareWith([
      { project_id: "p-1", address: "幸福路 1 号", key_id: "k-1", key_note: "门锁在左手边柜后" },
      { project_id: "p-1", address: "幸福路 1 号", key_id: "k-2", key_note: "门锁在左手边柜后" },
    ]);
    expect(ctx.data.noteLines).toEqual([{ addr: "", text: "门锁在左手边柜后" }]);
  });

  it("全部无备注：不渲染注意事项卡", async () => {
    const ctx = await loadShareWith([
      { project_id: "p-1", address: "幸福路 1 号", key_id: "k-1", key_note: null },
      { project_id: "p-2", address: "平安路 2 号", key_id: "k-2", key_note: "  " },
    ]);
    expect(ctx.data.noteLines).toEqual([]);
  });
});
