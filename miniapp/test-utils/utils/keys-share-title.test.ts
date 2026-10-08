/**
 * 分享记录卡标题拼装（shareCardTitle）单元测试.
 *
 * 覆盖：单/多小区「/」拼接、超长截断（保前缀 + …）、单个超长小区名截断、
 * 空白名过滤、全空回退「N 套房源」.
 */
import { describe, expect, it } from "vitest";
import { shareCardTitle } from "../../pages/keys/utils/keys";

describe("shareCardTitle", () => {
  it("单小区：直接展示小区名", () => {
    expect(shareCardTitle(["阳光花园"], 1)).toBe("阳光花园");
  });

  it("多小区：「/」拼接", () => {
    expect(shareCardTitle(["阳光花园", "翡翠湾"], 2)).toBe("阳光花园/翡翠湾");
  });

  it("多小区超长：保留能容纳的前缀并截断", () => {
    // 12 字上限：阳光花园/翡翠湾（=8），下一个「绿城桃园」连分隔符共 5 字放不下 → 截断
    expect(shareCardTitle(["阳光花园", "翡翠湾", "绿城桃园"], 3)).toBe("阳光花园/翡翠湾…");
  });

  it("单个超长小区名：截断加 …", () => {
    expect(shareCardTitle(["融创文旅城翡翠海岸花园一号"], 1)).toBe("融创文旅城翡翠海岸花园一…");
  });

  it("恰好 12 字：不截断", () => {
    expect(shareCardTitle(["阳光花园", "翡翠湾", "绿城湾"], 3)).toBe("阳光花园/翡翠湾/绿城湾");
  });

  it("含空白名：过滤后拼接", () => {
    expect(shareCardTitle(["阳光花园", "  ", ""], 3)).toBe("阳光花园");
  });

  it("全为空/缺失：回退「N 套房源」", () => {
    expect(shareCardTitle([], 2)).toBe("2 套房源");
    expect(shareCardTitle(["", "  "], 3)).toBe("3 套房源");
  });

  it("名称首尾空格：先 trim 再拼接", () => {
    expect(shareCardTitle([" 阳光花园 ", "翡翠湾 "], 2)).toBe("阳光花园/翡翠湾");
  });
});
