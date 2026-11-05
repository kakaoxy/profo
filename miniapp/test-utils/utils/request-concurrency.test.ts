import { beforeEach, describe, expect, it, vi } from "vitest";
import { request } from "../../utils/request";

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

function makeToken(payload: Record<string, unknown>): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  const encoded = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `header.${encoded}.signature`;
}

function expiredToken(aud: "c" | "admin"): string {
  return makeToken({ aud, exp: Math.floor(Date.now() / 1000) - 60 });
}

beforeEach(() => {
  storage.clear();
  handlers = [];
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

describe("prepareAuthorization 并发续期", () => {
  it("并发过期 C 请求只发起一次 refresh", async () => {
    storage.set("c_access_token", expiredToken("c"));
    storage.set("c_refresh_token", "c-ref");
    let refreshCalls = 0;
    let refreshOpts: WxRequestOptions | undefined;
    queueResponses([
      (opts) => {
        refreshCalls += 1;
        refreshOpts = opts;
      },
      (opts) => {
        expect(opts.header?.Authorization).toBe("Bearer c-new");
        opts.success({ statusCode: 200, data: { a: 1 } });
      },
      (opts) => {
        expect(opts.header?.Authorization).toBe("Bearer c-new");
        opts.success({ statusCode: 200, data: { b: 2 } });
      },
    ]);

    const p1 = request({ url: "/public/a" });
    const p2 = request({ url: "/public/b" });
    expect(refreshCalls).toBe(1);
    refreshOpts?.success({
      statusCode: 200,
      data: { access_token: "c-new", refresh_token: "c-ref-2" },
    });

    await expect(Promise.all([p1, p2])).resolves.toEqual([{ a: 1 }, { b: 2 }]);
    expect(refreshCalls).toBe(1);
  });

  it("纯 C 用户同一 refresh_token 的 C/后台并发只发起一次 refresh", async () => {
    storage.set("access_token", expiredToken("c"));
    storage.set("refresh_token", "same-ref");
    storage.set("c_access_token", expiredToken("c"));
    storage.set("c_refresh_token", "same-ref");
    let refreshCalls = 0;
    queueResponses([
      (opts) => {
        refreshCalls += 1;
        expect(opts.url).toContain("/public/auth/refresh");
        opts.success({
          statusCode: 200,
          data: { access_token: "new-token", refresh_token: "same-ref-2" },
        });
      },
      (opts) => {
        expect(opts.header?.Authorization).toBe("Bearer new-token");
        opts.success({ statusCode: 200, data: opts.url.includes("/public/a") ? { a: 1 } : { b: 2 } });
      },
      (opts) => {
        expect(opts.header?.Authorization).toBe("Bearer new-token");
        opts.success({ statusCode: 200, data: opts.url.includes("/public/a") ? { a: 1 } : { b: 2 } });
      },
    ]);

    const p1 = request({ url: "/public/a" });
    const p2 = request({ url: "/projects/b" });
    const results = await Promise.all([p1, p2]);
    expect(results).toEqual([{ a: 1 }, { b: 2 }]);
    expect(refreshCalls).toBe(1);
  });

  it("并发过期 admin 请求只发起一次 refresh", async () => {
    storage.set("access_token", expiredToken("admin"));
    storage.set("refresh_token", "ref");
    let refreshCalls = 0;
    let refreshOpts: WxRequestOptions | undefined;
    queueResponses([
      (opts) => {
        refreshCalls += 1;
        refreshOpts = opts;
      },
      (opts) => {
        expect(opts.header?.Authorization).toBe("Bearer admin-new");
        opts.success({ statusCode: 200, data: { a: 1 } });
      },
      (opts) => {
        expect(opts.header?.Authorization).toBe("Bearer admin-new");
        opts.success({ statusCode: 200, data: { b: 2 } });
      },
    ]);

    const p1 = request({ url: "/projects/a" });
    const p2 = request({ url: "/projects/b" });
    expect(refreshCalls).toBe(1);
    refreshOpts?.success({
      statusCode: 200,
      data: { access_token: "admin-new", refresh_token: "ref-2" },
    });

    await expect(Promise.all([p1, p2])).resolves.toEqual([{ a: 1 }, { b: 2 }]);
    expect(refreshCalls).toBe(1);
  });
});
