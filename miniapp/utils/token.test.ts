/**
 * token 工具单测：storage 非字符串防护、临时账号标识、JWT payload 解析边界.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  getAccessToken,
  getRefreshToken,
  getCAccessToken,
  getCRefreshToken,
  getCTemporary,
  setCTemporary,
  getPhonePrompted,
  setPhonePrompted,
  clearCUserState,
  getTokenAud,
  getUserIdFromAccessToken,
} from "./token";

/** base64url 编码 JSON（无 padding，与微信手写解码输入一致）；不依赖 Buffer/atob 全局差异. */
function b64url(obj: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function makeToken(payload: unknown): string {
  return `header.${b64url(payload)}.signature`;
}

const storage = new Map<string, unknown>();

beforeEach(() => {
  storage.clear();
  vi.stubGlobal("wx", {
    getStorageSync: vi.fn((key: string) => storage.get(key)),
    setStorageSync: vi.fn((key: string, val: unknown) => {
      storage.set(key, val);
    }),
    removeStorageSync: vi.fn((key: string) => {
      storage.delete(key);
    }),
  });
});

describe("令牌存取", () => {
  it("非字符串 storage 值返回空串，避免拼出 Bearer undefined", () => {
    storage.set("access_token", 123);
    storage.set("refresh_token", null);
    expect(getAccessToken()).toBe("");
    expect(getRefreshToken()).toBe("");
  });

  it("字符串值原样返回", () => {
    storage.set("c_access_token", "tok-c");
    storage.set("c_refresh_token", "ref-c");
    expect(getCAccessToken()).toBe("tok-c");
    expect(getCRefreshToken()).toBe("ref-c");
  });
});

describe("c_user_temporary / c_phone_prompted 标识", () => {
  it("严格匹配字符串 true/false", () => {
    storage.set("c_user_temporary", "true");
    expect(getCTemporary()).toBe(true);
    storage.set("c_user_temporary", "false");
    expect(getCTemporary()).toBe(false);
    storage.set("c_user_temporary", 1);
    expect(getCTemporary()).toBe(false);
  });

  it("setCTemporary 写入字符串而非布尔", () => {
    setCTemporary(true);
    expect(storage.get("c_user_temporary")).toBe("true");
    setCTemporary(false);
    expect(storage.get("c_user_temporary")).toBe("false");
  });

  it("setPhonePrompted / getPhonePrompted 字符串语义", () => {
    setPhonePrompted(true);
    expect(getPhonePrompted()).toBe(true);
    setPhonePrompted(false);
    expect(getPhonePrompted()).toBe(false);
  });

  it("clearCUserState 仅清理状态标识，不动令牌", () => {
    storage.set("c_user_temporary", "true");
    storage.set("c_phone_prompted", "true");
    storage.set("access_token", "keep");
    clearCUserState();
    expect(storage.get("c_user_temporary")).toBeUndefined();
    expect(storage.get("c_phone_prompted")).toBeUndefined();
    expect(storage.get("access_token")).toBe("keep");
  });
});

describe("JWT payload 解析（getTokenAud / getUserIdFromAccessToken）", () => {
  it("解析 aud=c（C 端）", () => {
    expect(getTokenAud(makeToken({ sub: "1", aud: "c" }))).toBe("c");
  });

  it("解析 aud=admin（后台）", () => {
    expect(getTokenAud(makeToken({ aud: "admin" }))).toBe("admin");
  });

  it("无 aud 字段返回空串", () => {
    expect(getTokenAud(makeToken({ sub: "1" }))).toBe("");
  });

  it("非字符串 aud 返回空串", () => {
    expect(getTokenAud(makeToken({ aud: 123 }))).toBe("");
  });

  it("非法 JWT（无 payload 段）返回空串", () => {
    expect(getTokenAud("")).toBe("");
    expect(getTokenAud("onlyone")).toBe("");
  });

  it("payload 非合法 JSON 返回空串", () => {
    expect(getTokenAud("h.not-json.sig")).toBe("");
  });

  it("payload 非对象返回空串", () => {
    expect(getTokenAud(`h.${b64url("str")}.sig`)).toBe("");
  });

  it("含中文的 sub 正确 UTF-8 解码", () => {
    storage.set("access_token", makeToken({ sub: "张三", aud: "admin" }));
    expect(getUserIdFromAccessToken()).toBe("张三");
  });

  it("getUserIdFromAccessToken 无令牌返回空串", () => {
    storage.clear();
    expect(getUserIdFromAccessToken()).toBe("");
  });

  it("sub 缺失或非字符串返回空串", () => {
    storage.set("access_token", makeToken({ aud: "admin" }));
    expect(getUserIdFromAccessToken()).toBe("");
    storage.set("access_token", makeToken({ sub: 42 }));
    expect(getUserIdFromAccessToken()).toBe("");
  });
});
