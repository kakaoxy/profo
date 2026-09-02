import { describe, expect, it } from "vitest";
import {
  buildSheetPosterLayout,
  SHEET_POSTER_HEIGHT,
  SHEET_POSTER_IMAGE_GAP,
  SHEET_POSTER_IMAGE_RADIUS,
  SHEET_POSTER_SAFE_MARGIN,
  SHEET_POSTER_WIDTH,
  type SheetPosterLayout,
  type SheetPosterRect,
} from "../../utils/property-sheet-poster";

/** 安全区边界 [26, 26, 574, 934]. */
const SAFE = {
  left: SHEET_POSTER_SAFE_MARGIN,
  top: SHEET_POSTER_SAFE_MARGIN,
  right: SHEET_POSTER_WIDTH - SHEET_POSTER_SAFE_MARGIN,
  bottom: SHEET_POSTER_HEIGHT - SHEET_POSTER_SAFE_MARGIN,
};

/** 收集布局中全部实体矩形（胶囊/图片/提示条/小程序码）用于越界与重叠校验. */
function collectRects(layout: SheetPosterLayout): SheetPosterRect[] {
  return [
    layout.head.pill.rect,
    ...layout.images,
    ...(layout.moreStrip ? [layout.moreStrip.rect] : []),
    { x: layout.qr.x, y: layout.qr.y, w: layout.qr.size, h: layout.qr.size, r: 0 },
  ];
}

function isInSafeArea(rect: SheetPosterRect): boolean {
  return (
    rect.x >= SAFE.left &&
    rect.y >= SAFE.top &&
    rect.x + rect.w <= SAFE.right &&
    rect.y + rect.h <= SAFE.bottom
  );
}

function overlaps(a: SheetPosterRect, b: SheetPosterRect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

describe("buildSheetPosterLayout 基础尺寸与文案", () => {
  it("画布为 5:8（600×960）", () => {
    const layout = buildSheetPosterLayout({ count: 3 });
    expect(layout.width).toBe(SHEET_POSTER_WIDTH);
    expect(layout.height).toBe(SHEET_POSTER_HEIGHT);
    expect(layout.width / layout.height).toBe(5 / 8);
  });

  it("固定文案：标题/胶囊/品牌/二维码配文对照设计稿", () => {
    const layout = buildSheetPosterLayout({ count: 2 });
    expect(layout.head.titleLines.map((l) => l.text)).toEqual(["美房宝品质二手房"]);
    expect(layout.head.titleLines[0].font).toContain("serif");
    expect(layout.head.pill.text.text).toBe("精选好房");
    expect(layout.brand.main.text).toBe("专注上海老破小");
    expect(layout.brand.sub.text).toBe("所见即所得 · 每套皆标杆");
    expect(layout.qr.caption.text).toBe("扫码看全部房源");
    expect(layout.brand.dot.color.toLowerCase()).toBe("#5d2a1a");
  });

  it("副标题取实际套数", () => {
    expect(buildSheetPosterLayout({ count: 1 }).head.subtitle.text).toBe("1 套精选好房 倾情呈现");
    expect(buildSheetPosterLayout({ count: 6 }).head.subtitle.text).toBe("6 套精选好房 倾情呈现");
  });
});

describe("buildSheetPosterLayout 拼版规则", () => {
  it("count=1：1 个通栏大图（占满安全区宽度）", () => {
    const { images } = buildSheetPosterLayout({ count: 1 });
    expect(images).toHaveLength(1);
    expect(images[0].x).toBe(SHEET_POSTER_SAFE_MARGIN);
    expect(images[0].w).toBe(SHEET_POSTER_WIDTH - SHEET_POSTER_SAFE_MARGIN * 2);
    expect(images[0].r).toBe(SHEET_POSTER_IMAGE_RADIUS);
  });

  it("count=2：左右并排等宽，间距 12", () => {
    const { images } = buildSheetPosterLayout({ count: 2 });
    expect(images).toHaveLength(2);
    expect(images[0].w).toBe(images[1].w);
    expect(images[0].y).toBe(images[1].y);
    expect(images[0].h).toBe(images[1].h);
    expect(images[1].x - (images[0].x + images[0].w)).toBe(SHEET_POSTER_IMAGE_GAP);
    expect(images[1].x + images[1].w).toBe(SAFE.right);
  });

  it("count=3：上 1 通栏 + 下 2 并排，共 3 个矩形", () => {
    const { images } = buildSheetPosterLayout({ count: 3 });
    expect(images).toHaveLength(3);
    // 通栏主图
    expect(images[0].w).toBe(SHEET_POSTER_WIDTH - SHEET_POSTER_SAFE_MARGIN * 2);
    // 下排两张并排，等宽等高，与主图间距 12
    expect(images[1].w).toBe(images[2].w);
    expect(images[1].y).toBe(images[2].y);
    expect(images[1].h).toBe(images[2].h);
    expect(images[1].y - (images[0].y + images[0].h)).toBe(SHEET_POSTER_IMAGE_GAP);
    expect(images[2].x - (images[1].x + images[1].w)).toBe(SHEET_POSTER_IMAGE_GAP);
  });

  it("count=4：仍拼 3 张（仅用前 3 套封面）", () => {
    const { images } = buildSheetPosterLayout({ count: 4 });
    expect(images).toHaveLength(3);
  });

  it("moreStrip：count=3 无提示条，count>3 有且文案含实际套数", () => {
    expect(buildSheetPosterLayout({ count: 3 }).moreStrip).toBeNull();
    expect(buildSheetPosterLayout({ count: 1 }).moreStrip).toBeNull();
    const four = buildSheetPosterLayout({ count: 4 });
    expect(four.moreStrip?.text.text).toBe("已为您精选 4 套 · 更多好房 扫码查看");
    const six = buildSheetPosterLayout({ count: 6 });
    expect(six.moreStrip?.text.text).toBe("已为您精选 6 套 · 更多好房 扫码查看");
  });

  it("moreStrip 位置：图片区下方、品牌区上方", () => {
    const { images, moreStrip, qr } = buildSheetPosterLayout({ count: 4 });
    expect(moreStrip).not.toBeNull();
    const imagesBottom = Math.max(...images.map((r) => r.y + r.h));
    expect(moreStrip!.rect.y).toBeGreaterThanOrEqual(imagesBottom);
    expect(moreStrip!.rect.y + moreStrip!.rect.h).toBeLessThanOrEqual(qr.y);
  });

  it("图片区（count≤3）不侵入底部品牌区（小程序码上方）", () => {
    for (const count of [1, 2, 3]) {
      const { images, qr } = buildSheetPosterLayout({ count });
      const imagesBottom = Math.max(...images.map((r) => r.y + r.h));
      expect(imagesBottom).toBeLessThanOrEqual(qr.y);
    }
  });
});

describe("buildSheetPosterLayout 安全区与重叠约束", () => {
  for (const count of [1, 2, 3, 4, 6, 10]) {
    it(`count=${count}：所有矩形落在 [26,26,574,934] 安全区内`, () => {
      const layout = buildSheetPosterLayout({ count });
      for (const rect of collectRects(layout)) {
        expect(isInSafeArea(rect)).toBe(true);
      }
    });

    it(`count=${count}：所有矩形互不重叠`, () => {
      const layout = buildSheetPosterLayout({ count });
      const rects = collectRects(layout);
      for (let i = 0; i < rects.length; i += 1) {
        for (let j = i + 1; j < rects.length; j += 1) {
          expect(overlaps(rects[i], rects[j])).toBe(false);
        }
      }
    });
  }
});
