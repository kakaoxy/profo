import { describe, expect, it } from "vitest";
import {
  buildPosterLayout,
  computeCoverSourceRect,
  estimateTextWidth,
  POSTER_HEIGHT,
  POSTER_WIDTH,
  resolvePosterBgUrl,
  toQrcodeDataUri,
  wrapTitleLines,
} from "../../utils/recruit-poster";

describe("estimateTextWidth", () => {
  it("CJK 全角字符按 fontSize 计宽", () => {
    expect(estimateTextWidth("区域伙伴", 52)).toBe(52 * 4);
    expect(estimateTextWidth("，", 52)).toBe(52);
  });

  it("ASCII 半角字符按 fontSize × 0.55 计宽", () => {
    expect(estimateTextWidth("AB12", 52)).toBe(52 * 0.55 * 4);
  });

  it("空串宽度为 0", () => {
    expect(estimateTextWidth("", 52)).toBe(0);
  });
});

describe("wrapTitleLines", () => {
  // 可用宽度 504（600 - 48×2），字号 52 → 每行约 9 个 CJK 字符
  it("短标题单行原样返回", () => {
    expect(wrapTitleLines("区域伙伴招募计划", 504, 52, 2)).toEqual(["区域伙伴招募计划"]);
  });

  it("超宽标题自动换行到第二行", () => {
    const lines = wrapTitleLines("一二三四五六七八九十一二三四五", 504, 52, 2);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("一二三四五六七八九");
    expect(lines[1]).toBe("十一二三四五");
  });

  it("超过最大行数时末行截断加省略号", () => {
    const lines = wrapTitleLines("一二三四五六七八九十一二三四五六七八九十", 504, 52, 2);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("一二三四五六七八九");
    // 第二行 9 字 + 省略号超宽，回退 1 字后加省略号
    expect(lines[1]).toBe("十一二三四五六七八…");
    expect(lines[1].endsWith("…")).toBe(true);
  });

  it("空标题返回空数组", () => {
    expect(wrapTitleLines("", 504, 52, 2)).toEqual([]);
  });
});

describe("computeCoverSourceRect", () => {
  it("同比例图片整图绘制（源矩形等于原图）", () => {
    const r = computeCoverSourceRect(600, 960, 300, 480);
    expect(r).toEqual({ sx: 0, sy: 0, sw: 600, sh: 960 });
  });

  it("更宽的图片水平居中裁剪两侧", () => {
    // 1200×960 铺满 600×960：scale=1，源宽 600，左右各裁 300
    const r = computeCoverSourceRect(1200, 960, 600, 960);
    expect(r).toEqual({ sx: 300, sy: 0, sw: 600, sh: 960 });
  });

  it("更高的图片垂直居中裁剪上下", () => {
    // 600×1920 铺满 600×960：scale=1，源高 960，上下各裁 480
    const r = computeCoverSourceRect(600, 1920, 600, 960);
    expect(r).toEqual({ sx: 0, sy: 480, sw: 600, sh: 960 });
  });

  it("小图等比放大填满目标区", () => {
    // 300×480 放大 2 倍铺满 600×960：源矩形仍为整图
    const r = computeCoverSourceRect(300, 480, 600, 960);
    expect(r).toEqual({ sx: 0, sy: 0, sw: 300, sh: 480 });
  });
});

describe("toQrcodeDataUri", () => {
  it("裸 base64 补 data URI 前缀", () => {
    expect(toQrcodeDataUri("abcd1234")).toBe("data:image/png;base64,abcd1234");
  });

  it("已带前缀原样返回", () => {
    expect(toQrcodeDataUri("data:image/png;base64,abcd1234")).toBe(
      "data:image/png;base64,abcd1234",
    );
  });
});

describe("buildPosterLayout", () => {
  it("尺寸为 5:8（600×960）", () => {
    const layout = buildPosterLayout({ title: "区域伙伴招募计划" });
    expect(layout.width).toBe(POSTER_WIDTH);
    expect(layout.height).toBe(POSTER_HEIGHT);
    expect(layout.width / layout.height).toBe(5 / 8);
  });

  it("无背景图 URL 时使用品牌渐变兜底", () => {
    const layout = buildPosterLayout({ title: "标题" });
    expect(layout.background.kind).toBe("gradient");
    if (layout.background.kind === "gradient") {
      expect(layout.background.stops.map((s) => s.color)).toEqual([
        "#1e3fae",
        "#2563eb",
        "#6ea8f8",
      ]);
    }
  });

  it("传入背景图 URL 时使用图片背景", () => {
    const layout = buildPosterLayout({ title: "标题", bgUrl: "https://example.com/bg.jpg" });
    expect(layout.background).toEqual({ kind: "image", src: "https://example.com/bg.jpg" });
  });

  it("空标题回退默认文案", () => {
    const layout = buildPosterLayout({ title: "  " });
    expect(layout.titleLines).toHaveLength(1);
    expect(layout.titleLines[0].text).toBe("区域伙伴招募计划");
  });

  it("固定文案：标签/引导/码卡文案对照设计稿", () => {
    const layout = buildPosterLayout({ title: "标题" });
    expect(layout.tag.text.text).toBe("招募进行中");
    expect(layout.lead.text).toBe("一键授权报名，专人对接");
    expect(layout.qrTitle.text).toBe("长按识别小程序码");
    expect(layout.qrSub.text).toBe("报名占位");
  });

  it("标题两行时分隔条与引导文案随之下移", () => {
    const one = buildPosterLayout({ title: "区域伙伴" });
    const two = buildPosterLayout({ title: "一二三四五六七八九十一二三四五六七八九十" });
    expect(two.titleLines).toHaveLength(2);
    expect(two.divider.y).toBeGreaterThan(one.divider.y);
    expect(two.lead.y).toBeGreaterThan(one.lead.y);
  });

  it("底部码卡与小程序码坐标落在画布内且不重叠标题区", () => {
    const layout = buildPosterLayout({ title: "区域伙伴招募计划" });
    const { card, qr } = layout;
    expect(card.y + card.h).toBeLessThanOrEqual(POSTER_HEIGHT);
    expect(qr.x + qr.size).toBeLessThanOrEqual(card.x + card.w);
    expect(qr.y + qr.size).toBeLessThanOrEqual(card.y + card.h);
    expect(layout.qrTitle.x).toBeGreaterThan(qr.x + qr.size);
  });
});

describe("resolvePosterBgUrl", () => {
  it("活动详情未返回 poster_bg_url（当前后端未下发）→ 空串走渐变兜底", () => {
    expect(resolvePosterBgUrl({ id: "1", title: "t", image_url: null, content: null } as never)).toBe("");
  });

  it("后端补齐 poster_bg_url 后读取并补全为完整 URL", () => {
    const campaign = {
      id: "1",
      title: "t",
      image_url: null,
      content: null,
      poster_bg_url: "/static/uploads/bg.jpg",
    };
    expect(resolvePosterBgUrl(campaign as never)).toContain("/static/uploads/bg.jpg");
  });

  it("null 入参返回空串", () => {
    expect(resolvePosterBgUrl(null)).toBe("");
  });
});
