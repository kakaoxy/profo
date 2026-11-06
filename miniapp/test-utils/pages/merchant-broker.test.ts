/**
 * 经纪人中心 × 我的档案契约回归.
 *
 * 后端已将「未认证经纪人」从 404 改为 200 null；页面必须进入认证表单（register），
 * 而不是停留在 loading/error，也不能继续请求门店与推荐记录。
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPageHarness,
  createRequestMock,
  pendingReqs,
  resetTestStubs,
  type PendingRequest,
} from "../test-harness";

vi.mock("../../utils/request", () => createRequestMock());
vi.mock("../../utils/token", () => ({
  getCAccessToken: vi.fn(() => "c-tok"),
}));

beforeAll(async () => {
  await import("../../pages/merchant/broker/index");
});

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function lastReq(url: string): PendingRequest | undefined {
  return pendingReqs()
    .filter((req) => req.opts.url === url)
    .pop();
}

beforeEach(() => {
  resetTestStubs();
});

describe("经纪人中心：我的档案为 200 null", () => {
  it("非经纪人 → 进入认证表单，不请求门店/推荐记录", async () => {
    const ctx = createPageHarness();
    const loading = ctx.load();

    const meReq = lastReq("/public/auth/me");
    expect(meReq).toBeTruthy();
    meReq!.resolve({ phone: "13800000000" });
    await flush();

    const brokerReq = lastReq("/public/merchant/brokers/me");
    expect(brokerReq).toBeTruthy();
    brokerReq!.resolve(null);
    await loading;

    expect(ctx.data.state).toBe("register");
    expect(ctx.data.broker).toBeNull();
    expect(lastReq("/public/merchant/brokers/me/store")).toBeUndefined();
    expect(lastReq("/public/merchant/brokers/me/leads")).toBeUndefined();
  });

  it("兼容旧后端 404 → 仍进入认证表单", async () => {
    const ctx = createPageHarness();
    const loading = ctx.load();

    lastReq("/public/auth/me")!.resolve({ phone: "13800000000" });
    await flush();

    lastReq("/public/merchant/brokers/me")!.reject({ statusCode: 404, body: {} });
    await loading;

    expect(ctx.data.state).toBe("register");
    expect(ctx.data.broker).toBeNull();
  });
});
