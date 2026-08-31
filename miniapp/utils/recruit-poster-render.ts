/**
 * 区域伙伴招募计划 · 海报绘制与保存（招募计划二期 X-4）.
 *
 * 薄绘制层：canvas 2d 编排（取码 → 查 canvas 节点 → 加载图片 → 按布局落笔 → 导出临时文件）
 * 与保存相册（权限拒绝 → modal 引导去设置 → 开启后自动重试）。
 * 布局/坐标/文案截断等纯函数见 utils/recruit-poster.ts。
 */

import type { components } from "../types/api-types";
import { request } from "./request";
import {
  buildPosterLayout,
  computeCoverSourceRect,
  POSTER_HEIGHT,
  POSTER_WIDTH,
  resolvePosterBgUrl,
  toQrcodeDataUri,
} from "./recruit-poster";
import type { PosterLayout, PosterRect } from "./recruit-poster";

type RecruitCampaignDetailResponse = components["schemas"]["RecruitCampaignDetailResponse"];
type RecruitQRCodeResponse = components["schemas"]["RecruitQRCodeResponse"];

/** canvas createImage 返回的图片对象（结构类型，避免依赖 DOM lib）. */
type CanvasImage = ReturnType<WechatMiniprogram.Canvas["createImage"]>;

/** 微信 canvas 2d 上下文（区别于 DOM lib 全局 CanvasRenderingContext2D）. */
type PosterContext2D = WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D;

/** 页面/组件上下文（仅需 createSelectorQuery，Page 实例结构满足）. */
export interface PosterCanvasPageContext {
  createSelectorQuery(): WechatMiniprogram.SelectorQuery;
}

/** 绘制所需图片集合. */
export interface PosterImages {
  bg: CanvasImage | null;
  bgWidth: number;
  bgHeight: number;
  qr: CanvasImage | null;
}

function roundRectPath(ctx: PosterContext2D, rect: PosterRect): void {
  const { x, y, w, h, r } = rect;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 按布局落笔（绘制器不含任何布局计算，布局由纯函数单测覆盖）. */
export function drawPoster(
  ctx: PosterContext2D,
  layout: PosterLayout,
  images: PosterImages,
): void {
  const { width: w, height: h } = layout;
  ctx.clearRect(0, 0, w, h);
  // 背景：图 cover / 品牌渐变
  if (layout.background.kind === "image" && images.bg && images.bgWidth > 0) {
    const r = computeCoverSourceRect(images.bgWidth, images.bgHeight, w, h);
    ctx.drawImage(images.bg, r.sx, r.sy, r.sw, r.sh, 0, 0, w, h);
  } else {
    const gradient = ctx.createLinearGradient(0, 0, w, h);
    if (layout.background.kind === "gradient") {
      for (const stop of layout.background.stops) {
        gradient.addColorStop(stop.offset, stop.color);
      }
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  }
  // 装饰圆
  for (const c of layout.circles) {
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.arc(c.cx, c.cy, c.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  // 标签 pill + 文本
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  roundRectPath(ctx, layout.tag.rect);
  ctx.fill();
  ctx.fillStyle = layout.tag.text.color;
  ctx.font = layout.tag.text.font;
  ctx.fillText(layout.tag.text.text, layout.tag.text.x, layout.tag.text.y);
  // 标题行
  for (const line of layout.titleLines) {
    ctx.fillStyle = line.color;
    ctx.font = line.font;
    ctx.fillText(line.text, line.x, line.y);
  }
  // 分隔条
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  roundRectPath(ctx, layout.divider);
  ctx.fill();
  // 引导文案
  ctx.fillStyle = layout.lead.color;
  ctx.font = layout.lead.font;
  ctx.fillText(layout.lead.text, layout.lead.x, layout.lead.y);
  // 底部白卡 + 小程序码 + 文案
  ctx.fillStyle = "#ffffff";
  roundRectPath(ctx, layout.card);
  ctx.fill();
  if (images.qr) {
    ctx.drawImage(images.qr, layout.qr.x, layout.qr.y, layout.qr.size, layout.qr.size);
  }
  ctx.fillStyle = layout.qrTitle.color;
  ctx.font = layout.qrTitle.font;
  ctx.fillText(layout.qrTitle.text, layout.qrTitle.x, layout.qrTitle.y);
  ctx.fillStyle = layout.qrSub.color;
  ctx.font = layout.qrSub.font;
  ctx.fillText(layout.qrSub.text, layout.qrSub.x, layout.qrSub.y);
}

function queryPosterCanvas(page: PosterCanvasPageContext): Promise<WechatMiniprogram.Canvas> {
  return new Promise((resolve, reject) => {
    page.createSelectorQuery()
      .select("#posterCanvas")
      .fields({ node: true }, (res) => {
        const node = (res as { node?: WechatMiniprogram.Canvas } | undefined)?.node;
        if (node) {
          resolve(node);
        } else {
          reject(new Error("poster canvas not found"));
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

/**
 * 生成海报并导出临时文件路径.
 * 流程：取员工专属小程序码 → 查 canvas 节点 → 加载背景图（失败降级渐变）与小程序码
 * → 组装布局并绘制 → canvasToTempFilePath 导出。
 * @throws 小程序码接口失败 / canvas 节点缺失 / 小程序码图加载失败 / 导出失败
 */
export async function createPosterTempFile(
  page: PosterCanvasPageContext,
  campaignId: string,
  campaign: RecruitCampaignDetailResponse,
): Promise<string> {
  const qr = await request<RecruitQRCodeResponse>({
    url: `/public/recruit/campaigns/${campaignId}/qrcode`,
  });
  const canvas = await queryPosterCanvas(page);
  canvas.width = POSTER_WIDTH;
  canvas.height = POSTER_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("poster canvas 2d context unavailable");
  }
  // 背景图：未配置或下载失败 → 渐变兜底
  let bg: CanvasImage | null = null;
  let bgWidth = 0;
  let bgHeight = 0;
  const bgUrl = resolvePosterBgUrl(campaign);
  if (bgUrl) {
    try {
      const info = await getImageInfo(bgUrl);
      bg = await loadImage(canvas, info.path);
      bgWidth = info.width;
      bgHeight = info.height;
    } catch {
      bg = null;
    }
  }
  const qrImage = await loadImage(canvas, toQrcodeDataUri(qr.image_base64));
  const layout = buildPosterLayout({ title: campaign.title, bgUrl: bg ? bgUrl : "" });
  drawPoster(ctx, layout, { bg, bgWidth, bgHeight, qr: qrImage });
  return canvasToTempFile(canvas);
}

/** 保存失败提示. */
function toastSaveFail(): void {
  wx.showToast({ title: "保存失败，请重试", icon: "none" });
}

/** 保存成功提示（设计稿步骤 3a）. */
function toastSaved(): void {
  wx.showToast({ title: "已保存到相册", icon: "success" });
}

function saveImageToAlbum(filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    wx.saveImageToPhotosAlbum({ filePath, success: () => resolve(), fail: reject });
  });
}

/** 权限拒绝引导 modal（设计稿步骤 3b）：返回是否确认「去设置」. */
function showPosterAuthModal(): Promise<boolean> {
  return new Promise((resolve) => {
    wx.showModal({
      title: "无法保存到相册",
      content: "您已拒绝「相册」授权，保存海报需要相册写入权限。请在设置中开启后重试。",
      confirmText: "去设置",
      cancelText: "取消",
      success: (res) => resolve(!!res.confirm),
      fail: () => resolve(false),
    });
  });
}

/** 打开设置页，返回相册写入权限是否已开启. */
function openAlbumSetting(): Promise<boolean> {
  return new Promise((resolve) => {
    wx.openSetting({
      success: (res) => resolve(!!res.authSetting["scope.writePhotosAlbum"]),
      fail: () => resolve(false),
    });
  });
}

/** 是否相册权限拒绝类错误. */
function isAlbumAuthDenied(err: unknown): boolean {
  return /auth\s*den|authorize/i.test((err as { errMsg?: string })?.errMsg || "");
}

/**
 * 保存海报到相册（成功 toast「已保存到相册」）.
 * 权限拒绝时弹「无法保存到相册」modal →「去设置」开启后自动重试保存。
 */
export async function savePosterToAlbum(filePath: string): Promise<void> {
  try {
    await saveImageToAlbum(filePath);
    toastSaved();
    return;
  } catch (err) {
    if (!isAlbumAuthDenied(err)) {
      toastSaveFail();
      return;
    }
    const goSetting = await showPosterAuthModal();
    if (!goSetting) {
      return;
    }
    const granted = await openAlbumSetting();
    if (!granted) {
      return;
    }
    try {
      await saveImageToAlbum(filePath);
      toastSaved();
    } catch {
      toastSaveFail();
    }
  }
}
