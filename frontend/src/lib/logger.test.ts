import { logger } from "@/lib/logger";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { logger } from "./logger";

describe("logger", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should output info log with [INFO] prefix", () => {
    logger.info("test message", { key: "value" });
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[INFO] test message",
      expect.objectContaining({ key: "value" }),
    );
  });

  it("should output warn log with [WARN] prefix", () => {
    logger.warn("test warning");
    expect(consoleWarnSpy).toHaveBeenCalledWith("[WARN] test warning", "");
  });

  it("should output error log with [ERROR] prefix and safe error", () => {
    const err = new Error("boom");
    logger.error("test error", err);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[ERROR] test error",
      expect.objectContaining({ name: "Error", message: "boom" }),
    );
  });

  it("should mask sensitive data in production", () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    logger.info("test", { password: "secret123", token: "abcdefghij123" });
    process.env.NODE_ENV = originalEnv;

    const call = consoleLogSpy.mock.calls[0] as [string, unknown];
    expect(call[0]).toBe("[INFO] test");
    const data = call[1] as Record<string, string>;
    expect(data.password).toBe("***");
    expect(data.token).toBe("abc***123");
  });
});
