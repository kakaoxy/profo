import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/**
 * config 模块的模块级常量在 import 时求值，
 * 测试不同环境需要 vi.resetModules() + 动态 import。
 */

// ─── getApiUrl ─────────────────────────────────────────────────────
describe("getApiUrl", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("路径以 / 开头时直接拼接", async () => {
    vi.stubEnv("SERVER_API_URL", "http://127.0.0.1:8000");
    const { getApiUrl } = await import("./config");
    expect(getApiUrl("/api/v1/users")).toBe("http://127.0.0.1:8000/api/v1/users");
  });

  it("路径不以 / 开头时自动补 /", async () => {
    vi.stubEnv("SERVER_API_URL", "http://127.0.0.1:8000");
    const { getApiUrl } = await import("./config");
    expect(getApiUrl("api/v1/users")).toBe("http://127.0.0.1:8000/api/v1/users");
  });

  it("未设 SERVER_API_URL 时，开发环境回退到 NEXT_PUBLIC_API_URL", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://dev-host:9000");
    delete process.env.SERVER_API_URL;
    const { getApiUrl } = await import("./config");
    expect(getApiUrl("/api/test")).toBe("http://dev-host:9000/api/test");
  });

  it("未设 SERVER_API_URL 时，生产环境回退到 127.0.0.1:8000", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.SERVER_API_URL;
    delete process.env.NEXT_PUBLIC_API_URL;
    const { getApiUrl } = await import("./config");
    expect(getApiUrl("/api/test")).toBe("http://127.0.0.1:8000/api/test");
  });

  it("自定义 SERVER_API_URL 优先级最高", async () => {
    vi.stubEnv("SERVER_API_URL", "http://custom-internal:7000");
    const { getApiUrl } = await import("./config");
    expect(getApiUrl("/api/test")).toBe("http://custom-internal:7000/api/test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });
});

// ─── getClientApiUrl ───────────────────────────────────────────────
describe("getClientApiUrl", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("路径以 / 开头时直接返回", async () => {
    const { getClientApiUrl } = await import("./config");
    expect(getClientApiUrl("/api/v1/users")).toBe("/api/v1/users");
  });

  it("路径不以 / 开头时自动补 /", async () => {
    const { getClientApiUrl } = await import("./config");
    expect(getClientApiUrl("api/v1/users")).toBe("/api/v1/users");
  });

  it("始终返回相对路径，不受环境变量影响", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://something:9999");
    const { getClientApiUrl } = await import("./config");
    expect(getClientApiUrl("/api/v1/test")).toBe("/api/v1/test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });
});

// ─── getFileUrl ────────────────────────────────────────────────────
describe("getFileUrl", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // --- 空值处理 ---
  it("null 返回空字符串", async () => {
    const { getFileUrl } = await import("./config");
    expect(getFileUrl(null)).toBe("");
  });

  it("undefined 返回空字符串", async () => {
    const { getFileUrl } = await import("./config");
    expect(getFileUrl(undefined)).toBe("");
  });

  it("空字符串返回空字符串", async () => {
    const { getFileUrl } = await import("./config");
    expect(getFileUrl("")).toBe("");
  });

  // --- blob: / data: URL ---
  it("blob: URL 直接返回", async () => {
    const { getFileUrl } = await import("./config");
    expect(getFileUrl("blob:http://localhost:3000/uuid")).toBe("blob:http://localhost:3000/uuid");
  });

  it("data: URL 直接返回", async () => {
    const { getFileUrl } = await import("./config");
    expect(getFileUrl("data:image/png;base64,abc123")).toBe("data:image/png;base64,abc123");
  });

  // --- 绝对 URL 指向后端域名 → 转为相对路径 ---
  it("后端域名 127.0.0.1:8000 转为相对路径", async () => {
    const { getFileUrl } = await import("./config");
    expect(getFileUrl("http://127.0.0.1:8000/static/img.png")).toBe("/static/img.png");
  });

  it("后端域名 localhost:8000 转为相对路径", async () => {
    const { getFileUrl } = await import("./config");
    expect(getFileUrl("http://localhost:8000/uploads/file.jpg")).toBe("/uploads/file.jpg");
  });

  it("后端域名 fangmengchina.com 转为相对路径", async () => {
    const { getFileUrl } = await import("./config");
    expect(getFileUrl("https://fangmengchina.com/static/logo.svg")).toBe("/static/logo.svg");
  });

  it("后端域名带非默认端口 127.0.0.1:9000 不匹配", async () => {
    const { getFileUrl } = await import("./config");
    // parsed.host = "127.0.0.1:9000"，不在 backendHosts 列表中
    expect(getFileUrl("http://127.0.0.1:9000/static/img.png")).toBe(
      "http://127.0.0.1:9000/static/img.png"
    );
  });

  // --- 绝对 URL 指向外部域名 → 直接返回 ---
  it("外部域名 URL 直接返回", async () => {
    const { getFileUrl } = await import("./config");
    expect(getFileUrl("https://cdn.example.com/img.png")).toBe("https://cdn.example.com/img.png");
  });

  it("https 外部域名直接返回", async () => {
    const { getFileUrl } = await import("./config");
    expect(getFileUrl("https://othersite.com/path/file")).toBe("https://othersite.com/path/file");
  });

  // --- 无效 URL ---
  it("无效 http URL 不抛错，直接返回原值", async () => {
    const { getFileUrl } = await import("./config");
    // new URL() 会抛错的场景：空 host
    expect(getFileUrl("http://")).toBe("http://");
  });

  // --- 相对路径：开发环境 ---
  it("开发环境：相对路径拼接后端地址", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://127.0.0.1:8000");
    const { getFileUrl } = await import("./config");
    expect(getFileUrl("/static/img.png")).toBe("http://127.0.0.1:8000/static/img.png");
  });

  it("开发环境：相对路径无前导 / 时自动补 /", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://127.0.0.1:8000");
    const { getFileUrl } = await import("./config");
    expect(getFileUrl("static/img.png")).toBe("http://127.0.0.1:8000/static/img.png");
  });

  it("开发环境：自定义 NEXT_PUBLIC_API_URL 生效", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://dev-backend:9000");
    const { getFileUrl } = await import("./config");
    expect(getFileUrl("/uploads/file.jpg")).toBe("http://dev-backend:9000/uploads/file.jpg");
  });

  // --- 相对路径：生产环境 ---
  it("生产环境：相对路径直接返回（Nginx 代理）", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.NEXT_PUBLIC_API_URL;
    const { getFileUrl } = await import("./config");
    expect(getFileUrl("/static/img.png")).toBe("/static/img.png");
  });

  it("生产环境：相对路径无前导 / 时自动补 /", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.NEXT_PUBLIC_API_URL;
    const { getFileUrl } = await import("./config");
    expect(getFileUrl("static/img.png")).toBe("/static/img.png");
  });
});

// ─── apiPaths ──────────────────────────────────────────────────────
describe("apiPaths", () => {
  it("包含 auth.token 路径", async () => {
    const { apiPaths } = await import("./config");
    expect(apiPaths.auth.token).toBe("/api/v1/auth/token");
  });

  it("包含 files.upload 路径", async () => {
    const { apiPaths } = await import("./config");
    expect(apiPaths.files.upload).toBe("/api/v1/files/upload");
  });

  it("所有路径以 /api 开头", async () => {
    const { apiPaths } = await import("./config");
    const checkPaths = (obj: Record<string, unknown>) => {
      for (const v of Object.values(obj)) {
        if (typeof v === "string") {
          expect(v.startsWith("/api")).toBe(true);
        } else if (typeof v === "object" && v !== null) {
          checkPaths(v as Record<string, unknown>);
        }
      }
    };
    checkPaths(apiPaths as unknown as Record<string, unknown>);
  });
});

// ─── isProduction ──────────────────────────────────────────────────
describe("isProduction", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("NODE_ENV=production 时为 true", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { isProduction } = await import("./config");
    expect(isProduction).toBe(true);
  });

  it("NODE_ENV=development 时为 false", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { isProduction } = await import("./config");
    expect(isProduction).toBe(false);
  });
});
