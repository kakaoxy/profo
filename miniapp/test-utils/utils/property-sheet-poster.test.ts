import { describe, expect, it } from "vitest";
import {
  buildSheetPosterLayout,
  formatSheetPosterListings,
  SHEET_POSTER_HEIGHT,
  SHEET_POSTER_IMAGE_GAP,
  SHEET_POSTER_IMAGE_RADIUS,
  SHEET_POSTER_SAFE_MARGIN,
  SHEET_POSTER_WIDTH,
  type SheetPosterLayout,
  type SheetPosterListingRow,
  type SheetPosterListingSource,
  type SheetPosterRect,
} from "../../utils/property-sheet-poster";
import { estimateTextWidth } from "../../utils/recruit-poster";

/** 安全区边界 [26, 26, 574, 934]. */
const SAFE = {
  left: SHEET_POSTER_SAFE_MARGIN,
  top: SHEET_POSTER_SAFE_MARGIN,
  right: SHEET_POSTER_WIDTH - SHEET_POSTER_SAFE_MARGIN,
  bottom: SHEET_POSTER_HEIGHT - SHEET_POSTER_SAFE_MARGIN,
};

/** 测试用商圈池（互不相同，均不含「商圈」字样）. */
const DISTRICT_POOL = ["徐家汇", "联洋", "大宁", "古北", "花木", "碧云", "金桥", "塘桥", "洋泾", "北外滩"];

/** 生成 n 套格式化清单行（商圈互不相同、字段非空，供布局几何测试）. */
function makeListings(n: number): SheetPosterListingRow[] {
  return Array.from({ length: n }, (_, i) => ({
    district: DISTRICT_POOL[i % DISTRICT_POOL.length],
    rooms: "3室",
    floor: "5F",
    price: `${500 + i * 10}万`,
  }));
}

/** 收集布局中全部实体矩形（胶囊/图片/清单面板/提示条/小程序码）用于越界与重叠校验. */
function collectRects(layout: SheetPosterLayout): SheetPosterRect[] {
  return [
    layout.head.pill.rect,
    ...layout.images,
    ...(layout.list ? [layout.list.rect] : []),
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
    const layout = buildSheetPosterLayout({ count: 3, listings: makeListings(3) });
    expect(layout.width).toBe(SHEET_POSTER_WIDTH);
    expect(layout.height).toBe(SHEET_POSTER_HEIGHT);
    expect(layout.width / layout.height).toBe(5 / 8);
  });

  it("固定文案：标题/胶囊/品牌/二维码配文对照设计稿", () => {
    const layout = buildSheetPosterLayout({ count: 2, listings: makeListings(2) });
    expect(layout.head.titleLines.map((l) => l.text)).toEqual(["美房宝品质二手房"]);
    expect(layout.head.titleLines[0].font).toContain("serif");
    expect(layout.head.pill.text.text).toBe("精选好房");
    expect(layout.brand.main.text).toBe("专注上海老破小");
    expect(layout.brand.sub.text).toBe("所见即所得 · 每套皆标杆");
    expect(layout.qr.caption.text).toBe("扫码看全部房源");
    expect(layout.brand.dot.color.toLowerCase()).toBe("#5d2a1a");
  });

  it("纵向预算：标题区 214、胶囊 y=36、主标题 y=85 字号 40、副标题 y=139 字号 22、图片区顶 234", () => {
    const layout = buildSheetPosterLayout({ count: 2, listings: makeListings(2) });
    expect(layout.head.rect.h).toBe(214);
    expect(layout.head.pill.rect.y).toBe(36);
    expect(layout.head.titleLines[0].y).toBe(85);
    expect(layout.head.titleLines[0].font).toContain("40px");
    expect(layout.head.subtitle.y).toBe(139);
    expect(layout.head.subtitle.font).toBe("400 22px sans-serif");
    expect(layout.images[0].y).toBe(234);
  });

  it("光晕与装饰环不变", () => {
    const { head } = buildSheetPosterLayout({ count: 1, listings: [] });
    expect(head.glow).toMatchObject({ cx: 72, cy: 0, r: 560 });
    expect(head.ring).toMatchObject({ cx: 572, cy: 28, r: 96, lineWidth: 2 });
  });

  it("副标题取实际套数", () => {
    expect(buildSheetPosterLayout({ count: 1, listings: makeListings(1) }).head.subtitle.text)
      .toBe("1 套精选好房 倾情呈现");
    expect(buildSheetPosterLayout({ count: 6, listings: makeListings(5) }).head.subtitle.text)
      .toBe("6 套精选好房 倾情呈现");
  });
});

describe("buildSheetPosterLayout 拼版规则", () => {
  it("count=1：1 个通栏大图（占满安全区宽度，底边 = 面板顶 - 16）", () => {
    const { images, list } = buildSheetPosterLayout({ count: 1, listings: makeListings(1) });
    expect(images).toHaveLength(1);
    expect(images[0].x).toBe(SHEET_POSTER_SAFE_MARGIN);
    expect(images[0].w).toBe(SHEET_POSTER_WIDTH - SHEET_POSTER_SAFE_MARGIN * 2);
    expect(images[0].r).toBe(SHEET_POSTER_IMAGE_RADIUS);
    expect(images[0].y + images[0].h).toBe((list?.rect.y ?? 0) - 16);
  });

  it("count=2：左右并排等宽 w=268，间距 12", () => {
    const { images } = buildSheetPosterLayout({ count: 2, listings: makeListings(2) });
    expect(images).toHaveLength(2);
    expect(images[0].w).toBe(268);
    expect(images[1].w).toBe(268);
    expect(images[1].x).toBe(306);
    expect(images[1].x - (images[0].x + images[0].w)).toBe(SHEET_POSTER_IMAGE_GAP);
    expect(images[1].x + images[1].w).toBe(SAFE.right);
  });

  it("count=3：上 1 通栏（h=150）+ 下 2 并排（h=164），共 3 个矩形", () => {
    const { images } = buildSheetPosterLayout({ count: 3, listings: makeListings(3) });
    expect(images).toHaveLength(3);
    // 通栏主图
    expect(images[0].w).toBe(SHEET_POSTER_WIDTH - SHEET_POSTER_SAFE_MARGIN * 2);
    expect(images[0].h).toBe(150);
    // 下排两张并排，等宽等高，与主图间距 12
    expect(images[1].y).toBe(234 + 150 + SHEET_POSTER_IMAGE_GAP);
    expect(images[1].h).toBe(164);
    expect(images[1].w).toBe(images[2].w);
    expect(images[1].y).toBe(images[2].y);
    expect(images[1].h).toBe(images[2].h);
    expect(images[2].x - (images[1].x + images[1].w)).toBe(SHEET_POSTER_IMAGE_GAP);
  });

  it("count=4/6/10：仍拼 3 张（仅用前 3 套封面）", () => {
    for (const count of [4, 6, 10]) {
      const { images } = buildSheetPosterLayout({ count, listings: makeListings(count) });
      expect(images).toHaveLength(3);
    }
  });

  it("listings 为空（防御路径）：list=null，图片区底边回吃至 659", () => {
    const { list, images } = buildSheetPosterLayout({ count: 1, listings: [] });
    expect(list).toBeNull();
    expect(images[0].y + images[0].h).toBe(659);
  });

  it("图片区（count≤3）不侵入底部品牌区（小程序码上方）", () => {
    for (const count of [1, 2, 3]) {
      const { images, qr } = buildSheetPosterLayout({ count, listings: makeListings(count) });
      const imagesBottom = Math.max(...images.map((r) => r.y + r.h));
      expect(imagesBottom).toBeLessThanOrEqual(qr.y);
    }
  });
});

describe("buildSheetPosterLayout 溢出提示条（阈值 >5）", () => {
  it("count=4/5 无提示条，count=6 起有且位置/文案固定", () => {
    expect(buildSheetPosterLayout({ count: 4, listings: makeListings(4) }).moreStrip).toBeNull();
    expect(buildSheetPosterLayout({ count: 5, listings: makeListings(5) }).moreStrip).toBeNull();
    const six = buildSheetPosterLayout({ count: 6, listings: makeListings(5) });
    expect(six.moreStrip).not.toBeNull();
    expect(six.moreStrip!.rect).toEqual({ x: 26, y: 690, w: 548, h: 40, r: 12 });
    expect(six.moreStrip!.text.text).toBe("已精选 6 套 · 更多好房 扫码查看");
    expect(six.moreStrip!.text.y).toBe(700);
    expect(six.moreStrip!.text.font).toBe("500 20px sans-serif");
    expect(six.moreStrip!.text.color.toLowerCase()).toBe("#5d2a1a");
    expect(six.moreStrip!.text.align).toBe("center");
  });

  it("提示条位于清单面板下方、品牌区（小程序码）上方", () => {
    const { list, moreStrip, qr } = buildSheetPosterLayout({ count: 6, listings: makeListings(5) });
    expect(moreStrip).not.toBeNull();
    expect(moreStrip!.rect.y).toBeGreaterThanOrEqual(list!.rect.y + list!.rect.h);
    expect(moreStrip!.rect.y + moreStrip!.rect.h).toBeLessThanOrEqual(qr.y);
  });
});

describe("buildSheetPosterLayout count=6 设计稿基准值", () => {
  const layout = buildSheetPosterLayout({ count: 6, listings: makeListings(5) });

  it("清单面板 {26,510,548,165}，5 行", () => {
    expect(layout.list).not.toBeNull();
    expect(layout.list!.rect).toEqual({ x: 26, y: 510, w: 548, h: 165, r: 12 });
    expect(layout.list!.rows).toHaveLength(5);
  });

  it("图片拼版：region 234–494，通栏 124 / 半图 124", () => {
    expect(layout.images[0]).toEqual({ x: 26, y: 234, w: 548, h: 124, r: 12 });
    expect(layout.images[1]).toEqual({ x: 26, y: 370, w: 268, h: 124, r: 12 });
    expect(layout.images[2]).toEqual({ x: 306, y: 370, w: 268, h: 124, r: 12 });
  });

  it("提示条 690–730、副标题文案", () => {
    expect(layout.moreStrip!.rect.y).toBe(690);
    expect(layout.moreStrip!.rect.y + layout.moreStrip!.rect.h).toBe(730);
    expect(layout.head.subtitle.text).toBe("6 套精选好房 倾情呈现");
  });
});

describe("buildSheetPosterLayout 清单面板自适应（≤5 套）", () => {
  it("count=1/2/3：面板行数=套数、底边固定 675、图片区不与面板重叠", () => {
    for (const count of [1, 2, 3]) {
      const { images, list } = buildSheetPosterLayout({ count, listings: makeListings(count) });
      expect(list).not.toBeNull();
      expect(list!.rows).toHaveLength(count);
      expect(list!.rect.y + list!.rect.h).toBe(675);
      const imagesBottom = Math.max(...images.map((r) => r.y + r.h));
      expect(imagesBottom).toBeLessThanOrEqual(list!.rect.y);
    }
  });

  it("count=1：面板 {26,642,548,33}", () => {
    const { list } = buildSheetPosterLayout({ count: 1, listings: makeListings(1) });
    expect(list!.rect).toEqual({ x: 26, y: 642, w: 548, h: 33, r: 12 });
  });

  it("count=2：面板 y=609 h=66，半图底边 593", () => {
    const { images, list } = buildSheetPosterLayout({ count: 2, listings: makeListings(2) });
    expect(list!.rect.y).toBe(609);
    expect(list!.rect.h).toBe(66);
    expect(images[0].y + images[0].h).toBe(593);
  });
});

describe("buildSheetPosterLayout 清单行数截断", () => {
  it("listings 5/6/10 条 → rows 长度均为 5", () => {
    for (const n of [5, 6, 10]) {
      const { list } = buildSheetPosterLayout({ count: n, listings: makeListings(n) });
      expect(list!.rows).toHaveLength(5);
    }
  });

  it("count=6/10 有提示条（行数截断不影响阈值判断）", () => {
    expect(buildSheetPosterLayout({ count: 6, listings: makeListings(6) }).moreStrip).not.toBeNull();
    expect(buildSheetPosterLayout({ count: 10, listings: makeListings(10) }).moreStrip).not.toBeNull();
  });
});

describe("buildSheetPosterLayout 清单商圈去重", () => {
  it("3 套同商圈：仅第 1 行展示商圈段", () => {
    const listings: SheetPosterListingRow[] = [
      { district: "徐家汇", rooms: "3室", floor: "5F", price: "580万" },
      { district: "徐家汇", rooms: "2室", floor: "12F", price: "248.5万" },
      { district: "徐家汇", rooms: "4室", floor: "3F", price: "690万" },
    ];
    const { list } = buildSheetPosterLayout({ count: 3, listings });
    const rows = list!.rows;
    expect(rows[0].segments[0].text).toBe("徐家汇");
    expect(rows[1].segments.some((s) => s.text === "徐家汇")).toBe(false);
    expect(rows[2].segments.some((s) => s.text === "徐家汇")).toBe(false);
  });

  it("商圈互不相同：各行商圈段按传入顺序展示", () => {
    const listings: SheetPosterListingRow[] = [
      { district: "徐家汇", rooms: "3室", floor: "5F", price: "580万" },
      { district: "联洋", rooms: "2室", floor: "12F", price: "248.5万" },
      { district: "大宁", rooms: "4室", floor: "3F", price: "690万" },
    ];
    const { list } = buildSheetPosterLayout({ count: 3, listings });
    expect(list!.rows.map((r) => r.segments[0].text)).toEqual(["徐家汇", "联洋", "大宁"]);
  });

  it("非连续重复（徐家汇/联洋/徐家汇）：第 3 行无商圈段且「徐家汇」全表仅出现一次", () => {
    const listings: SheetPosterListingRow[] = [
      { district: "徐家汇", rooms: "3室", floor: "5F", price: "580万" },
      { district: "联洋", rooms: "2室", floor: "12F", price: "248.5万" },
      { district: "徐家汇", rooms: "4室", floor: "3F", price: "690万" },
    ];
    const { list } = buildSheetPosterLayout({ count: 3, listings });
    const rows = list!.rows;
    expect(rows[2].segments.some((s) => s.text === "徐家汇")).toBe(false);
    const allTexts = rows.flatMap((r) => r.segments.map((s) => s.text));
    expect(allTexts.filter((t) => t === "徐家汇")).toHaveLength(1);
  });
});

describe("buildSheetPosterLayout 清单列对齐与均匀分布", () => {
  // 行 2 同商圈（省略商圈段）、行 5 无商圈无楼层：混合列成立场景
  const listings: SheetPosterListingRow[] = [
    { district: "徐家汇", rooms: "3室", floor: "5F", price: "580万" },
    { district: "徐家汇", rooms: "2室", floor: "12F", price: "248.5万" },
    { district: "联洋", rooms: "4室", floor: "3F", price: "690万" },
    { district: "虹桥商务核心区", rooms: "3室", floor: "8F", price: "350万" },
    { district: "", rooms: "2室", floor: "", price: "268万" },
  ];
  const { list } = buildSheetPosterLayout({ count: 5, listings });
  const rows = list!.rows;

  it("商圈 7 字符截断为 5 字符 + 省略号", () => {
    const seg = rows[3].segments.find((s) => s.text.includes("…"));
    expect(seg?.text).toBe("虹桥商务核…");
  });

  it("同字段列 x 跨行一致（含省略商圈的行）", () => {
    const districtX = rows[0].segments[0].x;
    expect(rows[2].segments[0].x).toBe(districtX);
    expect(rows[3].segments[0].x).toBe(districtX);
    const roomsXs = rows.map((r) => r.segments.find((s) => s.text.endsWith("室"))!.x);
    expect(new Set(roomsXs).size).toBe(1);
    const floorXs = rows.slice(0, 4).map((r) => r.segments.find((s) => s.text.endsWith("F"))!.x);
    expect(new Set(floorXs).size).toBe(1);
  });

  it("相邻 block 间距相等（chip → 各字段列 → 价格列），末列右缘落在 558", () => {
    // 列宽 = 各列非空文本最大估宽（商圈列取截断后文本）
    const districtW = estimateTextWidth("虹桥商务核…", 22);
    const roomsW = estimateTextWidth("3室", 22);
    const floorW = estimateTextWidth("12F", 22);
    const priceW = estimateTextWidth("248.5万", 22);
    const districtX = rows[0].segments[0].x;
    const roomsX = rows[0].segments.find((s) => s.text.endsWith("室"))!.x;
    const floorX = rows[0].segments.find((s) => s.text.endsWith("F"))!.x;
    const priceColX = 558 - priceW;
    const gap = (518 - 22 - districtW - roomsW - floorW - priceW) / 4;
    expect(districtX - (40 + 22)).toBeCloseTo(gap, 6);
    expect(roomsX - (districtX + districtW)).toBeCloseTo(gap, 6);
    expect(floorX - (roomsX + roomsW)).toBeCloseTo(gap, 6);
    expect(priceColX - (floorX + floorW)).toBeCloseTo(gap, 6);
  });

  it("价格列内右对齐：每行价格右缘 = 558", () => {
    for (const row of rows) {
      expect(row.price.x + estimateTextWidth(row.price.text, 22)).toBeCloseTo(558, 6);
    }
  });

  it("行内文本样式：字段 w400 Ink、价格 w500 Rust、y = rowTop + 5", () => {
    expect(rows[0].segments[0]).toMatchObject({ font: "400 22px sans-serif", color: "#17191c", y: 515 });
    expect(rows[0].price).toMatchObject({ text: "580万", font: "500 22px sans-serif", color: "#5d2a1a", y: 515 });
  });

  it("chip 几何与文本：22×22 r7 x=40，序号 1 起", () => {
    expect(rows[0].chip.rect).toEqual({ x: 40, y: 515, w: 22, h: 22, r: 7 });
    expect(rows[0].chip.text).toMatchObject({ text: "1", x: 51, y: 519, font: "500 13px sans-serif", color: "#5d2a1a" });
    expect(rows[4].chip.text.text).toBe("5");
  });
});

describe("formatSheetPosterListings 字段格式化", () => {
  const base: SheetPosterListingSource = { layout: "3室1厅1卫", floorInfo: "5/16层", totalPrice: 580 };

  it("district：商圈原样返回，绝不拼接「商圈」字样", () => {
    expect(formatSheetPosterListings([{ ...base, businessCircle: "徐家汇" }])[0].district).toBe("徐家汇");
    expect(formatSheetPosterListings([{ ...base, businessCircle: "  联洋  " }])[0].district).toBe("联洋");
  });

  it("district：商圈缺失降级小区名，两者皆无 → 空串", () => {
    expect(formatSheetPosterListings([{ ...base, communityName: "新华路小区" }])[0].district).toBe("新华路小区");
    expect(formatSheetPosterListings([{ ...base, businessCircle: "", communityName: null }])[0].district).toBe("");
    expect(formatSheetPosterListings([{ ...base, businessCircle: "  ", communityName: undefined }])[0].district).toBe("");
  });

  it("rooms：提取首个几室，中文数字转阿拉伯，无匹配 → 空串", () => {
    const rows = formatSheetPosterListings([
      { ...base, layout: "3室1厅1卫" },
      { ...base, layout: "三室两厅" },
      { ...base, layout: "两室一厅" },
      { ...base, layout: "十二室" },
      { ...base, layout: "二十三室" },
      { ...base, layout: "复式住宅" },
    ]);
    expect(rows.map((r) => r.rooms)).toEqual(["3室", "3室", "2室", "12室", "23室", ""]);
  });

  it("floor：含 / 前段数字 → nF，前段非数字 → 空串，无 / 原样", () => {
    const rows = formatSheetPosterListings([
      { ...base, floorInfo: "3/16层" },
      { ...base, floorInfo: "2/共6层" },
      { ...base, floorInfo: "中楼层/6层" },
      { ...base, floorInfo: "低楼层" },
      { ...base, floorInfo: " 5 /16层 " },
      { ...base, floorInfo: "  " },
    ]);
    expect(rows.map((r) => r.floor)).toEqual(["3F", "2F", "", "低楼层", "5F", ""]);
  });

  it("price：最多 1 位小数 + 万；非有限数 → 空串", () => {
    const rows = formatSheetPosterListings([
      { ...base, totalPrice: 580 },
      { ...base, totalPrice: 248.5 },
      { ...base, totalPrice: Number.NaN },
      { ...base, totalPrice: Number.POSITIVE_INFINITY },
    ]);
    expect(rows.map((r) => r.price)).toEqual(["580万", "248.5万", "", ""]);
  });
});

describe("buildSheetPosterLayout 安全区与重叠约束", () => {
  for (const count of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    it(`count=${count}：所有矩形（含清单面板）落在 [26,26,574,934] 安全区内`, () => {
      const layout = buildSheetPosterLayout({ count, listings: makeListings(count) });
      for (const rect of collectRects(layout)) {
        expect(isInSafeArea(rect)).toBe(true);
      }
    });

    it(`count=${count}：所有矩形互不重叠`, () => {
      const layout = buildSheetPosterLayout({ count, listings: makeListings(count) });
      const rects = collectRects(layout);
      for (let i = 0; i < rects.length; i += 1) {
        for (let j = i + 1; j < rects.length; j += 1) {
          expect(overlaps(rects[i], rects[j])).toBe(false);
        }
      }
    });
  }
});

describe("buildSheetPosterLayout 商圈文案约束", () => {
  it("任意行的商圈段文本不含「商圈」子串", () => {
    const layout = buildSheetPosterLayout({ count: 6, listings: makeListings(5) });
    const texts = layout.list!.rows.flatMap((r) => r.segments.map((s) => s.text));
    expect(texts.length).toBeGreaterThan(0);
    for (const text of texts) {
      expect(text.includes("商圈")).toBe(false);
    }
  });
});
