/**
 * 「估价提交」页 × 经纪人代填身份（V06 REQ-M08-002/003）回归.
 *
 * 锁死三件事：
 * 1. 已认证且有绑定门店：展示「门店 · 经纪人」；
 * 2. 未绑定门店（独立经纪人）：标记待审核，提交前需确认，确认后仍可提交；
 * 3. 非经纪人 / 未登录：不展示横幅，按普通用户流程。
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPageHarness,
  createRequestMock,
  pendingReqs,
  resetTestStubs,
  wxStubs,
  type PendingRequest,
} from "../test-harness";

vi.mock("../../utils/request", () => createRequestMock());
vi.mock("../../utils/token", () => ({
  getAccessToken: vi.fn(() => "admin-tok"),
  getCAccessToken: vi.fn(() => "c-tok"),
  getUserIdFromAccessToken: vi.fn(() => ""),
  hasValidAdminToken: vi.fn(() => false),
}));
vi.mock("../../utils/url", () => ({
  resolveAssetUrl: vi.fn((u: string) => u || ""),
}));
vi.mock("../../utils/format", () => ({
  formatThousands: vi.fn((n: number) => String(n)),
}));
vi.mock("../../utils/visitor", () => ({
  getVisitorId: vi.fn(() => "v1"),
}));
vi.mock("../../utils/valuation-share", () => ({
  buildValuationSharePath: vi.fn(() => "/pages/valuation/submit/index"),
  fetchEmployeeId: vi.fn(async () => ""),
  parseValuationQuery: vi.fn(() => ({ referrer: "" })),
  VALUATION_SHARE_IMAGE: "",
  VALUATION_SHARE_TITLE: "",
}));
vi.mock("../../utils/valuation-notify", () => ({
  fetchValuationSubscribeTemplate: vi.fn(async () => null),
  requestValuationPriceSubscribe: vi.fn((_id: string, cb: () => void) => cb()),
}));

beforeAll(async () => {
  await import("../../pages/valuation/submit/index");
});

type AnyRecord = Record<string, any>;

function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

function lastReq(url: string): PendingRequest | undefined {
  return pendingReqs()
    .filter((r) => r.opts.url === url)
    .pop();
}

const showModalMock = vi.fn();
(wxStubs as AnyRecord).showModal = showModalMock;

beforeEach(() => {
  resetTestStubs();
  showModalMock.mockReset();
});

describe("经纪人代填身份（V06）", () => {
  it("已认证且绑定门店 → 展示「门店 · 经纪人」", async () => {
    const ctx = createPageHarness({});
    const loading = ctx.loadBrokerIdentity();

    const brokerReq = lastReq("/public/merchant/brokers/me");
    expect(brokerReq).toBeTruthy();
    brokerReq!.resolve({ id: "b1", name: "张三", store_id: "s1" });
    await flush();

    const storeReq = lastReq("/public/merchant/brokers/me/store");
    expect(storeReq).toBeTruthy();
    storeReq!.resolve({ id: "s1", store_name: "花木旗舰店" });
    await loading;

    expect(ctx.data.brokerName).toBe("张三");
    expect(ctx.data.brokerStoreName).toBe("花木旗舰店");
    expect(ctx.data.brokerStoreMissing).toBe(false);
    expect(ctx.data.brokerStoreUnavailable).toBe(false);
  });

  it("已认证但未绑定门店 → 独立经纪人 + 待审核，不请求门店接口", async () => {
    const ctx = createPageHarness({});
    const loading = ctx.loadBrokerIdentity();

    lastReq("/public/merchant/brokers/me")!.resolve({
      id: "b2",
      name: "李四",
      store_id: null,
    });
    await loading;

    expect(ctx.data.brokerName).toBe("李四");
    expect(ctx.data.brokerStoreMissing).toBe(true);
    expect(ctx.data.brokerStoreName).toBe("");
    expect(lastReq("/public/merchant/brokers/me/store")).toBeUndefined();
  });

  it("非经纪人（404）→ 不展示横幅，按普通用户降级", async () => {
    const ctx = createPageHarness({});
    const loading = ctx.loadBrokerIdentity();

    lastReq("/public/merchant/brokers/me")!.reject(new Error("404"));
    await loading;

    expect(ctx.data.brokerName).toBe("");
    expect(ctx.data.brokerStoreMissing).toBe(false);
    expect(ctx.data.brokerStoreUnavailable).toBe(false);
  });

  it("独立经纪人提交：确认后继续提交，线索仍走 /public/leads", async () => {
    const ctx = createPageHarness({ brokerName: "李四", brokerStoreMissing: true });
    const body = { community_name: "梅花新村", floor_info: "5/18" } as AnyRecord;

    showModalMock.mockImplementation((opts: AnyRecord) => opts.success({ confirm: true }));
    void ctx.performSubmit(body);
    await flush();

    expect(showModalMock).toHaveBeenCalledTimes(1);
    expect(showModalMock.mock.calls[0][0].content).toContain("待审核");
    expect(lastReq("/public/leads")).toBeTruthy();
    expect(ctx.data.submitting).toBe(true);
  });

  it("独立经纪人提交：取消确认则不提交", async () => {
    const ctx = createPageHarness({ brokerName: "李四", brokerStoreMissing: true });

    showModalMock.mockImplementation((opts: AnyRecord) => opts.success({ confirm: false }));
    void ctx.performSubmit({ community_name: "梅花新村", floor_info: "5/18" } as AnyRecord);
    await flush();

    expect(showModalMock).toHaveBeenCalledTimes(1);
    expect(lastReq("/public/leads")).toBeUndefined();
    expect(ctx.data.submitting).toBe(false);
  });

  it("重复线索 409：确认后带 confirm_duplicate 重提，取消则停止", async () => {
    const ctx = createPageHarness({});
    const body = { community_name: "梅花新村", floor_info: "5/18" } as AnyRecord;

    void ctx.performSubmit(body);
    await flush();
    const first = lastReq("/public/leads");
    expect(first).toBeTruthy();
    first!.reject({ statusCode: 409 });
    await flush();

    expect(showModalMock).toHaveBeenCalledTimes(1);
    const modal = showModalMock.mock.calls[0][0] as AnyRecord;
    expect(modal.title).toContain("重复");

    modal.success({ confirm: true });
    await flush();
    const retry = lastReq("/public/leads");
    expect(retry).toBeTruthy();
    expect((retry!.opts.data as AnyRecord).confirm_duplicate).toBe(true);
  });

  it("重复线索 409：取消确认则不重提", async () => {
    const ctx = createPageHarness({});

    void ctx.performSubmit({ community_name: "梅花新村", floor_info: "5/18" } as AnyRecord);
    await flush();
    lastReq("/public/leads")!.reject({ statusCode: 409 });
    await flush();

    const modal = showModalMock.mock.calls[0][0] as AnyRecord;
    modal.success({ confirm: false });
    await flush();

    expect(pendingReqs().filter((r) => r.opts.url === "/public/leads")).toHaveLength(1);
    expect(ctx.data.submitting).toBe(false);
  });
});
