import { describe, it, expect } from "vitest";
import { toNumber } from "./number-utils";

describe("toNumber", () => {
  it("字符串数字应转换为对应数字", () => {
    expect(toNumber("123")).toBe(123);
    expect(toNumber("3.14")).toBeCloseTo(3.14);
    expect(toNumber("0")).toBe(0);
    expect(toNumber("-5")).toBe(-5);
  });

  it("数字应原样返回", () => {
    expect(toNumber(42)).toBe(42);
    expect(toNumber(0)).toBe(0);
    expect(toNumber(-1.5)).toBe(-1.5);
  });

  it("null 应返回 undefined", () => {
    expect(toNumber(null)).toBeUndefined();
  });

  it("undefined 应返回 undefined", () => {
    expect(toNumber(undefined)).toBeUndefined();
  });

  it("空字符串应返回 undefined", () => {
    expect(toNumber("")).toBeUndefined();
  });

  it("非数字字符串应返回 undefined", () => {
    expect(toNumber("abc")).toBeUndefined();
    expect(toNumber("NaN")).toBeUndefined();
  });

  it("纯空白字符串应返回 undefined", () => {
    expect(toNumber("  ")).toBeUndefined();
  });

  it("部分数字字符串应解析前面的数字", () => {
    expect(toNumber("123abc")).toBe(123);
  });

  it("带前后空白的数字字符串应正确解析", () => {
    expect(toNumber(" 42 ")).toBe(42);
  });
});
