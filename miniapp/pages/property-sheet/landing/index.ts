/**
 * 房源单分享 · 客户扫码落地聚合页（小程序码 page 目标）.
 *
 * 页面职责：
 * - 短码解析：onLoad scene（"code=xxx" 键值对，复用 parseSceneCode）→
 *   GET /public/property-sheets/qr/{code} 换 {sheet_id, referrer}；
 *   开发调试兼容无 scene 时以 query 参数 code 直连；两者皆无或解析失败
 *   （无效码/已失效）统一占位错误态，不暴露细节差异
 * - 访问埋点：解析成功立即上报 visit-events（visitor_id + referrer +
 *   source=poster，免登录，fire-and-forget 静默失败）
 * - 聚合展示：详情与分享人联系卡并行加载（消除请求瀑布）；hero 杏色光晕
 *   暖卡 + 联系卡（is_referrer 显示「分享人」角标）+ 房源卡片列表
 *   （在售/已售角标，点击携带 referrer/source 跳单房源详情延续归因）
 * - 转化承接：底栏「咨询分享人」滚动定位联系卡 +「我想卖房 · 免费估价」
 *   switchTab 估价页
 */
import type { components } from "../../../types/api-types";
import { request, type HttpResponseError } from "../../../utils/request";
import { parseSceneCode } from "../../../utils/recruit-logic";
import { resolveAssetUrl, resolveImageUrl } from "../../../utils/url";
import { getVisitorId } from "../../../utils/visitor";

type PropertySheetQRSceneResponse = components["schemas"]["PropertySheetQRSceneResponse"];
type PropertySheetResponse = components["schemas"]["PropertySheetResponse"];
type PropertySheetItemResponse = components["schemas"]["PropertySheetItemResponse"];
type PublicConsultantContact = components["schemas"]["PublicConsultantContact"];
type PropertySheetVisitEventRequest = components["schemas"]["PropertySheetVisitEventRequest"];
type PublicTrackingEventResponse = components["schemas"]["PublicTrackingEventResponse"];

/** 房源卡片 wxml 渲染结构（列表不做复杂表达式，ts 侧预组装）. */
interface SheetItemDisplay {
  /** 房源 ID（跳单房源详情）. */
  id: number;
  /** 封面完整 URL（缩略图优先降级原图，OSS 处理参数已拼），空串走占位底色. */
  coverUrl: string;
  /** 展示状态是否为「已售」（角标深灰；否则杏色「在售」）. */
  isSold: boolean;
  title: string;
  /** 小区 · 户型 · 面积 拼接文案. */
  metaText: string;
  /** 总价数值文案（万元，整数省小数、最多 1 位）. */
  priceText: string;
}

interface PageData {
  loading: boolean;
  /** 详情等网络加载失败（可重试），区别于无效码/失效的 notFound 占位态. */
  error: boolean;
  /** 短码无效/房源单已失效/进入参数缺失：统一占位错误态. */
  notFound: boolean;
  /** 解析出的分享短码（重试复用）. */
  code: string;
  /** 分享归属员工 ID（qr 接口返回，空串=无效员工/无归因）. */
  referrer: string;
  items: SheetItemDisplay[];
  /** hero 主标题的 N（= 可见房源数）. */
  heroCount: number;
  contact: PublicConsultantContact | null;
  /** 顾问头像完整 URL（avatar 为空时为空串，wxml 走首字符占位）. */
  contactAvatarUrl: string;
  /** 顾问头像缺省占位字符（nickname 首字符）. */
  contactFallbackChar: string;
  /** 是否命中内部分享人（显示「分享人」Rust 角标；否则无角标）. */
  contactIsReferrer: boolean;
  /** 联系卡副文案：is_referrer「扫码进入 · 已自动关联分享人」/「官方置业顾问」. */
  contactSubText: string;
  hasPhone: boolean;
  hasWechat: boolean;
}

interface PageCustom {
  resolveScene(code: string): Promise<void>;
  loadSheet(sheetId: number): Promise<void>;
  reportVisit(sheetId: number): void;
  onRetry(): void;
  onBrowseTap(): void;
  onCallTap(): void;
  onWechatTap(): void;
  onItemTap(e: WechatMiniprogram.BaseEvent<WechatMiniprogram.IAnyObject, { id?: number }>): void;
  onContactScrollTap(): void;
  onValuationTap(): void;
}

/** 总价格式化：整数省小数，最多保留 1 位（万元）. */
function formatPrice(price: number): string {
  const rounded = Math.round(price * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** 明细项 → 展示结构：封面缩略优先、meta 拼接、状态角标. */
function toItemDisplay(item: PropertySheetItemResponse): SheetItemDisplay {
  const metaParts = [item.community_name, item.layout, `${Math.round(item.area)}㎡`];
  return {
    id: item.marketing_project_id,
    coverUrl: resolveImageUrl(item.cover_thumbnail_url || item.cover_image),
    isSold: item.display_status === "已售",
    title: item.title,
    metaText: metaParts.filter(Boolean).join(" · "),
    priceText: formatPrice(item.total_price),
  };
}

Page<PageData, PageCustom>({
  data: {
    loading: false,
    error: false,
    notFound: false,
    code: "",
    referrer: "",
    items: [],
    heroCount: 0,
    contact: null,
    contactAvatarUrl: "",
    contactFallbackChar: "",
    contactIsReferrer: false,
    contactSubText: "官方置业顾问",
    hasPhone: false,
    hasWechat: false,
  },

  onLoad(options) {
    const rawOptions = options as Record<string, string | undefined>;
    // 扫码进入：scene 为 "code=xxx" 的 URL 编码形式，先解码再提取短码
    if (rawOptions.scene) {
      const code = parseSceneCode(decodeURIComponent(rawOptions.scene));
      if (!code) {
        // scene 无 code 键（非本功能小程序码），不发起无效请求
        this.setData({ notFound: true });
        return;
      }
      this.setData({ code });
      this.resolveScene(code);
      return;
    }
    // 开发调试兼容：开发者工具以 query 参数模拟短码（无 scene）
    if (rawOptions.code) {
      this.setData({ code: rawOptions.code });
      this.resolveScene(rawOptions.code);
      return;
    }
    this.setData({ notFound: true });
  },

  /** 短码解析：换 {sheet_id, referrer}；失败（无效码/已失效）统一占位错误态. */
  async resolveScene(code: string) {
    this.setData({ loading: true, error: false, notFound: false });
    try {
      const result = await request<PropertySheetQRSceneResponse>({
        url: `/public/property-sheets/qr/${encodeURIComponent(code)}`,
        skipAuth: true,
      });
      this.setData({ referrer: result.referrer || "" });
      // 进入即上报访问埋点（免登录，fire-and-forget，失败静默）
      this.reportVisit(result.sheet_id);
      await this.loadSheet(result.sheet_id);
    } catch {
      this.setData({ loading: false, notFound: true });
    }
  },

  /**
   * 并行加载详情与分享人联系卡（referrer 存在才拼参）.
   * 详情失败：404（如并发被删）归入占位错误态，其余网络错误可重试；
   * 联系卡失败静默降级为不渲染（非页面关键内容，不阻断房源浏览）.
   */
  async loadSheet(sheetId: number) {
    this.setData({ loading: true, error: false, notFound: false });
    const { referrer } = this.data;
    try {
      const [sheet, contact] = await Promise.all([
        request<PropertySheetResponse>({
          url: `/public/property-sheets/${sheetId}`,
          skipAuth: true,
        }),
        request<PublicConsultantContact>({
          url: `/public/property-sheets/${sheetId}/consultant`,
          data: referrer ? { referrer } : undefined,
          skipAuth: true,
        }).catch(() => null),
      ]);
      const items = (sheet.items ?? []).map(toItemDisplay);
      this.setData({
        loading: false,
        items,
        heroCount: items.length,
        contact,
        contactAvatarUrl: resolveAssetUrl(contact?.avatar),
        contactFallbackChar: (contact?.nickname || "顾问").slice(0, 1),
        contactIsReferrer: contact?.is_referrer === true,
        contactSubText: contact?.is_referrer ? "扫码进入 · 已自动关联分享人" : "官方置业顾问",
        hasPhone: !!contact?.phone,
        hasWechat: !!contact?.wechat_number,
      });
    } catch (err) {
      const statusCode = (err as HttpResponseError).statusCode;
      if (statusCode === 404) {
        this.setData({ loading: false, notFound: true });
        return;
      }
      this.setData({ loading: false, error: true });
      wx.showToast({ title: "加载失败，请重试", icon: "none" });
    }
  },

  /** 上报访问埋点（visitor_id + referrer 原样透传 + source=poster），失败静默. */
  reportVisit(sheetId: number) {
    const { referrer } = this.data;
    const body: PropertySheetVisitEventRequest = {
      visitor_id: getVisitorId(),
      referrer: referrer || undefined,
      source: "poster",
    };
    request<PublicTrackingEventResponse>({
      url: `/public/property-sheets/${sheetId}/visit-events`,
      method: "POST",
      data: body,
      skipAuth: true,
    }).catch(() => {
      // 埋点失败静默，不打扰用户
    });
  },

  /** 网络错误重试：用解析出的短码走完整链路. */
  onRetry() {
    const { code } = this.data;
    if (!code) {
      return;
    }
    this.resolveScene(code);
  },

  /** 占位错误态引导按钮：去房源列表 tab 逛房源. */
  onBrowseTap() {
    wx.switchTab({ url: "/pages/projects/list/index" });
  },

  /** 电话咨询：电话为空时按钮已隐藏（防御兜底 return）. */
  onCallTap() {
    const phone = this.data.contact?.phone;
    if (!phone) {
      return;
    }
    wx.makePhoneCall({
      phoneNumber: phone,
      fail: () => {
        // 用户取消拨号静默
      },
    });
  },

  /** 微信：复制微信号 + toast 引导（为空时按钮已隐藏）. */
  onWechatTap() {
    const wechat = this.data.contact?.wechat_number;
    if (!wechat) {
      return;
    }
    wx.setClipboardData({
      data: wechat,
      success: () => {
        wx.showToast({ title: "微信号已复制", icon: "none" });
      },
    });
  },

  /** 房源卡片 → 单房源详情页：referrer 非空才携带 referrer/source 延续归因. */
  onItemTap(e: WechatMiniprogram.BaseEvent<WechatMiniprogram.IAnyObject, { id?: number }>) {
    const id = Number(e.currentTarget.dataset.id);
    if (!Number.isFinite(id) || id <= 0) {
      return;
    }
    const { referrer } = this.data;
    const suffix = referrer
      ? `&referrer=${encodeURIComponent(referrer)}&source=poster`
      : "";
    wx.navigateTo({ url: `/pages/projects/detail/index?id=${id}${suffix}` });
  },

  /** 底栏「咨询分享人」：滚动定位到联系卡. */
  onContactScrollTap() {
    wx.pageScrollTo({ selector: "#contact-card", duration: 300 });
  },

  /** 底栏主按钮：去估价页（tabBar 页 switchTab）. */
  onValuationTap() {
    wx.switchTab({ url: "/pages/valuation/submit/index" });
  },
});
