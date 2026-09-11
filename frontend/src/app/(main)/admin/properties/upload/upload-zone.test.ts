import { describe, expect, it } from "vitest";
import { CANCELLABLE_STATUSES } from "./upload-zone";

/**
 * CANCELLABLE_STATUSES 等价性测试
 *
 * 验证 P2 重构（数组字面量 → 模块级 Set）后业务判断一致。
 * 原实现：["pending", "processing"].includes(taskStatus.status)
 * 新实现：CANCELLABLE_STATUSES.has(taskStatus.status)
 */
describe("CANCELLABLE_STATUSES", () => {
  it("包含 pending 状态", () => {
    expect(CANCELLABLE_STATUSES.has("pending")).toBe(true);
  });

  it("包含 processing 状态", () => {
    expect(CANCELLABLE_STATUSES.has("processing")).toBe(true);
  });

  it("不包含 completed 状态", () => {
    expect(CANCELLABLE_STATUSES.has("completed")).toBe(false);
  });

  it("不包含 failed 状态", () => {
    expect(CANCELLABLE_STATUSES.has("failed")).toBe(false);
  });

  it("不包含 cancelled 状态", () => {
    expect(CANCELLABLE_STATUSES.has("cancelled")).toBe(false);
  });

  it("不包含空字符串", () => {
    expect(CANCELLABLE_STATUSES.has("")).toBe(false);
  });

  it("不包含 undefined（已转为字符串）", () => {
    // 原 includes 对 undefined 返回 false，Set.has 也应返回 false
    expect(CANCELLABLE_STATUSES.has(undefined as unknown as string)).toBe(false);
  });

  it("集合大小为 2，仅含 pending/processing", () => {
    expect(CANCELLABLE_STATUSES.size).toBe(2);
  });

  it("模拟原 canCancel 逻辑：pending + isPolling -> true", () => {
    const isPolling = true;
    const taskStatus = { status: "pending" };
    const canCancel = isPolling && !!taskStatus && CANCELLABLE_STATUSES.has(taskStatus.status);
    expect(canCancel).toBe(true);
  });

  it("模拟原 canCancel 逻辑：completed + isPolling -> false", () => {
    const isPolling = true;
    const taskStatus = { status: "completed" };
    const canCancel = isPolling && !!taskStatus && CANCELLABLE_STATUSES.has(taskStatus.status);
    expect(canCancel).toBe(false);
  });

  it("模拟原 canCancel 逻辑：pending 但未在轮询 -> false", () => {
    const isPolling = false;
    const taskStatus = { status: "pending" };
    const canCancel = isPolling && !!taskStatus && CANCELLABLE_STATUSES.has(taskStatus.status);
    expect(canCancel).toBe(false);
  });

  it("模拟原 canCancel 逻辑：taskStatus 为 null -> false", () => {
    const isPolling = true;
    const taskStatus = null;
    const canCancel =
      isPolling && !!taskStatus && CANCELLABLE_STATUSES.has(taskStatus?.status ?? "");
    expect(canCancel).toBe(false);
  });
});
