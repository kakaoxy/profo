import { describe, it, expect } from "vitest";
import { cn, escapeHtml } from "./utils";

describe("cn", () => {
  it("应合并多个类名", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("应处理条件类名", () => {
    expect(cn("foo", false && "bar", "baz")).toBe("foo baz");
  });

  it("应合并 Tailwind 冲突类名", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("应处理空输入", () => {
    expect(cn()).toBe("");
  });

  it("应处理 undefined 和 null", () => {
    expect(cn("foo", undefined, null, "bar")).toBe("foo bar");
  });
});

describe("escapeHtml", () => {
  it("应转义 & 字符", () => {
    expect(escapeHtml("a&b")).toBe("a&amp;b");
  });

  it("应转义 < 字符", () => {
    expect(escapeHtml("a<b")).toBe("a&lt;b");
  });

  it("应转义 > 字符", () => {
    expect(escapeHtml("a>b")).toBe("a&gt;b");
  });

  it("应转义双引号", () => {
    expect(escapeHtml('a"b')).toBe("a&quot;b");
  });

  it("应转义单引号", () => {
    expect(escapeHtml("a'b")).toBe("a&#039;b");
  });

  it("应同时转义所有特殊字符", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#039;");
  });

  it("null 应返回空字符串", () => {
    expect(escapeHtml(null)).toBe("");
  });

  it("undefined 应返回空字符串", () => {
    expect(escapeHtml(undefined)).toBe("");
  });

  it("空字符串应返回空字符串", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("无特殊字符应原样返回", () => {
    expect(escapeHtml("hello world")).toBe("hello world");
  });
});
