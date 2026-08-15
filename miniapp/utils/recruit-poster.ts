/**
 * 区域伙伴招募计划 · 海报布局纯函数（招募计划二期 X-4）.
 *
 * 仅含不依赖微信运行时的纯函数（vitest 直测）：布局组装/文案截断换行/cover 裁剪计算/
 * 二维码 data URI 组装。canvas 绘制编排与保存相册见 utils/recruit-poster-render.ts。
 *
 * 海报规格：竖版 5:8（600×960 逻辑单位），内容自上而下：
 * 背景（poster_bg_url cover / 品牌渐变兜底）→ 标签「招募进行中」→ 活动标题（超长省略/换行）
 * → 引导文案「一键授权报名，专人对接」→ 底部白色圆角卡片内嵌小程序码 + 「长按识别小程序码 报名占位」
 */

import type { components } from "../types/api-types";
import { resolveAssetUrl } from "./url";

type RecruitCampaignDetailResponse = components["schemas"]["RecruitCampaignDetailResponse"];

/** 海报画布逻辑尺寸（5:8）. */
export const POSTER_WIDTH = 600;
export const POSTER_HEIGHT = 960;

// ===== 纯函数层 =====

/** 文本宽度估算：CJK 全角 ≈ fontSize，其余（ASCII/半角）≈ fontSize × 0.55. */
export function estimateTextWidth(text: string, fontSize: number): number {
  let width = 0;
  for (const ch of text) {
    width += /[\u2E80-\u9FFF\uF900-\uFAFF\u3000-\u303F\uFF00-\uFFEF]/.test(ch)
      ? fontSize
      : fontSize * 0.55;
  }
  return width;
}

/**
 * 标题按估算宽度换行，超出 maxLines 时末行截断加省略号.
 * @returns 行数组（最多 maxLines 行；空文本返回空数组）
 */
export function wrapTitleLines(
  title: string,
  maxWidth: number,
  fontSize: number,
  maxLines: number,
): string[] {
  const lines: string[] = [];
  let current = "";
  let currentWidth = 0;
  const ellipsisWidth = estimateTextWidth("…", fontSize);
  const chars = Array.from(title);
  for (const ch of chars) {
    const chWidth = estimateTextWidth(ch, fontSize);
    if (currentWidth + chWidth > maxWidth && current) {
      if (lines.length === maxLines - 1) {
        // 已是最后一行：回退字符容纳省略号
        while (current && currentWidth + ellipsisWidth > maxWidth) {
          const last = current[current.length - 1];
          current = current.slice(0, -1);
          currentWidth -= estimateTextWidth(last, fontSize);
        }
        lines.push(`${current}…`);
        return lines;
      }
      lines.push(current);
      current = ch;
      currentWidth = chWidth;
    } else {
      current += ch;
      currentWidth += chWidth;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines;
}

/** cover 模式源矩形（等比放大填满目标区，居中裁剪）. */
export interface CoverSourceRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/** 计算将 imgW×imgH 以 cover 模式绘制到 dstW×dstH 的源裁剪矩形. */
export function computeCoverSourceRect(
  imgW: number,
  imgH: number,
  dstW: number,
  dstH: number,
): CoverSourceRect {
  const scale = Math.max(dstW / imgW, dstH / imgH);
  const sw = dstW / scale;
  const sh = dstH / scale;
  return { sx: (imgW - sw) / 2, sy: (imgH - sh) / 2, sw, sh };
}

/** 小程序码 base64 → canvas createImage 可用的 data URI（已带前缀原样返回）. */
export function toQrcodeDataUri(base64: string): string {
  return base64.startsWith("data:") ? base64 : `data:image/png;base64,${base64}`;
}

/** 圆角矩形. */
export interface PosterRect {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
}

/** 文本（textBaseline=top / textAlign=left）. */
export interface PosterText {
  text: string;
  x: number;
  y: number;
  font: string;
  color: string;
}

/** 装饰圆. */
export interface PosterCircle {
  cx: number;
  cy: number;
  r: number;
  color: string;
}

/** 渐变色标. */
export interface PosterGradientStop {
  offset: number;
  color: string;
}

/** 海报完整布局（全部坐标/字体/颜色由纯函数算出，绘制器只负责落笔）. */
export interface PosterLayout {
  width: number;
  height: number;
  background:
    | { kind: "gradient"; stops: PosterGradientStop[] }
    | { kind: "image"; src: string };
  circles: PosterCircle[];
  tag: { rect: PosterRect; text: PosterText };
  titleLines: PosterText[];
  divider: PosterRect;
  lead: PosterText;
  card: PosterRect;
  qr: { x: number; y: number; size: number };
  qrTitle: PosterText;
  qrSub: PosterText;
}

/** 标题兜底文案（campaign.title 为空时）. */
const FALLBACK_TITLE = "区域伙伴招募计划";
/** 标题字号/行高（对应设计稿 23px@272 宽）. */
const TITLE_FONT_SIZE = 52;
const TITLE_LINE_HEIGHT = 66;
/** 标题最大行数（超长第 2 行省略）. */
const TITLE_MAX_LINES = 2;

/**
 * 组装海报布局（尺寸/坐标/文案截断）.
 * @param opts.title 活动标题（超长自动换行/省略）
 * @param opts.bgUrl 背景图完整 URL（空 → 品牌渐变兜底）
 */
export function buildPosterLayout(opts: { title: string; bgUrl?: string }): PosterLayout {
  const title = (opts.title || "").trim() || FALLBACK_TITLE;
  const bgUrl = (opts.bgUrl || "").trim();
  const marginX = 48;
  // 标签 pill
  const tagFontSize = 22;
  const tagText = "招募进行中";
  const tagTextWidth = estimateTextWidth(tagText, tagFontSize);
  const tagPadH = 22;
  const tagPadV = 10;
  const tagY = 64;
  const tagRect: PosterRect = {
    x: marginX,
    y: tagY,
    w: tagTextWidth + tagPadH * 2,
    h: tagFontSize + tagPadV * 2,
    r: (tagFontSize + tagPadV * 2) / 2,
  };
  // 标题行（首行 y 紧跟标签下方）
  const titleY = tagY + tagRect.h + 26;
  const lineTexts = wrapTitleLines(
    title,
    POSTER_WIDTH - marginX * 2,
    TITLE_FONT_SIZE,
    TITLE_MAX_LINES,
  );
  const titleLines: PosterText[] = lineTexts.map((text, i) => ({
    text,
    x: marginX,
    y: titleY + i * TITLE_LINE_HEIGHT,
    font: `bold ${TITLE_FONT_SIZE}px sans-serif`,
    color: "#ffffff",
  }));
  // 分隔条 + 引导文案
  const dividerY = titleY + lineTexts.length * TITLE_LINE_HEIGHT + 18;
  const leadFontSize = 29;
  // 底部白色卡片 + 小程序码
  const cardH = 184;
  const cardY = POSTER_HEIGHT - 26 - cardH;
  const qrSize = 140;
  const qrX = marginX;
  const qrY = cardY + 22;
  return {
    width: POSTER_WIDTH,
    height: POSTER_HEIGHT,
    background: bgUrl
      ? { kind: "image", src: bgUrl }
      : {
          kind: "gradient",
          stops: [
            { offset: 0, color: "#1e3fae" },
            { offset: 0.48, color: "#2563eb" },
            { offset: 1, color: "#6ea8f8" },
          ],
        },
    circles: [
      { cx: 512, cy: 110, r: 242, color: "rgba(255,255,255,0.10)" },
      { cx: 44, cy: 484, r: 154, color: "rgba(255,255,255,0.06)" },
    ],
    tag: {
      rect: tagRect,
      text: { text: tagText, x: marginX + tagPadH, y: tagY + tagPadV, font: `${tagFontSize}px sans-serif`, color: "#ffffff" },
    },
    titleLines,
    divider: { x: marginX, y: dividerY, w: 76, h: 7, r: 4 },
    lead: {
      text: "一键授权报名，专人对接",
      x: marginX,
      y: dividerY + 7 + 22,
      font: `${leadFontSize}px sans-serif`,
      color: "rgba(255,255,255,0.92)",
    },
    card: { x: 26, y: cardY, w: POSTER_WIDTH - 52, h: cardH, r: 26 },
    qr: { x: qrX, y: qrY, size: qrSize },
    qrTitle: {
      text: "长按识别小程序码",
      x: qrX + qrSize + 22,
      y: qrY + 38,
      font: "bold 28px sans-serif",
      color: "#17191c",
    },
    qrSub: {
      text: "报名占位",
      x: qrX + qrSize + 22,
      y: qrY + 38 + 28 + 10,
      font: "23px sans-serif",
      color: "#777b86",
    },
  };
}

/**
 * 读取海报背景图完整 URL.
 * ⚠️ C 端详情响应当前未返回 poster_bg_url（后端 RecruitCampaignDetailResponse 未含该字段），
 * 此处兼容读取：后端补齐该字段后自动启用背景图；未配置/缺失时走品牌渐变兜底。
 */
export function resolvePosterBgUrl(campaign: RecruitCampaignDetailResponse | null): string {
  const url = (campaign as { poster_bg_url?: string | null } | null)?.poster_bg_url;
  return resolveAssetUrl(url);
}
