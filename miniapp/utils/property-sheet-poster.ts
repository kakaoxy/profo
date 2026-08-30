/**
 * 房源单分享 · 综合海报布局纯函数（多房源分享 Task 5）.
 *
 * 仅含不依赖微信运行时的纯函数（vitest 直测）：按套数自适应拼版/文案组装/
 * 暖光晕与装饰环数据描述。canvas 绘制编排见 utils/property-sheet-poster-render.ts，
 * 文本测宽/换行/cover 裁剪/二维码 data URI 复用 utils/recruit-poster.ts 导出的纯函数。
 *
 * 海报规格：竖版 5:8（600×960 逻辑单位），安全边距 26px，图片圆角 12px、间距 12px，
 * 结构自上而下（参照 docs/design/multi-property-share-hifi.html 区块 5/7）：
 * 标题区（约上部 34%，杏色径向暖光晕 + 装饰环 +「精选好房」胶囊 + 衬线主标题 + 套数副标题）
 * → 图片拼版区（1 套通栏 / 2 套并排 / ≥3 套上 1 通栏 + 下 2 并排）
 * → 「更多扫码」提示条（仅 >3 套）→ 品牌信息区 + 右下角小程序码。
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

/** 标题区高度（约上部 34%：960 × 0.34 ≈ 326）. */
const HEAD_HEIGHT = 326;
/** 图片区距标题区间距. */
const IMAGES_TOP_GAP = 24;
/** 通栏主图高度（≥3 套拼版时的上 1 张）. */
const HERO_HEIGHT = 150;
/** 「更多扫码」提示条高度及与上下元素的间距. */
const MORE_STRIP_HEIGHT = 44;
const MORE_STRIP_GAP = 20;
/** 图片区/提示条与底部品牌区间距. */
const FOOTER_GAP = 20;
/** 小程序码尺寸 + 配文行高（含与码的间距）. */
const QR_SIZE = 160;
const QR_CAPTION_GAP = 8;
const QR_CAPTION_LINE_HEIGHT = 22;
/** 底部品牌区总高（码 + 配文）. */
const FOOTER_HEIGHT = QR_SIZE + QR_CAPTION_GAP + QR_CAPTION_LINE_HEIGHT;
/** 主标题字号/行高/最大行数（衬线 display，视觉规范 Signifier 仅标题）. */
const TITLE_FONT_SIZE = 44;
const TITLE_LINE_HEIGHT = 54;
const TITLE_MAX_LINES = 2;

/** 色板（Steep Tokens，见设计稿区块 7）. */
const COLOR_INK = "#17191c";
const COLOR_RUST = "#5d2a1a";
const COLOR_APRICOT = "#fbe1d1";
const COLOR_GRAPHITE = "#777b86";
const COLOR_FOG = "#f7f7f8";

/** 主标题固定文案（衬线字体栈）. */
const TITLE_TEXT = "美房宝品质二手房";
const TITLE_FONT = `400 ${TITLE_FONT_SIZE}px "Songti SC", "STSong", serif`;

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

/** 标题区（约上部 34%）. */
export interface SheetPosterHead {
  rect: SheetPosterRect;
  glow: SheetPosterGlow;
  ring: SheetPosterRing;
  pill: SheetPosterPill;
  titleLines: SheetPosterText[];
  subtitle: SheetPosterText;
}

/** 「更多扫码」提示条（仅 >3 套）. */
export interface SheetPosterMoreStrip {
  rect: SheetPosterRect;
  text: SheetPosterText;
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
  moreStrip: SheetPosterMoreStrip | null;
  brand: SheetPosterBrand;
  qr: SheetPosterQr;
}

/**
 * 组装综合海报布局（拼版/坐标/文案）.
 * @param opts.count 房源单实际套数（1~10；图片最多拼 3 张，>3 套出提示条）
 */
export function buildSheetPosterLayout(opts: { count: number }): SheetPosterLayout {
  const count = Math.max(1, Math.floor(opts.count));

  // ===== 标题区（约上部 34%）=====
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
  // 「精选好房」胶囊（Rust 底白字）
  const pillFontSize = 21;
  const pillText = "精选好房";
  const pillPadH = 22;
  const pillPadV = 6;
  const pillY = 42;
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
  // 主标题（衬线，wrapTitleLines 排版）
  const titleY = pillY + pill.rect.h + 22;
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
  // 副标题（套数随实际所选变化）
  const subtitle: SheetPosterText = {
    text: `${count} 套优质房源 精选呈现`,
    x: SHEET_POSTER_SAFE_MARGIN,
    y: titleY + titleLines.length * TITLE_LINE_HEIGHT + 6,
    font: "400 24px sans-serif",
    color: COLOR_GRAPHITE,
  };
  const head: SheetPosterHead = { rect: headRect, glow, ring, pill, titleLines, subtitle };

  // ===== 图片拼版区（数量自适应，全部落在安全区内且互不重叠）=====
  const imagesTop = HEAD_HEIGHT + IMAGES_TOP_GAP;
  const imagesBottom = count > 3
    ? SHEET_POSTER_HEIGHT - SHEET_POSTER_SAFE_MARGIN - FOOTER_HEIGHT - FOOTER_GAP
      - MORE_STRIP_HEIGHT - MORE_STRIP_GAP
    : SHEET_POSTER_HEIGHT - SHEET_POSTER_SAFE_MARGIN - FOOTER_HEIGHT - FOOTER_GAP;
  const contentWidth = SHEET_POSTER_WIDTH - SHEET_POSTER_SAFE_MARGIN * 2;
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
    // ≥3 套：上 1 通栏 + 下 2 并排（仅用前 3 套封面）
    const rowH = imagesBottom - imagesTop - HERO_HEIGHT - SHEET_POSTER_IMAGE_GAP;
    images = [
      { x: SHEET_POSTER_SAFE_MARGIN, y: imagesTop, w: contentWidth, h: HERO_HEIGHT, r: SHEET_POSTER_IMAGE_RADIUS },
      { x: SHEET_POSTER_SAFE_MARGIN, y: imagesTop + HERO_HEIGHT + SHEET_POSTER_IMAGE_GAP, w: halfWidth, h: rowH, r: SHEET_POSTER_IMAGE_RADIUS },
      { x: halfX2, y: imagesTop + HERO_HEIGHT + SHEET_POSTER_IMAGE_GAP, w: halfWidth, h: rowH, r: SHEET_POSTER_IMAGE_RADIUS },
    ];
  }

  // ===== 「更多扫码」提示条（仅 >3 套，Apricot 底 Rust 字）=====
  const moreStrip: SheetPosterMoreStrip | null = count > 3
    ? {
        rect: {
          x: SHEET_POSTER_SAFE_MARGIN,
          y: imagesBottom + MORE_STRIP_GAP,
          w: contentWidth,
          h: MORE_STRIP_HEIGHT,
          r: SHEET_POSTER_IMAGE_RADIUS,
        },
        text: {
          text: `已为您精选 ${count} 套 · 更多好房 扫码查看`,
          x: SHEET_POSTER_WIDTH / 2,
          y: imagesBottom + MORE_STRIP_GAP + (MORE_STRIP_HEIGHT - 22) / 2,
          font: "500 22px sans-serif",
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
      text: "美房宝 · 品质二手房",
      x: SHEET_POSTER_SAFE_MARGIN + 20,
      y: brandMainY,
      font: "500 28px sans-serif",
      color: COLOR_INK,
    },
    sub: {
      text: "真实在售 · 实拍房源",
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

  return { width: SHEET_POSTER_WIDTH, height: SHEET_POSTER_HEIGHT, head, images, moreStrip, brand, qr };
}
