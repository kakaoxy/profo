import { describe, expect, it } from "vitest";

import { MP_ICONS } from "../../utils/mp-icons";

const DATA_URI = /^data:image\/svg\+xml;base64,/;

function decode(value: string): string {
  // 图标 SVG 全是 ASCII，atob 足够；不引 @types/node
  return atob(value.replace(DATA_URI, ""));
}

/**
 * 回归：2026-11-02 微信开发者工具报
 * `[渲染层网络层错误] Failed to load image http://127.0.0.1:35344/__pageframe__/pages/merchant/home/PHN2Zy...`
 * 原因是图标值只有裸 base64，缺少 `data:image/svg+xml;base64,` 前缀，
 * `<image src>` 把它当成了相对页面路径去请求。
 */
describe("商户图标集", () => {
  it("每个图标都是可直接渲染的 data URI", () => {
    Object.entries(MP_ICONS).forEach(([name, value]) => {
      expect(value, `${name} 缺少 data:image/svg+xml;base64, 前缀`).toMatch(DATA_URI);
      // 前缀后必须是非空 base64，且能解出 <svg
      expect(decode(value), `${name} 的 base64 内容不是 SVG`).toContain("<svg");
    });
  });

  it("每个 SVG 都遵守 DESIGN M6：24 viewBox / stroke 2.4 / 单色 Ash", () => {
    Object.entries(MP_ICONS).forEach(([name, value]) => {
      const svg = decode(value);
      expect(svg, name).toContain('viewBox="0 0 24 24"');
      expect(svg, name).toContain('fill="none"');
      expect(svg, name).toContain('stroke-width="2.4"');
      expect(svg, name).toContain('stroke-linecap="round"');
      expect(svg, name).toContain('stroke-linejoin="round"');
      expect(svg, name).toContain('stroke="#4c4c4c"');
    });
  });

  it("13 个图标键齐全（新增图标时必须同步 DESIGN M6 与测试）", () => {
    expect(Object.keys(MP_ICONS).sort()).toEqual(
      [
        "arrowRight",
        "camera",
        "check",
        "chevronDown",
        "chevronRight",
        "close",
        "file",
        "grid",
        "pencil",
        "pin",
        "plus",
        "tag",
        "wallet",
      ].sort(),
    );
  });
});
