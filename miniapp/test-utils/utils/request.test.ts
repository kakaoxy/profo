/**
 * request 封装单测：401 双端分流刷新、并发单飞、retried 防循环、
 * /public 令牌选择、GET 网络重试、timeout 覆盖、内存缓存.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { request, getCacheData, refreshCAccessToken, DEFAULT_TIMEOUT, registerCSessionRecovery } from "../../utils/request";

type WxRequestOptions = {
  url: string;
  method?: string;
  data?: unknown;
  header?: Record<string, string>;
  timeout?: number;
  success: (res: { statusCode: number; data: unknown }) => void;
  fail: (err: { errMsg: string }) => void;
};

const storage = new Map<string, unknown>();
let handlers: Array<(opts: WxRequestOptions) => void> = [];

function queueResponses(hs: Array<(opts: WxRequestOptions) => void>): void {
  handlers = hs;
}

/** 构造 payload 可解析的 JWT（签名不参与前端解析）; */
function makeToken(payload: Record<string, unknown>): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  const encoded = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `header.${encoded}.signature`;
}

/** 已过期的 access_token（提前 60s）. */
function expiredToken(aud: "c" | "admin"): string {
  return makeToken({ aud, exp: Math.floor(Date.now() / 1000) - 60 });
}

beforeEach(() => {
  storage.clear();
  handlers = [];
  // 默认不恢复 C 端会话（等价于 app.ts 未注册回调），避免用例间串味；
  // 需要恢复行为的用例自行 registerCSessionRecovery
  registerCSessionRecovery(async () => false);
  vi.stubGlobal("wx", {
    request: vi.fn((opts: WxRequestOptions) => {
      const handler = handlers.shift();
      if (handler) {
        handler(opts);
      }
    }),
    getStorageSync: vi.fn((key: string) => storage.get(key)),
    setStorageSync: vi.fn((key: string, val: unknown) => {
      storage.set(key, val);
    }),
    removeStorageSync: vi.fn((key: string) => {
      storage.delete(key);
    }),
  });
});

function ok(data: unknown, statusCode = 200) {
  return (opts: WxRequestOptions) => opts.success({ statusCode, data });
}

describe("令牌注入", () => {
  it("非 /public 路径注入 access_token", async () => {
    storage.set("access_token", "admin-tok");
    queueResponses([
      (opts) => {
        expect(opts.header?.Authorization).toBe("Bearer admin-tok");
        opts.success({ statusCode: 200, data: {} });
      },
    ]);
    await request({ url: "/projects" });
  });

  it("/public 路径优先注入 c_access_token", async () => {
    storage.set("access_token", "admin-tok");
    storage.set("c_access_token", "c-tok");
    queueResponses([
      (opts) => {
        expect(opts.header?.Authorization).toBe("Bearer c-tok");
        opts.success({ statusCode: 200, data: {} });
      },
    ]);
    await request({ url: "/public/leads/mine" });
  });

  it("显式 Authorization 优先，不被自动注入覆盖", async () => {
    storage.set("access_token", "admin-tok");
    queueResponses([
      (opts) => {
        expect(opts.header?.Authorization).toBe("Bearer explicit");
        opts.success({ statusCode: 200, data: {} });
      },
    ]);
    await request({ url: "/projects", header: { Authorization: "Bearer explicit" } });
  });

  it("skipAuth 不注入令牌", async () => {
    storage.set("access_token", "admin-tok");
    queueResponses([
      (opts) => {
        expect(opts.header?.Authorization).toBeUndefined();
        opts.success({ statusCode: 200, data: {} });
      },
    ]);
    await request({ url: "/public/stats/platform", skipAuth: true });
  });
});

describe("令牌即将过期时发送前主动续期", () => {
  it("/public 路径过期 C 令牌 → 先刷新再请求，不产生首次 401", async () => {
    storage.set("c_access_token", expiredToken("c"));
    storage.set("c_refresh_token", "c-ref");
    const calls: string[] = [];
    queueResponses([
      (opts) => {
        calls.push("refresh");
        expect(opts.url).toContain("/public/auth/refresh");
        expect(opts.data).toMatchObject({ refresh_token: "c-ref" });
        opts.success({
          statusCode: 200,
          data: { access_token: "c-new", refresh_token: "c-ref-2" },
        });
      },
      (opts) => {
        calls.push("me");
        expect(opts.url).toContain("/public/auth/me");
        expect(opts.header?.Authorization).toBe("Bearer c-new");
        opts.success({ statusCode: 200, data: { ok: true } });
      },
    ]);

    await expect(request({ url: "/public/auth/me" })).resolves.toEqual({ ok: true });
    expect(calls).toEqual(["refresh", "me"]);
  });

  it("后台路径过期 admin 令牌 → 先刷新再请求，不产生首次 401", async () => {
    storage.set("access_token", expiredToken("admin"));
    storage.set("refresh_token", "ref");
    const calls: string[] = [];
    queueResponses([
      (opts) => {
        calls.push("refresh");
        expect(opts.url).toContain("/auth/refresh");
        expect(opts.data).toMatchObject({ refresh_token: "ref" });
        opts.success({
          statusCode: 200,
          data: { access_token: "new-admin", refresh_token: "ref-2" },
        });
      },
      (opts) => {
        calls.push("me");
        expect(opts.url).toContain("/auth/me");
        expect(opts.header?.Authorization).toBe("Bearer new-admin");
        opts.success({ statusCode: 200, data: { ok: true } });
      },
    ]);

    await expect(request({ url: "/auth/me" })).resolves.toEqual({ ok: true });
    expect(calls).toEqual(["refresh", "me"]);
  });

  it("显式 Authorization 的过期 C 令牌同样先刷新", async () => {
    storage.set("c_refresh_token", "c-ref");
    const calls: string[] = [];
    queueResponses([
      (opts) => {
        calls.push("refresh");
        expect(opts.url).toContain("/public/auth/refresh");
        opts.success({
          statusCode: 200,
          data: { access_token: "c-new", refresh_token: "c-ref-2" },
        });
      },
      (opts) => {
        calls.push("me");
        expect(opts.url).toContain("/public/auth/me");
        expect(opts.header?.Authorization).toBe("Bearer c-new");
        opts.success({ statusCode: 200, data: { ok: true } });
      },
    ]);

    await expect(
      request({
        url: "/public/auth/me",
        header: { Authorization: `Bearer ${expiredToken("c")}` },
      }),
    ).resolves.toEqual({ ok: true });
    expect(calls).toEqual(["refresh", "me"]);
  });
});

describe("401 自动刷新重试", () => {
  it("后台接口 401 → 刷新 admin 令牌 → 用新令牌重试", async () => {
    storage.set("access_token", "old");
    storage.set("refresh_token", "ref");
    queueResponses([
      ok({}, 401),
      (opts) => {
        expect(opts.url).toContain("/auth/refresh");
        opts.success({
          statusCode: 200,
          data: { access_token: "new-admin", refresh_token: "ref2" },
        });
      },
      (opts) => {
        expect(opts.header?.Authorization).toBe("Bearer new-admin");
        opts.success({ statusCode: 200, data: { ok: true } });
      },
    ]);
    const res = await request({ url: "/projects" });
    expect(res).toEqual({ ok: true });
    expect(storage.get("access_token")).toBe("new-admin");
  });

  it("/public 接口 401 → 刷新 C 端令牌（/public/auth/refresh）", async () => {
    storage.set("access_token", "admin");
    storage.set("c_access_token", "c-old");
    storage.set("c_refresh_token", "c-ref");
    queueResponses([
      ok({}, 401),
      (opts) => {
        expect(opts.url).toContain("/public/auth/refresh");
        opts.success({
          statusCode: 200,
          data: { access_token: "c-new", refresh_token: "c-ref2" },
        });
      },
      (opts) => {
        expect(opts.header?.Authorization).toBe("Bearer c-new");
        opts.success({ statusCode: 200, data: { ok: true } });
      },
    ]);
    const res = await request({ url: "/public/leads/mine" });
    expect(res).toEqual({ ok: true });
  });

  it("并发多个 401 只刷新一次（refresh 单飞）", async () => {
    storage.set("access_token", "old");
    storage.set("refresh_token", "ref");
    let refreshCalls = 0;
    // 同步调用序列：#1 /x 401 → #2 refresh（同步发起）→ #3 /y 401（复用 refreshPromise，不再发起）
    // → #4 /x 重试成功 → #5 /y 重试成功
    queueResponses([
      ok({}, 401),
      (opts) => {
        refreshCalls += 1;
        expect(opts.url).toContain("/auth/refresh");
        opts.success({
          statusCode: 200,
          data: { access_token: "new", refresh_token: "ref2" },
        });
      },
      ok({}, 401),
      ok({ a: 1 }),
      ok({ b: 2 }),
    ]);
    const [r1, r2] = await Promise.all([request({ url: "/x" }), request({ url: "/y" })]);
    expect(r1).toEqual({ a: 1 });
    expect(r2).toEqual({ b: 2 });
    expect(refreshCalls).toBe(1);
  });

  it("刷新后仍 401 不再重试（retried 防循环），直接 reject", async () => {
    storage.set("access_token", "old");
    storage.set("refresh_token", "ref");
    let refreshCalls = 0;
    queueResponses([
      ok({}, 401),
      (opts) => {
        refreshCalls += 1;
        opts.success({
          statusCode: 200,
          data: { access_token: "new", refresh_token: "ref2" },
        });
      },
      ok({}, 401),
    ]);
    await expect(request({ url: "/x" })).rejects.toMatchObject({ statusCode: 401 });
    expect(refreshCalls).toBe(1);
  });

  it("刷新失败（refresh_token 失效）清除令牌并 reject 401", async () => {
    storage.set("access_token", "old");
    storage.set("refresh_token", "bad");
    queueResponses([
      ok({}, 401),
      (opts) => opts.success({ statusCode: 401, data: {} }),
    ]);
    await expect(request({ url: "/x" })).rejects.toMatchObject({ statusCode: 401 });
    expect(storage.get("access_token")).toBeUndefined();
    expect(storage.get("refresh_token")).toBeUndefined();
  });

  it("HTTP 非 2xx 非 401 直接 reject", async () => {
    queueResponses([ok({ message: "无权限" }, 403)]);
    await expect(request({ url: "/x" })).rejects.toMatchObject({
      statusCode: 403,
      body: { message: "无权限" },
    });
  });
});

describe("GET 网络失败重试（1 次 300ms 退避）", () => {
  it("首次网络失败 → 重试成功", async () => {
    queueResponses([
      (opts) => opts.fail({ errMsg: "request:fail timeout" }),
      ok("retried-ok"),
    ]);
    const res = await request({ url: "/g", method: "GET" });
    expect(res).toBe("retried-ok");
  });

  it("重试仍失败 → reject 网络错误", async () => {
    queueResponses([
      (opts) => opts.fail({ errMsg: "fail-1" }),
      (opts) => opts.fail({ errMsg: "fail-2" }),
    ]);
    await expect(request({ url: "/g", method: "GET" })).rejects.toMatchObject({
      errMsg: "fail-2",
    });
  });

  it("POST 非幂等不重试", async () => {
    queueResponses([(opts) => opts.fail({ errMsg: "fail-1" })]);
    await expect(request({ url: "/p", method: "POST", data: {} })).rejects.toMatchObject({
      errMsg: "fail-1",
    });
    expect((wx.request as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });
});

describe("timeout", () => {
  it("默认使用全局常量", async () => {
    queueResponses([
      (opts) => {
        expect(opts.timeout).toBe(DEFAULT_TIMEOUT);
        opts.success({ statusCode: 200, data: 1 });
      },
    ]);
    await request({ url: "/t" });
  });

  it("调用方可覆盖 timeout", async () => {
    queueResponses([
      (opts) => {
        expect(opts.timeout).toBe(3000);
        opts.success({ statusCode: 200, data: 1 });
      },
    ]);
    await request({ url: "/t", timeout: 3000 });
  });
});

describe("内存缓存（cacheKey）", () => {
  it("GET 成功后写入缓存，getCacheData 可命中", async () => {
    queueResponses([ok([1, 2, 3])]);
    await request({ url: "/list", cacheKey: "k-list" });
    expect(getCacheData("k-list")).toEqual([1, 2, 3]);
  });

  it("未命中返回 undefined", () => {
    expect(getCacheData("k-nope")).toBeUndefined();
  });
});

describe("C 端会话恢复（refresh_token 失效后静默重登）", () => {
  /**
   * 缺陷复现（线上 admin/users 之外的第二个问题）：C 端 refresh_token 过期/失效时，
   * 刷新链路只能返回 null 并清空令牌，小程序进入「看起来已登录、但 /public/* 全部 401」
   * 的僵死状态——绑定已有账号（/public/users/merge）永远提示「绑定失败」。
   * 修复：刷新失败后静默重新微信登录一次，用新令牌重试原请求。
   */
  it("C 端刷新失败 → 静默重登 → 用新令牌重试原请求成功", async () => {
    storage.set("access_token", "admin-tok");
    storage.set("c_access_token", "stale-c");
    storage.set("c_refresh_token", "stale-c-refresh");
    let recoveryCalls = 0;
    registerCSessionRecovery(async () => {
      recoveryCalls += 1;
      // 模拟 wechatLogin 成功：写入新令牌
      storage.set("c_access_token", "fresh-c");
      storage.set("c_refresh_token", "fresh-c-refresh");
      return true;
    });
    queueResponses([
      // 1) 原请求 401（c_access_token 已过期）
      ok({ code: 401, message: "无法验证凭据" }, 401),
      // 2) /public/auth/refresh 401（refresh_token 已失效）
      ok({ code: 401, message: "刷新令牌无效" }, 401),
      // 3) 静默重登后重试原请求，携带新 C 端令牌
      (opts) => {
        expect(opts.url).toContain("/public/users/merge");
        expect(opts.header?.Authorization).toBe("Bearer fresh-c");
        opts.success({ statusCode: 200, data: { success: true } });
      },
    ]);

    const res = await request<{ success: boolean }>({
      url: "/public/users/merge",
      method: "POST",
      data: { type: "internal", username: "zhangli", password: "***" },
    });

    expect(res).toEqual({ success: true });
    expect(recoveryCalls).toBe(1);
    expect(storage.get("c_access_token")).toBe("fresh-c");
  });

  it("会话恢复失败 → reject 原始 401，且只尝试恢复一次", async () => {
    storage.set("c_access_token", "stale-c");
    storage.set("c_refresh_token", "stale-c-refresh");
    let recoveryCalls = 0;
    registerCSessionRecovery(async () => {
      recoveryCalls += 1;
      return false;
    });
    queueResponses([
      ok({ code: 401, message: "无法验证凭据" }, 401),
      ok({ code: 401, message: "刷新令牌无效" }, 401),
    ]);

    await expect(
      request({ url: "/public/users/merge", method: "POST", data: {} }),
    ).rejects.toMatchObject({ statusCode: 401 });
    expect(recoveryCalls).toBe(1);
  });

  it("C 端刷新成功时不触发会话恢复", async () => {
    storage.set("c_access_token", "c-old");
    storage.set("c_refresh_token", "c-ref");
    let recoveryCalls = 0;
    registerCSessionRecovery(async () => {
      recoveryCalls += 1;
      return true;
    });
    queueResponses([
      ok({}, 401),
      (opts) => {
        expect(opts.url).toContain("/public/auth/refresh");
        opts.success({ statusCode: 200, data: { access_token: "c-new", refresh_token: "c-ref2" } });
      },
      (opts) => {
        expect(opts.header?.Authorization).toBe("Bearer c-new");
        opts.success({ statusCode: 200, data: { ok: true } });
      },
    ]);

    await expect(request({ url: "/public/leads/mine" })).resolves.toEqual({ ok: true });
    expect(recoveryCalls).toBe(0);
  });

  it("后台接口 401 不触发 C 端会话恢复", async () => {
    storage.set("access_token", "admin-old");
    storage.set("refresh_token", "admin-ref");
    let recoveryCalls = 0;
    registerCSessionRecovery(async () => {
      recoveryCalls += 1;
      return true;
    });
    queueResponses([
      ok({}, 401),
      (opts) => opts.success({ statusCode: 401, data: {} }),
    ]);

    await expect(request({ url: "/projects" })).rejects.toMatchObject({ statusCode: 401 });
    expect(recoveryCalls).toBe(0);
  });
});

describe("401 分流：业务错误与续期异常", () => {
  it("业务层 401（body.code≠401）不刷新/不恢复/不重试（避免重复提交与限流额度消耗）", async () => {
    storage.set("c_access_token", "c-tok");
    storage.set("c_refresh_token", "c-ref");
    let recoveryCalls = 0;
    registerCSessionRecovery(async () => {
      recoveryCalls += 1;
      return true;
    });
    // /public/users/merge 密码错误：HTTP 401 + body.code=40001，并非令牌失效
    queueResponses([ok({ code: 40001, message: "INVALID_CREDENTIALS" }, 401)]);

    await expect(
      request({ url: "/public/users/merge", method: "POST", data: {} }),
    ).rejects.toMatchObject({ statusCode: 401, body: { code: 40001 } });
    expect(recoveryCalls).toBe(0);
    expect((wx.request as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it("续期回调同步抛异常时请求仍以 401 reject（Promise 不挂起）", async () => {
    storage.set("c_access_token", "c-tok");
    storage.set("c_refresh_token", "c-ref");
    // 同步抛异常的回调：renewCToken 会 reject，请求层必须兜底 reject 而非永久 pending
    registerCSessionRecovery((() => {
      throw new Error("boom");
    }) as () => Promise<boolean>);
    queueResponses([ok({ code: 401 }, 401), ok({}, 401)]);

    await expect(
      request({ url: "/public/users/merge", method: "POST", data: {} }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe("刷新失败状态码与纯 C 双槽令牌", () => {
  it("后台刷新接口 500 → 保留令牌，仅以原 401 失败", async () => {
    storage.set("access_token", "old-admin");
    storage.set("refresh_token", "admin-ref");
    queueResponses([
      ok({}, 401),
      (opts) => {
        expect(opts.url).toContain("/auth/refresh");
        opts.success({ statusCode: 500, data: {} });
      },
    ]);

    await expect(request({ url: "/projects" })).rejects.toMatchObject({ statusCode: 401 });
    expect(storage.get("access_token")).toBe("old-admin");
    expect(storage.get("refresh_token")).toBe("admin-ref");
  });

  it("C 端刷新接口 500 → 保留 C 端令牌，仅以原 401 失败", async () => {
    storage.set("c_access_token", "old-c");
    storage.set("c_refresh_token", "c-ref");
    queueResponses([
      ok({}, 401),
      (opts) => {
        expect(opts.url).toContain("/public/auth/refresh");
        opts.success({ statusCode: 500, data: {} });
      },
    ]);

    await expect(request({ url: "/public/leads/mine" })).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(storage.get("c_access_token")).toBe("old-c");
    expect(storage.get("c_refresh_token")).toBe("c-ref");
  });

  it("纯 C 用户刷新成功后同步主槽（双槽令牌一致）", async () => {
    storage.set("access_token", "old-main");
    storage.set("refresh_token", "same-ref");
    storage.set("c_access_token", "old-c");
    storage.set("c_refresh_token", "same-ref");
    queueResponses([
      (opts) => {
        expect(opts.url).toContain("/public/auth/refresh");
        opts.success({
          statusCode: 200,
          data: { access_token: "new-token", refresh_token: "new-ref" },
        });
      },
    ]);

    await expect(refreshCAccessToken()).resolves.toBe("new-token");
    expect(storage.get("access_token")).toBe("new-token");
    expect(storage.get("refresh_token")).toBe("new-ref");
    expect(storage.get("c_access_token")).toBe("new-token");
    expect(storage.get("c_refresh_token")).toBe("new-ref");
  });

  it("纯 C 用户历史双槽不一致时刷新仍同步主槽", async () => {
    storage.set("access_token", makeToken({ aud: "c", exp: Math.floor(Date.now() / 1000) + 3600, sub: "main" }));
    storage.set("refresh_token", makeToken({ aud: "c", exp: Math.floor(Date.now() / 1000) + 3600, sub: "main-ref" }));
    storage.set("c_access_token", "c-old");
    storage.set("c_refresh_token", makeToken({ aud: "c", exp: Math.floor(Date.now() / 1000) + 3600, sub: "c-ref" }));
    queueResponses([
      (opts) =>
        opts.success({
          statusCode: 200,
          data: { access_token: "c-new", refresh_token: "c-ref-new" },
        }),
    ]);

    await expect(refreshCAccessToken()).resolves.toBe("c-new");
    expect(storage.get("access_token")).toBe("c-new");
    expect(storage.get("refresh_token")).toBe("c-ref-new");
    expect(storage.get("c_access_token")).toBe("c-new");
    expect(storage.get("c_refresh_token")).toBe("c-ref-new");
  });

  it("纯 C 用户历史双槽不一致且刷新失效时清除主槽", async () => {
    storage.set("access_token", "old-main");
    storage.set("refresh_token", makeToken({ aud: "c", exp: Math.floor(Date.now() / 1000) + 3600, sub: "main-ref" }));
    storage.set("c_access_token", "old-c");
    storage.set("c_refresh_token", makeToken({ aud: "c", exp: Math.floor(Date.now() / 1000) + 3600, sub: "c-ref" }));
    queueResponses([(opts) => opts.success({ statusCode: 401, data: {} })]);

    await expect(refreshCAccessToken()).resolves.toBeNull();
    expect(storage.get("access_token")).toBeUndefined();
    expect(storage.get("refresh_token")).toBeUndefined();
    expect(storage.get("c_access_token")).toBeUndefined();
    expect(storage.get("c_refresh_token")).toBeUndefined();
  });

  it("内部员工后台刷新失效时不清除独立的 C 端令牌", async () => {
    storage.set("access_token", "old-admin");
    storage.set("refresh_token", "admin-ref");
    storage.set("c_access_token", "old-c");
    storage.set("c_refresh_token", makeToken({ aud: "c", exp: Math.floor(Date.now() / 1000) + 3600, sub: "c-ref" }));
    queueResponses([
      ok({}, 401),
      (opts) => {
        expect(opts.url).toContain("/auth/refresh");
        opts.success({ statusCode: 401, data: {} });
      },
    ]);

    await expect(request({ url: "/projects" })).rejects.toMatchObject({ statusCode: 401 });
    expect(storage.get("access_token")).toBeUndefined();
    expect(storage.get("refresh_token")).toBeUndefined();
    expect(storage.get("c_access_token")).toBe("old-c");
    expect(storage.get("c_refresh_token")).toBeDefined();
  });

  it("内部员工 C 端刷新不覆盖后台主槽", async () => {
    storage.set("access_token", "admin-token");
    storage.set("refresh_token", "admin-ref");
    storage.set("c_access_token", "c-old");
    storage.set("c_refresh_token", "c-ref");
    queueResponses([
      (opts) =>
        opts.success({
          statusCode: 200,
          data: { access_token: "c-new", refresh_token: "c-ref2" },
        }),
    ]);

    await expect(refreshCAccessToken()).resolves.toBe("c-new");
    expect(storage.get("access_token")).toBe("admin-token");
    expect(storage.get("refresh_token")).toBe("admin-ref");
    expect(storage.get("c_access_token")).toBe("c-new");
    expect(storage.get("c_refresh_token")).toBe("c-ref2");
  });

  it("纯 C 用户刷新令牌失效时同时清除主槽与 C 槽", async () => {
    storage.set("access_token", "old-main");
    storage.set("refresh_token", "same-ref");
    storage.set("c_access_token", "old-c");
    storage.set("c_refresh_token", "same-ref");
    queueResponses([(opts) => opts.success({ statusCode: 401, data: {} })]);

    await expect(refreshCAccessToken()).resolves.toBeNull();
    expect(storage.get("access_token")).toBeUndefined();
    expect(storage.get("refresh_token")).toBeUndefined();
    expect(storage.get("c_access_token")).toBeUndefined();
    expect(storage.get("c_refresh_token")).toBeUndefined();
  });
});
