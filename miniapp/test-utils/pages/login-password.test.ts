/**
 * 账号密码登录页（login/password）测试.
 *
 * 覆盖缺陷修复行为：本页经 login/index 中转进入（导航栈「来源页→login/index→本页」），
 * from=valuation/recruit/booking 登录成功后须回退两层直达来源页（navigateBack delta=2），
 * 而非仅回退一层滞留登录页；栈深异常时按一层回退兜底。
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPageHarness, createRequestMock, pendingReqs, resetTestStubs, wxStubs } from "../test-harness";

vi.mock("../../utils/request", () => createRequestMock());
vi.mock("../../utils/token", () => ({
  // 令牌内容决定 aud：admin-tok → admin（触发双令牌链路），其余 → c
  getTokenAud: vi.fn((token: string) => (token === "admin-tok" ? "admin" : "c")),
}));

// getCurrentPages 桩：可变栈深，默认模拟「来源页→login/index→password」三层栈
let pageStackDepth = 3;
(globalThis as unknown as Record<string, unknown>).getCurrentPages = () =>
  Array.from({ length: pageStackDepth }, () => ({}));

beforeAll(async () => {
  await import("../../pages/login/password/index");
});

beforeEach(() => {
  resetTestStubs();
  pageStackDepth = 3;
});

type AnyRecord = Record<string, any>;

function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

/** 填表并提交，返回 onSubmit promise；请求由调用方手动 resolve. */
function submitWith(ctx: AnyRecord, from: string): Promise<void> {
  ctx.onLoad({ from });
  ctx.onUsernameInput({ detail: { value: "employee01" } });
  ctx.onPasswordInput({ detail: { value: "password123" } });
  return ctx.onSubmit();
}

function findReq(url: string) {
  const req = pendingReqs().find((r) => r.opts.url === url);
  if (!req) {
    throw new Error(`request not found: ${url}`);
  }
  return req;
}

describe("登录成功回跳链路", () => {
  it("from=valuation 三层栈登录成功后回退两层直达来源页（不滞留 login/index）", async () => {
    const ctx = createPageHarness({});
    const promise = submitWith(ctx, "valuation");

    findReq("/auth/token").resolve({ access_token: "c-token", refresh_token: "c-refresh" });
    await promise;
    await new Promise((r) => setTimeout(r, 450));

    expect(wxStubs.showToast).toHaveBeenCalledWith({ title: "登录成功", icon: "success" });
    // 回退两层：越过中转的 login/index 直达估价来源页
    expect(wxStubs.navigateBack).toHaveBeenCalledWith({ delta: 2 });
    expect(wxStubs.switchTab).not.toHaveBeenCalled();
  }, 10_000);

  it("recruit/booking 来源同样回退两层", async () => {
    const ctx = createPageHarness({});
    const promise = submitWith(ctx, "recruit");

    findReq("/auth/token").resolve({ access_token: "c-token", refresh_token: "c-refresh" });
    await promise;
    await new Promise((r) => setTimeout(r, 450));

    expect(wxStubs.navigateBack).toHaveBeenCalledWith({ delta: 2 });
  }, 10_000);

  it("栈深异常不足三层时按一层回退兜底", async () => {
    pageStackDepth = 2;
    const ctx = createPageHarness({});
    const promise = submitWith(ctx, "valuation");

    findReq("/auth/token").resolve({ access_token: "c-token", refresh_token: "c-refresh" });
    await promise;
    await new Promise((r) => setTimeout(r, 450));

    expect(wxStubs.navigateBack).toHaveBeenCalledWith({ delta: 1 });
  }, 10_000);

  it("from 为空（profile 入口）登录成功 switchTab 到 profile", async () => {
    const ctx = createPageHarness({});
    const promise = submitWith(ctx, "");

    findReq("/auth/token").resolve({ access_token: "c-token", refresh_token: "c-refresh" });
    await promise;

    expect(wxStubs.switchTab).toHaveBeenCalledWith({ url: "/pages/profile/index/index" });
    expect(wxStubs.navigateBack).not.toHaveBeenCalled();
  });

  it("后台登录 403（纯 C 端账号）回退 /public/auth/token 签发 C 端令牌", async () => {
    const ctx = createPageHarness({});
    const promise = submitWith(ctx, "valuation");

    findReq("/auth/token").reject({ statusCode: 403, body: { message: "无权登录后台" } });
    await flush();
    findReq("/public/auth/token").resolve({ access_token: "c-token", refresh_token: "c-refresh" });
    await promise;
    await new Promise((r) => setTimeout(r, 450));

    expect(wxStubs.setStorageSync).toHaveBeenCalledWith("access_token", "c-token");
    expect(wxStubs.setStorageSync).toHaveBeenCalledWith("c_access_token", "c-token");
    expect(wxStubs.navigateBack).toHaveBeenCalledWith({ delta: 2 });
  }, 10_000);

  it("登录失败展示可读错误信息，不触发回跳", async () => {
    const ctx = createPageHarness({});
    const promise = submitWith(ctx, "valuation");

    findReq("/auth/token").reject({ statusCode: 401, body: { message: "用户名或密码错误" } });
    await promise;

    expect(ctx.data.result).toEqual({ type: "failure", message: "用户名或密码错误" });
    expect(wxStubs.navigateBack).not.toHaveBeenCalled();
    expect(wxStubs.switchTab).not.toHaveBeenCalled();
  });
});
