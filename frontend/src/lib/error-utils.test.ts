import { describe, expect, it } from "vitest";
import { parseApiError, parseNetworkError } from "./error-utils";

// ─── parseApiError ─────────────────────────────────────────────────
describe("parseApiError", () => {
  // FastAPI 标准格式（detail 为字符串）
  it("解析 FastAPI 标准错误（detail 字符串）", () => {
    const result = parseApiError({ detail: "项目不存在" });
    expect(result).toEqual({ message: "项目不存在", type: "api" });
  });

  // Pydantic 验证错误（detail 为数组）
  it("解析 Pydantic 验证错误（detail 数组）", () => {
    const error = {
      detail: [
        { loc: ["body", "name"], msg: "字段不能为空", type: "value_error" },
        { loc: ["body", "price"], msg: "必须为正数", type: "value_error" },
      ],
    };
    const result = parseApiError(error);
    expect(result).toEqual({
      message: "数据验证失败: body.name: 字段不能为空; body.price: 必须为正数",
      type: "validation",
    });
  });

  it("解析验证错误（单条）", () => {
    const error = {
      detail: [{ loc: ["query", "page"], msg: "必须为整数" }],
    };
    const result = parseApiError(error);
    expect(result).toEqual({
      message: "数据验证失败: query.page: 必须为整数",
      type: "validation",
    });
  });

  it("解析验证错误（loc/msg 缺失时显示 undefined）", () => {
    const error = { detail: [{}] };
    const result = parseApiError(error);
    expect(result).toEqual({
      message: "数据验证失败: undefined: undefined",
      type: "validation",
    });
  });

  // 通用 message 字段
  it("解析通用 message 字段", () => {
    const result = parseApiError({ message: "服务器内部错误" });
    expect(result).toEqual({ message: "服务器内部错误", type: "api" });
  });

  // Error 对象
  it("解析 Error 对象（含 message）", () => {
    const result = parseApiError(new Error("出错了"));
    expect(result).toEqual({ message: "出错了", type: "api" });
  });

  // 非 Error 原始类型
  it("字符串输入返回默认消息", () => {
    const result = parseApiError("出错了");
    expect(result).toEqual({ message: "操作失败，请稍后重试", type: "unknown" });
  });

  it("数字输入返回默认消息", () => {
    const result = parseApiError(500);
    expect(result).toEqual({ message: "操作失败，请稍后重试", type: "unknown" });
  });

  // null/undefined
  it("null 输入返回默认消息", () => {
    const result = parseApiError(null);
    expect(result).toEqual({ message: "操作失败，请稍后重试", type: "unknown" });
  });

  it("undefined 输入返回默认消息", () => {
    const result = parseApiError(undefined);
    expect(result).toEqual({ message: "操作失败，请稍后重试", type: "unknown" });
  });

  // 对象含 error 字段（无 detail/message）
  it("对象仅含 error 字段时返回默认消息", () => {
    const result = parseApiError({ error: "something" });
    expect(result).toEqual({ message: "操作失败，请稍后重试", type: "unknown" });
  });

  // detail 优先于 message
  it("detail 字符串优先于 message 字段", () => {
    const result = parseApiError({ detail: "detail消息", message: "message消息" });
    expect(result).toEqual({ message: "detail消息", type: "api" });
  });

  // detail 数组优先于 message
  it("detail 数组优先于 message 字段", () => {
    const result = parseApiError({
      detail: [{ loc: ["body", "x"], msg: "必填" }],
      message: "message消息",
    });
    expect(result.type).toBe("validation");
  });

  // 空对象
  it("空对象返回默认消息", () => {
    const result = parseApiError({});
    expect(result).toEqual({ message: "操作失败，请稍后重试", type: "unknown" });
  });

  // detail 为非字符串非数组（如数字）
  it("detail 为数字时走 message 分支", () => {
    const result = parseApiError({ detail: 404, message: "未找到" });
    expect(result).toEqual({ message: "未找到", type: "api" });
  });
});

// ─── parseNetworkError ─────────────────────────────────────────────
describe("parseNetworkError", () => {
  it("fetch 错误返回网络连接失败提示", () => {
    const result = parseNetworkError(new Error("Failed to fetch"));
    expect(result).toBe("网络连接失败，请检查网络后重试");
  });

  it("network 关键字错误返回网络连接失败提示", () => {
    const result = parseNetworkError(new Error("network error"));
    expect(result).toBe("网络连接失败，请检查网络后重试");
  });

  it("timeout 错误返回超时提示", () => {
    const result = parseNetworkError(new Error("Request timeout"));
    expect(result).toBe("请求超时，请稍后重试");
  });

  it("普通 Error 返回原始 message", () => {
    const result = parseNetworkError(new Error("未知业务错误"));
    expect(result).toBe("未知业务错误");
  });

  it("非 Error 类型返回默认网络错误提示", () => {
    const result = parseNetworkError("网络断了");
    expect(result).toBe("网络错误，请稍后重试");
  });

  it("null 输入返回默认网络错误提示", () => {
    const result = parseNetworkError(null);
    expect(result).toBe("网络错误，请稍后重试");
  });

  it("undefined 输入返回默认网络错误提示", () => {
    const result = parseNetworkError(undefined);
    expect(result).toBe("网络错误，请稍后重试");
  });

  it("数字输入返回默认网络错误提示", () => {
    const result = parseNetworkError(500);
    expect(result).toBe("网络错误，请稍后重试");
  });
});
