/**
 * 房源单分享 · 综合海报布局纯函数（多房源分享 Task 5 + 房源清单迭代 方案B卡片清单）.
 *
 * 仅含不依赖微信运行时的纯函数（vitest 直测）：按套数自适应拼版/文案组装/
 * 暖光晕与装饰环数据描述/清单面板几何（商圈去重 + 跨行对齐列排版）。
 * canvas 绘制编排见 utils/property-sheet-poster-render.ts，
 * 文本测宽/换行/cover 裁剪/二维码 data URI 复用 utils/recruit-poster.ts 导出的纯函数。
 *
 * 海报规格：竖版 5:8（600×960 逻辑单位），安全边距 26px，图片圆角 12px、间距 12px，
 * 结构自上而下（参照 docs/design/property-sheet-poster-v2-hifi.html）：
 * 标题区（0–214，杏色径向暖光晕 + 装饰环 +「精选好房」胶囊 + 衬线主标题 + 套数副标题）
 * → 图片拼版区（1 套通栏 / 2 套并排 / ≥3 套上 1 通栏 + 下 2 并排）
 * → 清单面板（方案B卡片清单：Fog 底圆角矩形，行高 33 × ≤5 行，底边固定 675）
 * → 「更多扫码」提示条（690–730，仅 >5 套）→ 品牌信息区 + 右下角小程序码。
 *
 * 注：本文件 500+ 行，不拆分理由——全部内容是同一张海报的布局纯函数单一内聚模块
 * （渲染器/单测均从此单文件 import，拆分会产生跨文件依赖且超出本次任务允许改动范围）。
 */

import { estimateTextWidth, wrapTitleLines } from "./recruit-poster";

/** 海报画布逻辑尺寸（5:8）. */
export const SHEET_POSTER_WIDTH = 600;
export const SHEET_POSTER_HEIGHT = 960;
/** 安全边距：所有矩形须落在 [26, 26, 574, 934] 内. */
export const SHEET_POSTER_SAFE_MARGIN = 26;
/** 图片圆角. */
export const SHEET_POSTER_IMAGE_RADIUS = 12;
/** 图片间距. */
export const SHEET_POSTER_IMAGE_GAP = 12;

/** 标题区高度（为清单让位由 326 压缩至 214，见设计稿纵向预算区块）. */
const HEAD_HEIGHT = 214;
/** 图片区距标题区间距（图片区顶 y = 214 + 20 = 234）. */
const IMAGES_TOP_GAP = 20;
/** 通栏主图高度上限（剩余区域充裕时封顶，避免超过旧版基准 150）. */
const HERO_HEIGHT = 150;
/** 主标题字号/行高/最大行数（衬线 display，视觉规范 Signifier 仅标题；标题区压缩后 44/54 → 40/48）. */
const TITLE_FONT_SIZE = 40;
const TITLE_LINE_HEIGHT = 48;
const TITLE_MAX_LINES = 2;
/** 清单区（方案B卡片清单）：行高/最多行数/面板底边（行数自适应向上生长）. */
const LIST_ROW_HEIGHT = 33;
const LIST_MAX_ROWS = 5;
const LIST_PANEL_BOTTOM = 675;
/** 清单面板内容区（面板左缘 26 + 内边距 14；右侧内边距 16 → 内容宽 518）. */
const LIST_CONTENT_X = 40;
const LIST_CONTENT_W = 518;
/** 清单行序号 chip 尺寸/圆角/字号. */
const LIST_CHIP_SIZE = 22;
const LIST_CHIP_RADIUS = 7;
const LIST_CHIP_FONT_SIZE = 13;
/** 清单字段/价格字号. */
const LIST_FIELD_FONT_SIZE = 22;
/** 溢出提示条（仅 >5 套；位置固定 690–730）. */
const MORE_STRIP_THRESHOLD = 5;
const MORE_STRIP_TOP = 690;
const MORE_STRIP_HEIGHT = 40;
const MORE_STRIP_FONT_SIZE = 20;
/** 小程序码尺寸 + 配文行高（含与码的间距）. */
const QR_SIZE = 160;
const QR_CAPTION_GAP = 8;
const QR_CAPTION_LINE_HEIGHT = 22;
/** 底部品牌区总高（码 + 配文）. */
const FOOTER_HEIGHT = QR_SIZE + QR_CAPTION_GAP + QR_CAPTION_LINE_HEIGHT;

/** 色板（Steep Tokens，见设计稿区块 7）. */
const COLOR_INK = "#17191c";
const COLOR_RUST = "#5d2a1a";
const COLOR_APRICOT = "#fbe1d1";
const COLOR_GRAPHITE = "#777b86";
const COLOR_FOG = "#f7f7f8";

/** 主标题固定文案（衬线字体栈）. */
const TITLE_TEXT = "美房宝品质二手房";
const TITLE_FONT = `400 ${TITLE_FONT_SIZE}px "Songti SC", "STSong", serif`;
/** 清单字段（w400）/价格（w500）/chip 序号字体. */
const LIST_FIELD_FONT = `400 ${LIST_FIELD_FONT_SIZE}px sans-serif`;
const LIST_PRICE_FONT = `500 ${LIST_FIELD_FONT_SIZE}px sans-serif`;
const LIST_CHIP_FONT = `500 ${LIST_CHIP_FONT_SIZE}px sans-serif`;

/** 圆角矩形. */
export interface SheetPosterRect {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
}

/** 文本（textBaseline=top；align 缺省 left）. */
export interface SheetPosterText {
  text: string;
  x: number;
  y: number;
  font: string;
  color: string;
  align?: "left" | "center";
}

/** 渐变色标. */
export interface SheetPosterGradientStop {
  offset: number;
  color: string;
}

/** 径向暖光晕（圆形渐变数据描述，绘制层裁剪到标题区落笔）. */
export interface SheetPosterGlow {
  cx: number;
  cy: number;
  r: number;
  stops: SheetPosterGradientStop[];
}

/** 标题区装饰环（描边圆）. */
export interface SheetPosterRing {
  cx: number;
  cy: number;
  r: number;
  color: string;
  lineWidth: number;
}

/** 胶囊标签. */
export interface SheetPosterPill {
  rect: SheetPosterRect;
  text: SheetPosterText;
}

/** 标题区（上部 0–214）. */
export interface SheetPosterHead {
  rect: SheetPosterRect;
  glow: SheetPosterGlow;
  ring: SheetPosterRing;
  pill: SheetPosterPill;
  titleLines: SheetPosterText[];
  subtitle: SheetPosterText;
}

/** 「更多扫码」提示条（仅 >5 套）. */
export interface SheetPosterMoreStrip {
  rect: SheetPosterRect;
  text: SheetPosterText;
}

/** 清单行展示段（列位由布局统一计算，跨行对齐）. */
export interface SheetPosterListSegment {
  text: string;
  x: number;
  y: number;
  font: string;
  color: string;
}

/** 清单行（序号 chip + 字段列 + 右对齐价格）. */
export interface SheetPosterListRow {
  chip: { rect: SheetPosterRect; text: SheetPosterText };
  segments: SheetPosterListSegment[];
  price: SheetPosterListSegment;
}

/** 清单面板（Fog 底圆角矩形 + 行数组）. */
export interface SheetPosterListPanel {
  rect: SheetPosterRect;
  rows: SheetPosterListRow[];
}

/** 页面层传入的逐套房源原始字段（经 API 响应挑选）. */
export interface SheetPosterListingSource {
  businessCircle?: string | null;
  communityName?: string | null;
  layout: string;
  floorInfo: string;
  totalPrice: number;
}

/** 逐套格式化后的清单行（空串表示该段省略）. */
export interface SheetPosterListingRow {
  district: string;
  rooms: string;
  floor: string;
  price: string;
}

/** 品牌信息区（Rust 圆点 + 主行 + 副行）. */
export interface SheetPosterBrand {
  dot: { cx: number; cy: number; r: number; color: string };
  main: SheetPosterText;
  sub: SheetPosterText;
}

/** 小程序码（右下角）+ 配文. */
export interface SheetPosterQr {
  x: number;
  y: number;
  size: number;
  caption: SheetPosterText;
}

/** 海报完整布局（全部坐标/字体/颜色由纯函数算出，绘制器只负责落笔）. */
export interface SheetPosterLayout {
  width: number;
  height: number;
  head: SheetPosterHead;
  images: SheetPosterRect[];
  list: SheetPosterListPanel | null;
  moreStrip: SheetPosterMoreStrip | null;
  brand: SheetPosterBrand;
  qr: SheetPosterQr;
}

/** 中文数字 → 阿拉伯数值映射（两按 2 计）. */
const CHINESE_DIGIT_MAP: Record<string, number> = {
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

/** 户型几室数字解析：阿拉伯数字直接用；中文数字支持 十/X十/X十Y/十X 组合. */
function parseChineseRoomCount(raw: string): number {
  if (/^\d+$/.test(raw)) {
    return Number.parseInt(raw, 10);
  }
  const tenIndex = raw.indexOf("十");
  if (tenIndex < 0) {
    return CHINESE_DIGIT_MAP[raw] ?? 0;
  }
  const tens = tenIndex === 0 ? 1 : (CHINESE_DIGIT_MAP[raw.slice(0, tenIndex)] ?? 0);
  const onesPart = raw.slice(tenIndex + 1);
  const ones = onesPart === "" ? 0 : (CHINESE_DIGIT_MAP[onesPart] ?? 0);
  return tens * 10 + ones;
}

/**
 * 格式化逐套房源为清单行（商圈降级链/几室/楼层NF/价格最多 1 位小数）.
 * @returns 与入参等长的行数组；无法解析的字段为空串（布局层省略该段）
 */
export function formatSheetPosterListings(items: SheetPosterListingSource[]): SheetPosterListingRow[] {
  return items.map((item) => {
    // 商圈降级链：商圈 → 小区名，trim 后原样返回（绝不拼接「商圈」字样）
    const district = (item.businessCircle ?? "").trim() || (item.communityName ?? "").trim();
    // 几室：提取首个「N室」，中文数字转阿拉伯
    const roomsMatch = /([0-9一二两三四五六七八九十]+)室/.exec(item.layout);
    // 楼层：含 / 取前段，纯数字 → nF（前段非数字省略）；不含 / 返回 trim 后原样
    let floor = item.floorInfo.trim();
    const slashIndex = floor.indexOf("/");
    if (slashIndex >= 0) {
      const head = floor.slice(0, slashIndex).trim();
      floor = /^\d+$/.test(head) ? `${Number.parseInt(head, 10)}F` : "";
    }
    // 价格：最多 1 位小数（四舍五入）+ 万；非有限数省略
    const price = Number.isFinite(item.totalPrice)
      ? `${Math.round(item.totalPrice * 10) / 10}万`
      : "";
    return {
      district,
      rooms: roomsMatch ? `${parseChineseRoomCount(roomsMatch[1])}室` : "",
      floor,
      price,
    };
  });
}

/** 取一组文本按指定字号的估算宽度最大值（空文本计 0）. */
function maxTextWidth(texts: readonly string[], fontSize: number): number {
  let max = 0;
  for (const text of texts) {
    const width = estimateTextWidth(text, fontSize);
    if (width > max) {
      max = width;
    }
  }
  return max;
}

/** 清单字段列定义（key 用于取行内文本）. */
type ListColumnKey = "district" | "rooms" | "floor";

/**
 * 组装清单行（方案B卡片清单）：序号 chip + 跨行对齐字段列 + 右对齐价格列.
 * 商圈以截断前完整串为键去重（仅首次出现行展示商圈段）；
 * 各字段列宽 = 该列非空文本最大估宽，blocks = [chip, ...字段列, 价格列] 等间距均匀分布，
 * 价格列右缘落在内容区右缘 558.
 */
function buildListPanelRows(listings: SheetPosterListingRow[], listTop: number): SheetPosterListRow[] {
  // 商圈去重 + 截断（>6 字符截为 5 + 省略号；截断仅影响展示与列宽，不影响去重键）
  const seenDistricts = new Set<string>();
  const districtTexts = listings.map((row) => {
    if (row.district === "" || seenDistricts.has(row.district)) {
      return "";
    }
    seenDistricts.add(row.district);
    return row.district.length > 6 ? `${row.district.slice(0, 5)}…` : row.district;
  });
  // 列：按 [district, rooms, floor] 顺序，出现过非空文本的列成立
  const columnTexts: { key: ListColumnKey; texts: string[] }[] = [
    { key: "district", texts: districtTexts },
    { key: "rooms", texts: listings.map((row) => row.rooms) },
    { key: "floor", texts: listings.map((row) => row.floor) },
  ];
  const columns = columnTexts
    .map((col) => ({ ...col, width: maxTextWidth(col.texts, LIST_FIELD_FONT_SIZE), x: 0 }))
    .filter((col) => col.width > 0);
  const priceWidth = maxTextWidth(listings.map((row) => row.price), LIST_FIELD_FONT_SIZE);
  // 等间距：g = (内容宽 - chip宽 - Σ列宽 - 价格列宽) / 间隔数；价格列右缘 = 40 + 518 = 558
  const fixedWidth = LIST_CHIP_SIZE + columns.reduce((sum, col) => sum + col.width, 0) + priceWidth;
  const gap = Math.max(8, (LIST_CONTENT_W - fixedWidth) / (columns.length + 1));
  let cursor = LIST_CONTENT_X + LIST_CHIP_SIZE + gap;
  for (const col of columns) {
    col.x = cursor;
    cursor += col.width + gap;
  }
  const priceColX = LIST_CONTENT_X + LIST_CONTENT_W - priceWidth;
  return listings.map((row, i) => {
    const rowTop = listTop + i * LIST_ROW_HEIGHT;
    const segments: SheetPosterListSegment[] = [];
    for (const col of columns) {
      const text = col.key === "district" ? districtTexts[i] : col.key === "rooms" ? row.rooms : row.floor;
      if (text === "") {
        continue;
      }
      segments.push({ text, x: col.x, y: rowTop + 5, font: LIST_FIELD_FONT, color: COLOR_INK });
    }
    return {
      chip: {
        rect: {
          x: LIST_CONTENT_X,
          y: rowTop + 5,
          w: LIST_CHIP_SIZE,
          h: LIST_CHIP_SIZE,
          r: LIST_CHIP_RADIUS,
        },
        text: {
          text: String(i + 1),
          x: LIST_CONTENT_X + LIST_CHIP_SIZE / 2,
          y: rowTop + 5 + 4,
          font: LIST_CHIP_FONT,
          color: COLOR_RUST,
          align: "center",
        },
      },
      segments,
      price: {
        text: row.price,
        x: priceColX + priceWidth - estimateTextWidth(row.price, LIST_FIELD_FONT_SIZE),
        y: rowTop + 5,
        font: LIST_PRICE_FONT,
        color: COLOR_RUST,
      },
    };
  });
}

/**
 * 组装综合海报布局（拼版/坐标/文案/清单面板）.
 * @param opts.count 房源单实际套数（1~10；图片最多拼 3 张，>5 套出提示条）
 * @param opts.listings 逐套格式化后的清单行（formatSheetPosterListings 产出，最多展示 5 行；
 *   空数组为防御路径 → list=null，图片区回吃清单让出的高度）
 */
export function buildSheetPosterLayout(opts: {
  count: number;
  listings: SheetPosterListingRow[];
}): SheetPosterLayout {
  const count = Math.max(1, Math.floor(opts.count));

  // ===== 标题区（0–214）=====
  const headRect: SheetPosterRect = { x: 0, y: 0, w: SHEET_POSTER_WIDTH, h: HEAD_HEIGHT, r: 0 };
  // 杏色径向暖光晕：对应设计稿 radial-gradient(120% 130% at 12% 0%)，圆形近似 + 绘制层裁剪
  const glow: SheetPosterGlow = {
    cx: 72,
    cy: 0,
    r: 560,
    stops: [
      { offset: 0, color: "rgba(251,225,209,0.95)" },
      { offset: 0.42, color: "rgba(251,225,209,0.42)" },
      { offset: 0.78, color: "rgba(255,255,255,0)" },
      { offset: 1, color: "rgba(255,255,255,0)" },
    ],
  };
  // 右上角装饰环（设计稿 p-head::after：1px Rust 14% 描边圆，出血裁剪）
  const ring: SheetPosterRing = {
    cx: 572,
    cy: 28,
    r: 96,
    color: "rgba(93,42,26,0.14)",
    lineWidth: 2,
  };
  // 「精选好房」胶囊（Rust 底白字，y 36）
  const pillFontSize = 21;
  const pillText = "精选好房";
  const pillPadH = 22;
  const pillPadV = 6;
  const pillY = 36;
  const pill: SheetPosterPill = {
    rect: {
      x: SHEET_POSTER_SAFE_MARGIN,
      y: pillY,
      w: estimateTextWidth(pillText, pillFontSize) + pillPadH * 2,
      h: pillFontSize + pillPadV * 2,
      r: (pillFontSize + pillPadV * 2) / 2,
    },
    text: {
      text: pillText,
      x: SHEET_POSTER_SAFE_MARGIN + pillPadH,
      y: pillY + pillPadV,
      font: `400 ${pillFontSize}px sans-serif`,
      color: "#ffffff",
    },
  };
  // 主标题（衬线，wrapTitleLines 排版；首行 y 固定 85）
  const titleY = 85;
  const titleLines: SheetPosterText[] = wrapTitleLines(
    TITLE_TEXT,
    SHEET_POSTER_WIDTH - SHEET_POSTER_SAFE_MARGIN * 2,
    TITLE_FONT_SIZE,
    TITLE_MAX_LINES,
  ).map((text, i) => ({
    text,
    x: SHEET_POSTER_SAFE_MARGIN,
    y: titleY + i * TITLE_LINE_HEIGHT,
    font: TITLE_FONT,
    color: COLOR_INK,
  }));
  // 副标题（套数随实际所选变化；y 固定 139）
  const subtitle: SheetPosterText = {
    text: `${count} 套精选好房 倾情呈现`,
    x: SHEET_POSTER_SAFE_MARGIN,
    y: 139,
    font: "400 22px sans-serif",
    color: COLOR_GRAPHITE,
  };
  const head: SheetPosterHead = { rect: headRect, glow, ring, pill, titleLines, subtitle };

  // ===== 清单面板（方案B卡片清单：底边固定 675，行数自适应向上生长）=====
  const shownListings = opts.listings.slice(0, LIST_MAX_ROWS);
  const contentWidth = SHEET_POSTER_WIDTH - SHEET_POSTER_SAFE_MARGIN * 2;
  let list: SheetPosterListPanel | null = null;
  // 图片区底边：有清单时 = 面板顶 - 16；无清单（防御路径）= 675 - 16 = 659
  let imagesBottom = LIST_PANEL_BOTTOM - 16;
  if (shownListings.length > 0) {
    const listTop = LIST_PANEL_BOTTOM - shownListings.length * LIST_ROW_HEIGHT;
    list = {
      rect: {
        x: SHEET_POSTER_SAFE_MARGIN,
        y: listTop,
        w: contentWidth,
        h: shownListings.length * LIST_ROW_HEIGHT,
        r: SHEET_POSTER_IMAGE_RADIUS,
      },
      rows: buildListPanelRows(shownListings, listTop),
    };
    imagesBottom = listTop - 16;
  }

  // ===== 图片拼版区（数量自适应，全部落在安全区内且互不重叠）=====
  const imagesTop = HEAD_HEIGHT + IMAGES_TOP_GAP;
  const halfWidth = (contentWidth - SHEET_POSTER_IMAGE_GAP) / 2;
  const halfX2 = SHEET_POSTER_SAFE_MARGIN + halfWidth + SHEET_POSTER_IMAGE_GAP;
  let images: SheetPosterRect[];
  if (count === 1) {
    // 1 套：通栏大图
    images = [{
      x: SHEET_POSTER_SAFE_MARGIN,
      y: imagesTop,
      w: contentWidth,
      h: imagesBottom - imagesTop,
      r: SHEET_POSTER_IMAGE_RADIUS,
    }];
  } else if (count === 2) {
    // 2 套：左右并排等宽
    images = [
      { x: SHEET_POSTER_SAFE_MARGIN, y: imagesTop, w: halfWidth, h: imagesBottom - imagesTop, r: SHEET_POSTER_IMAGE_RADIUS },
      { x: halfX2, y: imagesTop, w: halfWidth, h: imagesBottom - imagesTop, r: SHEET_POSTER_IMAGE_RADIUS },
    ];
  } else {
    // ≥3 套：上 1 通栏 + 下 2 并排（仅用前 3 套封面）；剩余区域扣除间距后对半分，
    // 通栏封顶 150（设计稿基准：region 260 → 124/124，region 326 → 150/164）
    const regionH = imagesBottom - imagesTop;
    const heroH = Math.min(HERO_HEIGHT, Math.round((regionH - SHEET_POSTER_IMAGE_GAP) / 2));
    const halvesH = regionH - SHEET_POSTER_IMAGE_GAP - heroH;
    images = [
      { x: SHEET_POSTER_SAFE_MARGIN, y: imagesTop, w: contentWidth, h: heroH, r: SHEET_POSTER_IMAGE_RADIUS },
      { x: SHEET_POSTER_SAFE_MARGIN, y: imagesTop + heroH + SHEET_POSTER_IMAGE_GAP, w: halfWidth, h: halvesH, r: SHEET_POSTER_IMAGE_RADIUS },
      { x: halfX2, y: imagesTop + heroH + SHEET_POSTER_IMAGE_GAP, w: halfWidth, h: halvesH, r: SHEET_POSTER_IMAGE_RADIUS },
    ];
  }

  // ===== 「更多扫码」提示条（仅 >5 套，位置固定 690–730，Apricot 底 Rust 字）=====
  const moreStrip: SheetPosterMoreStrip | null = count > MORE_STRIP_THRESHOLD
    ? {
        rect: {
          x: SHEET_POSTER_SAFE_MARGIN,
          y: MORE_STRIP_TOP,
          w: contentWidth,
          h: MORE_STRIP_HEIGHT,
          r: SHEET_POSTER_IMAGE_RADIUS,
        },
        text: {
          text: `已精选 ${count} 套 · 更多好房 扫码查看`,
          x: SHEET_POSTER_WIDTH / 2,
          y: MORE_STRIP_TOP + (MORE_STRIP_HEIGHT - MORE_STRIP_FONT_SIZE) / 2,
          font: `500 ${MORE_STRIP_FONT_SIZE}px sans-serif`,
          color: COLOR_RUST,
          align: "center",
        },
      }
    : null;

  // ===== 底部品牌信息区 + 右下角小程序码 =====
  const footerTop = SHEET_POSTER_HEIGHT - SHEET_POSTER_SAFE_MARGIN - FOOTER_HEIGHT;
  const qrX = SHEET_POSTER_WIDTH - SHEET_POSTER_SAFE_MARGIN - QR_SIZE;
  // 品牌两行文字块（28 + 8 + 22 = 58）在品牌区内垂直居中
  const brandMainY = footerTop + (FOOTER_HEIGHT - 58) / 2;
  const brand: SheetPosterBrand = {
    dot: { cx: SHEET_POSTER_SAFE_MARGIN + 5, cy: brandMainY + 14, r: 5, color: COLOR_RUST },
    main: {
      text: "专注上海老破小",
      x: SHEET_POSTER_SAFE_MARGIN + 20,
      y: brandMainY,
      font: "500 28px sans-serif",
      color: COLOR_INK,
    },
    sub: {
      text: "所见即所得 · 每套皆标杆",
      x: SHEET_POSTER_SAFE_MARGIN + 20,
      y: brandMainY + 28 + 8,
      font: "400 22px sans-serif",
      color: COLOR_GRAPHITE,
    },
  };
  const qr: SheetPosterQr = {
    x: qrX,
    y: footerTop,
    size: QR_SIZE,
    caption: {
      text: "扫码看全部房源",
      x: qrX + QR_SIZE / 2,
      y: footerTop + QR_SIZE + QR_CAPTION_GAP,
      font: `400 ${QR_CAPTION_LINE_HEIGHT}px sans-serif`,
      color: COLOR_GRAPHITE,
      align: "center",
    },
  };

  return { width: SHEET_POSTER_WIDTH, height: SHEET_POSTER_HEIGHT, head, images, list, moreStrip, brand, qr };
}
