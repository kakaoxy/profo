import { describe, expect, test } from "vitest";
import {
  createSuccessResult,
  createErrorResult,
  handleActionError,
  extractErrorMessage,
  type ActionResult,
} from "./action-result";

describe("action-result", () => {
  describe("createSuccessResult", () => {
    test("应该创建成功的 ActionResult", () => {
      const result = createSuccessResult({ id: 1, name: "test" });
      expect(result).toEqual({
        success: true,
        data: { id: 1, name: "test" },
        message: undefined,
      });
    });

    test("应该包含成功消息", () => {
      const result = createSuccessResult({ id: 1 }, "操作成功");
      expect(result).toEqual({
        success: true,
        data: { id: 1 },
        message: "操作成功",
      });
    });
  });

  describe("createErrorResult", () => {
    test("应该创建失败的 ActionResult", () => {
      const result = createErrorResult("操作失败");
      expect(result).toEqual({
        success: false,
        error: "操作失败",
        code: undefined,
      });
    });

    test("应该包含错误代码", () => {
      const result = createErrorResult("操作失败", "ERR_001");
      expect(result).toEqual({
        success: false,
        error: "操作失败",
        code: "ERR_001",
      });
    });
  });

  describe("handleActionError", () => {
    test("成功的操作应该返回成功结果", async () => {
      const action = async () => ({ id: 1 });
      const result = await handleActionError(action);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ id: 1 });
      }
    });

    test("失败的操作应该返回错误结果", async () => {
      const action = async () => {
        throw new Error("操作失败");
      };
      const result = await handleActionError(action);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("操作失败");
      }
    });

    test("应该使用自定义错误消息", async () => {
      const action = async () => {
        throw new Error("原始错误");
      };
      const result = await handleActionError(action, "自定义错误");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("原始错误");
      }
    });

    test("应该处理字符串错误", async () => {
      const action = async () => {
        throw "字符串错误";
      };
      const result = await handleActionError(action);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("字符串错误");
      }
    });

    test("应该处理带 detail 的错误对象", async () => {
      const action = async () => {
        throw { detail: "详细错误信息" };
      };
      const result = await handleActionError(action);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("详细错误信息");
      }
    });
  });

  describe("extractErrorMessage", () => {
    test("应该提取 Error 对象的消息", () => {
      const error = new Error("错误消息");
      expect(extractErrorMessage(error)).toBe("错误消息");
    });

    test("应该处理字符串错误", () => {
      expect(extractErrorMessage("字符串错误")).toBe("字符串错误");
    });

    test("应该提取 detail 字段", () => {
      expect(extractErrorMessage({ detail: "详细错误" })).toBe("详细错误");
    });

    test("应该提取 message 字段", () => {
      expect(extractErrorMessage({ message: "消息错误" })).toBe("消息错误");
    });

    test("应该提取 error 字段", () => {
      expect(extractErrorMessage({ error: "错误字段" })).toBe("错误字段");
    });

    test("未知错误应该返回默认消息", () => {
      expect(extractErrorMessage({})).toBe("未知错误");
      expect(extractErrorMessage(null)).toBe("未知错误");
      expect(extractErrorMessage(undefined)).toBe("未知错误");
    });
  });
});
