/**
 * 房源单分享 · 综合海报绘制与导出（多房源分享 Task 5）.
 *
 * 薄绘制层：canvas 2d 编排（查 canvas 节点 → 并行加载封面 → 加载小程序码 → 按布局落笔
 * → 导出临时文件）。布局/坐标/拼版等纯函数见 utils/property-sheet-poster.ts；
 * 文本测宽/cover 裁剪/二维码 data URI 复用 utils/recruit-poster.ts，保存相册直接
 * 复用 utils/recruit-poster-render.ts 的 savePosterToAlbum（此处 re-export）。
 */

import { resolveAssetUrl } from "./url";
import {
  computeCoverSourceRect,
  toQrcodeDataUri,
} from "./recruit-poster";
import { buildSheetPosterLayout, SHEET_POSTER_HEIGHT, SHEET_POSTER_WIDTH } from "./property-sheet-poster";
import type { SheetPosterLayout, SheetPosterRect, SheetPosterText } from "./property-sheet-poster";
import { savePosterToAlbum } from "./recruit-poster-render";
import type { PosterCanvasPageContext } from "./recruit-poster-render";

export { savePosterToAlbum };
export type { PosterCanvasPageContext };

/** canvas createImage 返回的图片对象（结构类型，避免依赖 DOM lib）. */
type CanvasImage = ReturnType<WechatMiniprogram.Canvas["createImage"]>;

/** 微信 canvas 2d 上下文（区别于 DOM lib 全局 CanvasRenderingContext2D）. */
type SheetPosterContext2D = WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D;

/** 已加载成功的单张封面（含原始尺寸，供 cover 裁剪）. */
export interface SheetPosterCoverImage {
  image: CanvasImage;
  width: number;
  height: number;
}

/** 绘制所需图片集合（封面加载失败的位置为 null，绘制 Fog 占位块）. */
export interface SheetPosterImages {
  covers: (SheetPosterCoverImage | null)[];
  qr: CanvasImage | null;
}

/** createSheetPosterTempFile 入参. */
export interface SheetPosterRenderOptions {
  /** 房源单实际套数（可能 >3，驱动副标题与「更多扫码」提示条）. */
  count: number;
  /** 封面 URL 列表（cover_thumbnail_url 优先；最多取前 3 张，单张失败跳过不阻断）. */
  covers: string[];
  /** 小程序码 base64（接口返回的 image_base64）. */
  qrcodeBase64: string;
}

/** 占位底色（设计稿 Fog，封面缺失时）. */
const COLOR_FOG = "#f7f7f8";

function roundRectPath(ctx: SheetPosterContext2D, rect: SheetPosterRect): void {
  const { x, y, w, h } = rect;
  const r = Math.max(0, rect.r);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawText(ctx: SheetPosterContext2D, t: SheetPosterText): void {
  ctx.textAlign = t.align ?? "left";
  ctx.fillStyle = t.color;
  ctx.font = t.font;
  ctx.fillText(t.text, t.x, t.y);
}

/** 按布局落笔（绘制器不含任何布局计算，布局由纯函数单测覆盖）. */
export function drawSheetPoster(
  ctx: SheetPosterContext2D,
  layout: SheetPosterLayout,
  images: SheetPosterImages,
): void {
  ctx.clearRect(0, 0, layout.width, layout.height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, layout.width, layout.height);
  ctx.textBaseline = "top";
  // 标题区：杏色径向暖光晕 + 装饰环（均裁剪到标题区，避免渗入图片区）
  ctx.save();
  roundRectPath(ctx, layout.head.rect);
  ctx.clip();
  const glow = ctx.createRadialGradient(
    layout.head.glow.cx,
    layout.head.glow.cy,
    0,
    layout.head.glow.cx,
    layout.head.glow.cy,
    layout.head.glow.r,
  );
  for (const stop of layout.head.glow.stops) {
    glow.addColorStop(stop.offset, stop.color);
  }
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(layout.head.glow.cx, layout.head.glow.cy, layout.head.glow.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = layout.head.ring.color;
  ctx.lineWidth = layout.head.ring.lineWidth;
  ctx.beginPath();
  ctx.arc(layout.head.ring.cx, layout.head.ring.cy, layout.head.ring.r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  // 「精选好房」胶囊
  ctx.fillStyle = "#5d2a1a";
  roundRectPath(ctx, layout.head.pill.rect);
  ctx.fill();
  drawText(ctx, layout.head.pill.text);
  // 主标题（衬线）+ 副标题
  for (const line of layout.head.titleLines) {
    drawText(ctx, line);
  }
  drawText(ctx, layout.head.subtitle);
  // 图片拼版：cover 裁剪，缺失画 Fog 占位块（不阻断）
  layout.images.forEach((slot, i) => {
    const cover = images.covers[i];
    ctx.save();
    roundRectPath(ctx, slot);
    ctx.clip();
    if (cover) {
      const src = computeCoverSourceRect(cover.width, cover.height, slot.w, slot.h);
      ctx.drawImage(cover.image, src.sx, src.sy, src.sw, src.sh, slot.x, slot.y, slot.w, slot.h);
    } else {
      ctx.fillStyle = COLOR_FOG;
      ctx.fillRect(slot.x, slot.y, slot.w, slot.h);
    }
    ctx.restore();
  });
  // 「更多扫码」提示条（仅 >3 套）
  if (layout.moreStrip) {
    ctx.fillStyle = "#fbe1d1";
    roundRectPath(ctx, layout.moreStrip.rect);
    ctx.fill();
    drawText(ctx, layout.moreStrip.text);
  }
  // 品牌信息区：Rust 圆点 + 主行 + 副行
  ctx.fillStyle = layout.brand.dot.color;
  ctx.beginPath();
  ctx.arc(layout.brand.dot.cx, layout.brand.dot.cy, layout.brand.dot.r, 0, Math.PI * 2);
  ctx.fill();
  drawText(ctx, layout.brand.main);
  drawText(ctx, layout.brand.sub);
  // 小程序码 + 配文
  if (images.qr) {
    ctx.drawImage(images.qr, layout.qr.x, layout.qr.y, layout.qr.size, layout.qr.size);
  }
  drawText(ctx, layout.qr.caption);
}

function querySheetPosterCanvas(page: PosterCanvasPageContext): Promise<WechatMiniprogram.Canvas> {
  return new Promise((resolve, reject) => {
    page.createSelectorQuery()
      .select("#sheetPosterCanvas")
      .fields({ node: true }, (res) => {
        const node = (res as { node?: WechatMiniprogram.Canvas } | undefined)?.node;
        if (node) {
          resolve(node);
        } else {
          reject(new Error("sheet poster canvas not found"));
        }
      })
      .exec();
  });
}

function loadImage(canvas: WechatMiniprogram.Canvas, src: string): Promise<CanvasImage> {
  return new Promise((resolve, reject) => {
    const img = canvas.createImage();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image load failed: ${src.slice(0, 32)}`));
    img.src = src;
  });
}

function getImageInfo(src: string): Promise<WechatMiniprogram.GetImageInfoSuccessCallbackResult> {
  return new Promise((resolve, reject) => {
    wx.getImageInfo({ src, success: resolve, fail: reject });
  });
}

function canvasToTempFile(canvas: WechatMiniprogram.Canvas): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.canvasToTempFilePath({
      canvas: canvas as unknown as WechatMiniprogram.IAnyObject,
      fileType: "png",
      success: (res) => resolve(res.tempFilePath),
      fail: reject,
    });
  });
}

/** 加载单张封面：URL 解析 → getImageInfo → createImage；任一步失败返回 null（占位跳过）. */
async function loadCover(
  canvas: WechatMiniprogram.Canvas,
  url: string,
): Promise<SheetPosterCoverImage | null> {
  const full = resolveAssetUrl(url);
  if (!full) {
    return null;
  }
  try {
    const info = await getImageInfo(full);
    const image = await loadImage(canvas, info.path);
    return { image, width: info.width, height: info.height };
  } catch {
    return null;
  }
}

/**
 * 生成综合海报并导出临时文件路径.
 * 流程：查 canvas 节点（#sheetPosterCanvas）→ 设 600×960 → 并行加载前 3 张封面
 * （URL 先经 resolveAssetUrl 解析，单张失败跳过用占位底色）→ 小程序码 base64 转
 * data URI 加载（失败整体抛错）→ 组装布局并绘制 → canvasToTempFilePath 导出。
 * @throws canvas 节点缺失 / 小程序码加载失败 / 导出失败
 */
export async function createSheetPosterTempFile(
  page: PosterCanvasPageContext,
  opts: SheetPosterRenderOptions,
): Promise<string> {
  const canvas = await querySheetPosterCanvas(page);
  canvas.width = SHEET_POSTER_WIDTH;
  canvas.height = SHEET_POSTER_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("sheet poster canvas 2d context unavailable");
  }
  // 封面并行加载（Promise.all 保序，失败项为 null → 占位块）
  const covers = await Promise.all(
    opts.covers.slice(0, 3).map((url) => loadCover(canvas, url)),
  );
  const qr = await loadImage(canvas, toQrcodeDataUri(opts.qrcodeBase64));
  const layout = buildSheetPosterLayout({ count: opts.count });
  drawSheetPoster(ctx, layout, { covers, qr });
  return canvasToTempFile(canvas);
}
