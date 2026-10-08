/**
 * 钥匙管理列表页（keys/list）置顶排序测试.
 *
 * 规则：默认排序（后端状态/创建时间序）不变；当前用户最近一次分享过的房源置顶
 * （storage 记录，与后端口径一致），其余房源保持原相对顺序（稳定切分）。
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
  // 默认已登录；storage 置顶记录默认为空
  mockStorage(null);
});

type StorageGet = (key: string) => unknown;

/** 模拟登录态与置顶 storage（pinnedIds 为 null 表示无记录）. */
function mockStorage(pinnedIds: string[] | null) {
  (globalThis as unknown as { wx: Record<string, unknown> }).wx.getStorageSync = vi.fn((key: string) => {
    if (key === "c_access_token") {
      return "tok-1";
    }
    if (key.startsWith("keys_recent_shared_projects:")) {
      return pinnedIds;
    }
    return null;
  }) as unknown as StorageGet;
}

function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

interface PropInput {
  project_id: string;
  community_name: string;
}

function propertiesResponse(items: PropInput[]): Record<string, unknown> {
  return {
    items: items.map((p) => ({
      project_id: p.project_id,
      name: `房源 ${p.project_id}`,
      community_name: p.community_name,
      address: `${p.community_name} 1 号`,
      status: "selling",
      area: 89,
      manager_key_set: true,
      normal_active_count: 2,
      normal_pending_count: 0,
      normal_disabled_count: 0,
      active_share_count: 0,
      total_view_count: 0,
    })),
  };
}

/** 载入钥匙列表页并 resolve 房源响应，返回页面实例. */
async function loadList(items: PropInput[]): Promise<Record<string, any>> {
  const ctx = createPageHarness();
  ctx.onShow();
  const reqs = pendingReqs();
  expect(reqs).toHaveLength(1);
  expect(reqs[0].opts.url).toBe("/keys/properties");
  reqs[0].resolve(propertiesResponse(items));
  await flush();
  return ctx;
}

/** 依序取出渲染项的 projectId. */
function idsOf(ctx: Record<string, any>): string[] {
  return ctx.data.items.map((it: { projectId: string }) => it.projectId);
}

describe("钥匙列表置顶排序（上次分享过的排最前）", () => {
  const A = { project_id: "p1", community_name: "阳光花园" };
  const B = { project_id: "p2", community_name: "翡翠湾" };
  const C = { project_id: "p3", community_name: "绿城桃园" };

  it("无分享记录：保持后端原序", async () => {
    mockStorage(null);
    const ctx = await loadList([A, B, C]);
    expect(idsOf(ctx)).toEqual(["p1", "p2", "p3"]);
  });

  it("分享过的房源置顶，其余保持原相对顺序", async () => {
    mockStorage(["p2"]);
    const ctx = await loadList([A, B, C]);
    expect(idsOf(ctx)).toEqual(["p2", "p1", "p3"]);
  });

  it("多个置顶房源：保持彼此原相对顺序（稳定切分）", async () => {
    mockStorage(["p3", "p1"]);
    const ctx = await loadList([A, B, C]);
    expect(idsOf(ctx)).toEqual(["p1", "p3", "p2"]);
  });

  it("置顶记录含已不可见房源：仅可见项参与置顶", async () => {
    mockStorage(["p9", "p2"]);
    const ctx = await loadList([A, B, C]);
    expect(idsOf(ctx)).toEqual(["p2", "p1", "p3"]);
  });
});
