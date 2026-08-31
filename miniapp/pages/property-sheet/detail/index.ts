/**
 * 房源单分享 · 房源单详情页与海报预览（多房源分享 Task 7，设计稿屏 C/D）.
 *
 * 页面职责：
 * - 房源单卡片：名称「我的精选房源单」+「可分享」pill + 创建时间/共 N 套 + 分享短码 code 胶囊
 * - 杏色提示条（归因说明）+ 按 sort_order 编号的房源卡片列表
 *   （详情为员工视角：display_status=="已售" 的房源保留展示，封面加深灰角标）
 * - 海报流程（「预览海报」/「生成海报分享」统一 generatePoster）：
 *   loading → GET .../qrcode（需登录，401 引导登录）→ createSheetPosterTempFile
 *   （前 3 套封面拼版，单张加载失败占位不阻断）→ 弹层预览
 * - 保存相册：授权拒绝 → modal 引导去设置 → 自动重试；保存成功后上报
 *   share-events（share_type="poster"，静默失败）+ 关弹层 + toast 引导发朋友圈
 *
 * 保存未直接复用 utils/recruit-poster-render.ts 的 savePosterToAlbum：该工具不返回
 * 成功态（内部吞错并自行 toast），无法满足 spec「保存成功后上报 share-events +
 * 自定义引导文案」；故在页面内以同款交互（授权拒绝 → modal → 设置 → 自动重试）
 * 实现保存流程并暴露成功/失败结果。
 */
import type { components } from "../../../types/api-types";
import { request } from "../../../utils/request";
import type { HttpResponseError } from "../../../utils/request";
import { formatLeadTime } from "../../../utils/recruit-logic";
import { resolveImageUrl } from "../../../utils/url";
import { createSheetPosterTempFile } from "../../../utils/property-sheet-poster-render";

type PropertySheetResponse = components["schemas"]["PropertySheetResponse"];
type PropertySheetItemResponse = components["schemas"]["PropertySheetItemResponse"];
type PropertySheetQRCodeResponse = components["schemas"]["PropertySheetQRCodeResponse"];
type PropertySheetShareEventRequest = components["schemas"]["PropertySheetShareEventRequest"];

/** 未登录/令牌失效（qrcode 接口 401）：提示先登录，不清登录态. */
const HTTP_UNAUTHORIZED = 401;

/** 房源卡片列表展示结构（wxml 渲染用）. */
interface SheetItemDisplay {
  /** 房源 ID（列表 key，本页不做跳转仅展示）. */
  projectId: number;
  /** 展示封面（cover_thumbnail_url 降级 cover_image，经 resolveImageUrl 解析）. */
  cover: string;
  /** 海报用封面原始 URL（cover_thumbnail_url 降级 cover_image；渲染工具内部解析）. */
  posterCover: string;
  title: string;
  /** 副行：小区 · 户型 · 面积. */
  meta: string;
  /** 总价（万元）. */
  totalPrice: string;
  /** display_status=="已售"（封面深灰角标）. */
  sold: boolean;
}

interface PageData {
  loading: boolean;
  error: boolean;
  /** 房源单不存在/已删除/参数非法：统一空态兜底. */
  notFound: boolean;
  sheetId: number;
  /** 8 位分享短码. */
  code: string;
  /** 创建时间（相对格式：今天/昨天/MM-DD HH:mm）. */
  createdText: string;
  /** 明细套数（items 实际数量，驱动海报副标题/提示条/弹层文案）. */
  itemCount: number;
  items: SheetItemDisplay[];
  /** 海报生成中（防重入）. */
  generating: boolean;
  /** 海报预览弹层是否展示. */
  posterVisible: boolean;
  /** 海报导出的临时文件路径（弹层预览 + 保存相册共用）. */
  posterImagePath: string;
  /** 保存相册进行中（防重复点击）. */
  savingPoster: boolean;
}

interface PageCustom {
  loadDetail(): Promise<void>;
  toDisplay(item: PropertySheetItemResponse): SheetItemDisplay;
  onRetry(): void;
  onBack(): void;
  onPreviewPoster(): void;
  onSharePoster(): void;
  generatePoster(): Promise<void>;
  onPosterClose(): void;
  onPosterSave(): Promise<void>;
  reportShareEvent(): void;
  noop(): void;
}

/** 从错误响应体提取后端 message（{"code":≠0,"message":"..."}），无则返回空串. */
function extractErrorMessage(err: unknown): string {
  const body = (err as HttpResponseError | undefined)?.body;
  if (body && typeof body === "object" && "message" in body) {
    const message = (body as { message?: unknown }).message;
    if (typeof message === "string" && message) {
      return message;
    }
  }
  return "";
}

/** 保存图片到相册（Promise 化）. */
function saveImageToAlbum(filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    wx.saveImageToPhotosAlbum({ filePath, success: () => resolve(), fail: reject });
  });
}

/** 是否相册权限拒绝类错误（与 utils/recruit-poster-render.ts 同口径）. */
function isAlbumAuthDenied(err: unknown): boolean {
  return /auth\s*den|authorize/i.test((err as { errMsg?: string })?.errMsg || "");
}

/** 相册权限拒绝引导 modal：返回是否确认「去设置」. */
function showAlbumAuthModal(): Promise<boolean> {
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

/**
 * 保存海报到相册完整流程（返回是否最终保存成功）：
 * 直接保存 → 权限拒绝时弹 modal 引导去设置 → 开启后自动重试一次；
 * 非权限类失败/用户取消 → toast 或静默后返回 false（可重试）.
 */
async function savePosterWithResult(filePath: string): Promise<boolean> {
  try {
    await saveImageToAlbum(filePath);
    return true;
  } catch (err) {
    if (!isAlbumAuthDenied(err)) {
      wx.showToast({ title: "保存失败，请重试", icon: "none" });
      return false;
    }
    const goSetting = await showAlbumAuthModal();
    if (!goSetting) {
      return false;
    }
    const granted = await openAlbumSetting();
    if (!granted) {
      return false;
    }
    try {
      await saveImageToAlbum(filePath);
      return true;
    } catch {
      wx.showToast({ title: "保存失败，请重试", icon: "none" });
      return false;
    }
  }
}

Page<PageData, PageCustom>({
  data: {
    loading: false,
    error: false,
    notFound: false,
    sheetId: 0,
    code: "",
    createdText: "",
    itemCount: 0,
    items: [],
    generating: false,
    posterVisible: false,
    posterImagePath: "",
    savingPoster: false,
  },

  onLoad(options: Record<string, string | undefined>) {
    const sheetId = Number(options.sheet_id);
    if (!Number.isInteger(sheetId) || sheetId <= 0) {
      // sheet_id 缺失或非法：空态兜底（从我的房源单/创建页进入均会携带）
      this.setData({ notFound: true });
      return;
    }
    this.setData({ sheetId });
    this.loadDetail();
  },

  /** 加载房源单详情（免登录公开接口，request 默认即可）；404 走空态兜底. */
  async loadDetail() {
    const { sheetId } = this.data;
    if (!sheetId) {
      this.setData({ notFound: true, loading: false });
      return;
    }
    this.setData({ loading: true, error: false, notFound: false });
    try {
      const sheet = await request<PropertySheetResponse>({
        url: `/public/property-sheets/${sheetId}`,
      });
      const items = sheet.items || [];
      this.setData({
        loading: false,
        code: sheet.code,
        createdText: formatLeadTime(sheet.created_at),
        itemCount: items.length,
        items: items.map((it) => this.toDisplay(it)),
      });
    } catch (err) {
      const statusCode = (err as HttpResponseError).statusCode;
      if (statusCode === 404) {
        // 已删除（软删归档）或不属于该 id：统一空态
        this.setData({ notFound: true, loading: false });
        return;
      }
      this.setData({ error: true, loading: false });
    }
  },

  /** 明细项 → 展示结构（封面解析 / 副行拼接 / 已售标记）. */
  toDisplay(item: PropertySheetItemResponse): SheetItemDisplay {
    const metaParts: string[] = [];
    if (item.community_name) {
      metaParts.push(item.community_name);
    }
    metaParts.push(item.layout, `${item.area}㎡`);
    const rawCover = item.cover_thumbnail_url || item.cover_image || "";
    return {
      projectId: item.marketing_project_id,
      cover: resolveImageUrl(rawCover),
      posterCover: rawCover,
      title: item.title,
      meta: metaParts.join(" · "),
      totalPrice: String(item.total_price),
      sold: item.display_status === "已售",
    };
  },

  onRetry() {
    this.loadDetail();
  },

  /** 空态「返回」：正常流有上级页（我的房源单/创建页），直达场景回我的 tab. */
  onBack() {
    wx.navigateBack({
      fail: () => wx.switchTab({ url: "/pages/profile/index/index" }),
    });
  },

  /** 底栏「预览海报」：与「生成海报分享」同流程. */
  onPreviewPoster() {
    this.generatePoster();
  },

  /** 底栏「生成海报分享」（墨色主 CTA）：同流程. */
  onSharePoster() {
    this.generatePoster();
  },

  /**
   * 海报生成：获取小程序码 → canvas 绘制导出临时文件 → 弹层预览.
   * - qrcode 401（未登录/C 端令牌失效）：toast 引导登录并停止；
   * - qrcode 其他失败：toast 后端 message（失败可重试）；
   * - 绘制/导出失败（封面占位不阻断，码图/画布/导出失败才抛错）：toast 重试.
   */
  async generatePoster() {
    const { sheetId, itemCount, items, generating } = this.data;
    if (!sheetId || generating) {
      return;
    }
    if (itemCount === 0) {
      wx.showToast({ title: "房源单暂无可展示房源", icon: "none" });
      return;
    }
    this.setData({ generating: true });
    wx.showLoading({ title: "生成中…", mask: true });
    let qrcode: PropertySheetQRCodeResponse;
    try {
      qrcode = await request<PropertySheetQRCodeResponse>({
        url: `/public/property-sheets/${sheetId}/qrcode`,
      });
    } catch (err) {
      this.setData({ generating: false });
      wx.hideLoading();
      const statusCode = (err as HttpResponseError).statusCode;
      if (statusCode === HTTP_UNAUTHORIZED) {
        wx.showToast({ title: "请先登录后生成海报", icon: "none" });
        return;
      }
      wx.showToast({ title: extractErrorMessage(err) || "获取小程序码失败，请重试", icon: "none" });
      return;
    }
    try {
      // 前 3 套封面（缩略图优先，降级原图；原始 URL 传入，渲染工具内部解析与失败占位）
      const posterImagePath = await createSheetPosterTempFile(this, {
        count: itemCount,
        covers: items.slice(0, 3).map((it) => it.posterCover),
        qrcodeBase64: qrcode.image_base64,
      });
      this.setData({ posterImagePath, posterVisible: true, generating: false });
      wx.hideLoading();
    } catch {
      this.setData({ generating: false });
      wx.hideLoading();
      wx.showToast({ title: "海报生成失败，请重试", icon: "none" });
    }
  },

  /** 海报弹层「保存图片」：成功后上报 share-events + 关弹层 + 引导发朋友圈. */
  async onPosterSave() {
    const { posterImagePath, savingPoster } = this.data;
    if (!posterImagePath || savingPoster) {
      return;
    }
    this.setData({ savingPoster: true });
    const saved = await savePosterWithResult(posterImagePath);
    this.setData({ savingPoster: false });
    if (!saved) {
      return;
    }
    // 保存成功才上报（统计口径 = 实际保存），失败静默不阻断
    this.reportShareEvent();
    this.setData({ posterVisible: false });
    wx.showToast({ title: "已保存相册，请在朋友圈发布", icon: "none", duration: 3000 });
  },

  /** 上报海报分享事件（employee_id 服务端取当前用户），失败静默. */
  reportShareEvent() {
    const { sheetId } = this.data;
    if (!sheetId) {
      return;
    }
    const body: PropertySheetShareEventRequest = { share_type: "poster" };
    request<unknown>({
      url: `/public/property-sheets/${sheetId}/share-events`,
      method: "POST",
      data: body,
    }).catch(() => {
      // 静默失败：统计口径尽力而为
    });
  },

  /** 关闭海报预览弹层（点遮罩/取消）. */
  onPosterClose() {
    this.setData({ posterVisible: false });
  },

  /** 阻止海报弹层内容区冒泡（遮罩点击关闭）. */
  noop() {
    // 空实现：仅承接 catchtap
  },
});
