/**
 * 「评估详情」页测试：can_follow_up 能力位（内部员工 / 纯 C 端客户）、
 * 跟进半屏面板提交流（成功重拉详情）、409 关闭承接.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPageHarness, createRequestMock, pendingReqs, resetTestStubs, wxStubs } from "../test-harness";

vi.mock("../../utils/request", () => createRequestMock());
vi.mock("../../utils/token", () => ({
  getAccessToken: vi.fn(() => "admin-tok"),
  getCAccessToken: vi.fn(() => "c-tok"),
}));
vi.mock("../../utils/url", () => ({
  resolveAssetUrl: vi.fn((u: string) => u || ""),
}));
vi.mock("../../utils/valuation-display", () => ({
  followupMethodLabel: (m: string) => m,
  formatDate: () => "2026-01-01",
  sliceFollowups: (all: unknown[], page: number, pageSize: number) =>
    all.slice((page - 1) * pageSize, page * pageSize),
}));

beforeAll(async () => {
  await import("../../pages/valuation/detail/index");
});

type AnyRecord = Record<string, any>;

function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

function detailFixture(overrides: AnyRecord = {}) {
  return {
    id: "d1",
    community_name: "仁恒河滨城",
    layout: "2室1厅",
    area: 89,
    floor_info: "18/32层",
    orientation: "南",
    total_price: 880,
    unit_price: null,
    eval_price: 868,
    expected_price: 880,
    status: "pending_visit",
    status_display: "待看房",
    status_color: "#2196F3",
    remarks: null,
    images: [],
    image_thumbnails: null,
    follow_ups: [{ id: "f1", method: "phone", content: "电话沟通", followed_at: "2026-01-05T00:00:00Z" }],
    can_follow_up: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function detailGet(index = 0) {
  const req = pendingReqs().filter((r) => r.opts.url === "/public/leads/d1" && !(r.opts as AnyRecord).method)[index];
  if (!req) {
    throw new Error("detail GET not found");
  }
  return req;
}

function followupPost() {
  const req = pendingReqs().find(
    (r) => r.opts.url === "/public/leads/my/acquired/d1/follow-ups" && (r.opts as AnyRecord).method === "POST",
  );
  if (!req) {
    throw new Error("follow-up POST not found");
  }
  return req;
}

beforeEach(() => {
  resetTestStubs();
});

describe("can_follow_up 能力位", () => {
  it("内部员工（can_follow_up=true）：出现录入入口，登记成功后重拉详情", async () => {
    const ctx = createPageHarness({});
    ctx.onLoad({ id: "d1" });
    detailGet().resolve(detailFixture());
    await flush();
    expect(ctx.data.canFollowup).toBe(true);

    ctx.openFollowupPanel();
    expect(ctx.data.panelMode).toBe("followup");
    expect(ctx.data.followupMethod).toBe("phone");

    ctx.onFollowupMethodTap({ currentTarget: { dataset: { method: "visit" } } });
    ctx.onFollowupContentInput({ detail: { value: "实地带看完成" } });
    ctx.submitFollowup();

    followupPost().resolve({ id: "f2", method: "visit", content: "实地带看完成", followed_at: "2026-01-06T00:00:00Z" });
    await flush();
    expect(wxStubs.showToast).toHaveBeenCalledWith({ title: "已登记跟进", icon: "success" });
    expect(ctx.data.panelMode).toBe("");

    // 重拉详情：跟进记录即时出现（第二次 GET 返回两条跟进）
    expect(pendingReqs().filter((r) => r.opts.url === "/public/leads/d1").length).toBe(2);
    detailGet(1).resolve(
      detailFixture({
        follow_ups: [
          { id: "f2", method: "visit", content: "实地带看完成", followed_at: "2026-01-06T00:00:00Z" },
          { id: "f1", method: "phone", content: "电话沟通", followed_at: "2026-01-05T00:00:00Z" },
        ],
      }),
    );
    await flush();
    expect(ctx.data.allFollowups).toHaveLength(2);
    expect(ctx.data.allFollowups[0].content).toBe("实地带看完成");
  }, 10_000);

  it("纯 C 端客户（can_follow_up=false）：无录入入口，openFollowupPanel 不生效", async () => {
    const ctx = createPageHarness({});
    ctx.onLoad({ id: "d1" });
    detailGet().resolve(detailFixture({ can_follow_up: false }));
    await flush();
    expect(ctx.data.canFollowup).toBe(false);

    ctx.openFollowupPanel();
    expect(ctx.data.panelMode).toBe("");
    // 未发出任何 POST
    expect(pendingReqs().some((r) => (r.opts as AnyRecord).method === "POST")).toBe(false);
  });

  it("空内容阻止提交", async () => {
    const ctx = createPageHarness({});
    ctx.onLoad({ id: "d1" });
    detailGet().resolve(detailFixture());
    await flush();

    ctx.openFollowupPanel();
    ctx.submitFollowup();
    expect(ctx.data.formError).toBe("请填写跟进内容");
    expect(pendingReqs().some((r) => (r.opts as AnyRecord).method === "POST")).toBe(false);
  });

  it("提交 409：关闭面板 toast 承接并重拉详情", async () => {
    const ctx = createPageHarness({});
    ctx.onLoad({ id: "d1" });
    detailGet().resolve(detailFixture());
    await flush();

    ctx.openFollowupPanel();
    ctx.onFollowupContentInput({ detail: { value: "尝试跟进" } });
    ctx.submitFollowup();
    followupPost().reject({ statusCode: 409, body: { message: "该线索已关闭，无法登记跟进" } });
    await flush();

    expect(ctx.data.panelMode).toBe("");
    expect(wxStubs.showToast).toHaveBeenCalledWith({ title: "该线索已关闭，无法登记跟进", icon: "none" });
    // 重拉详情承接最新状态
    detailGet(1).resolve(detailFixture({ can_follow_up: false, status: "lost_to_competitor" }));
    await flush();
    expect(ctx.data.canFollowup).toBe(false);
  }, 10_000);
});
