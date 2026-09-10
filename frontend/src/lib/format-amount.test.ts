import { describe, it, expect } from "vitest";
import { formatYuanToWan, formatYuanToWanSigned } from "./format-amount";

describe("formatYuanToWan", () => {
  it("把「元」换算为万元", () => {
    // 回归：此函数曾漏除 10000，把 23000 元显示成「¥23,000.00万」（放大一万倍）
    expect(formatYuanToWan(23000)).toBe("¥2.30万");
  });

  it("保留两位小数与千分位", () => {
    expect(formatYuanToWan(10000)).toBe("¥1.00万");
    expect(formatYuanToWan(2684000)).toBe("¥268.40万");
    // 2.3 亿元合法地等于 23,000 万元，与上面 23000 元的回归用例区分开
    expect(formatYuanToWan(230000000)).toBe("¥23,000.00万");
  });

  it("不足万元时保留小数", () => {
    expect(formatYuanToWan(500)).toBe("¥0.05万");
  });

  it("取绝对值，不携带正负号", () => {
    expect(formatYuanToWan(-646000)).toBe("¥64.60万");
  });

  it("零值与缺失值回退为 ¥0.00万", () => {
    expect(formatYuanToWan(0)).toBe("¥0.00万");
    expect(formatYuanToWan(null)).toBe("¥0.00万");
    expect(formatYuanToWan(undefined)).toBe("¥0.00万");
    expect(formatYuanToWan(Number.NaN)).toBe("¥0.00万");
  });
});

describe("formatYuanToWanSigned", () => {
  it("非负带 +", () => {
    expect(formatYuanToWanSigned(9272000)).toBe("+¥927.20万");
    expect(formatYuanToWanSigned(0)).toBe("+¥0.00万");
  });

  it("负数带 −（U+2212）", () => {
    expect(formatYuanToWanSigned(-646000)).toBe("−¥64.60万");
  });

  it("缺失值回退为 +¥0.00万", () => {
    expect(formatYuanToWanSigned(null)).toBe("+¥0.00万");
    expect(formatYuanToWanSigned(undefined)).toBe("+¥0.00万");
  });
});
