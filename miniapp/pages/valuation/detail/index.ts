/**
 * 「评估详情」页.
 *
 * ⚠️ 未覆盖：后端多角色用户微信登录仅签发 admin 令牌，无法访问 /public/leads/{id}（需 C 端
 * aud=c 令牌）；内部员工本轮在端内无法查看该页，页面按 aud 识别并展示内部限定态，
 * 而非误判为「登录已失效」清空登录态。
 */
import type { components } from "../../../types/api-types";
import { request } from "../../../utils/request";
import { getTokenAud } from "../../../utils/token";
import { resolveAssetUrl } from "../../../utils/url";
import {
  followupMethodLabel,
  formatDate,
  sliceFollowups,
} from "../../../utils/valuation-display";

type LeadDetail = components["schemas"]["PublicLeadDetail"];
type Followup = components["schemas"]["PublicFollowupItem"];

/** 跟进记录每批展示条数. */
const FOLLOWUP_PAGE_SIZE = 5;

/** 跟进记录展示项. */
interface DisplayFollowup {
  method: string;
  content: string;
  at: string;
}

/** 页面 data. */
interface PageData {
  leadId: string;
  loading: boolean;
  error: boolean;
  needLogin: boolean;
  forbidden: boolean;
  notFound: boolean;
  /** 内部员工（admin 令牌）无法访问 C 端接口，展示内部限定态而非登录失效. */
  internalOnly: boolean;
  // 房源信息
  community_name: string;
  layout: string;
  area: string;
  floor_display: string;
  remarks: string;
  created_at: string;
  // 户型图
  images: string[];
  // 评估价格
  evalPrice: string;
  hasEvalPrice: boolean;
  // 跟进记录（全量缓存于 allFollowups，展示用 followups 切片）
  allFollowups: DisplayFollowup[];
  followups: DisplayFollowup[];
  followupPage: number;
  hasMore: boolean;
  remaining: number;
}

/** 页面自定义方法. */
interface PageCustom {
  getToken(): string;
  clearToken(): void;
  loadDetail(): void;
  applyDetail(detail: LeadDetail): void;
  onLoadMoreFollowups(): void;
  onPreviewImage(e: WechatMiniprogram.BaseEvent): void;
  onGoLogin(): void;
  onBack(): void;
  onRetry(): void;
}

Page<PageData, PageCustom>({
  data: {
    leadId: "",
    loading: true,
    error: false,
    needLogin: false,
    forbidden: false,
    notFound: false,
    internalOnly: false,
    community_name: "",
    layout: "",
    area: "",
    floor_display: "",
    remarks: "",
    created_at: "",
    images: [],
    evalPrice: "",
    hasEvalPrice: false,
    allFollowups: [],
    followups: [],
    followupPage: 1,
    hasMore: false,
    remaining: 0,
  },

  getToken() {
    return wx.getStorageSync("access_token") as string;
  },

  clearToken() {
    wx.removeStorageSync("access_token");
    wx.removeStorageSync("refresh_token");
  },

  onLoad(query: Record<string, string | undefined>) {
    this.setData({ leadId: query.id ?? "" });
    if (!this.getToken()) {
      this.setData({ needLogin: true, loading: false });
      return;
    }
    if (getTokenAud(this.getToken()) === "admin") {
      this.setData({ internalOnly: true, loading: false });
      return;
    }
    this.loadDetail();
  },

  applyDetail(detail: LeadDetail) {
    const allFollowups = (detail.follow_ups ?? []).map((f: Followup) => ({
      method: followupMethodLabel(f.method),
      content: f.content,
      at: formatDate(f.followed_at, true),
    }));
    this.setData({
      loading: false,
      community_name: detail.community_name,
      layout: detail.layout || "",
      area: detail.area != null ? `${detail.area}㎡` : "",
      floor_display: [detail.floor_info, detail.orientation].filter(Boolean).join(" · "),
      remarks: detail.remarks || "",
      created_at: formatDate(detail.created_at, true),
      // 缩略图优先，兜底原图
      images: (
        detail.image_thumbnails && detail.image_thumbnails.length
          ? detail.image_thumbnails
          : (detail.images ?? [])
      ).map((u) => resolveAssetUrl(u)),
      evalPrice: detail.eval_price != null ? String(detail.eval_price) : "",
      hasEvalPrice: detail.eval_price != null,
      allFollowups,
      followups: sliceFollowups(allFollowups, 1, FOLLOWUP_PAGE_SIZE),
      followupPage: 1,
      hasMore: allFollowups.length > FOLLOWUP_PAGE_SIZE,
      remaining: Math.max(0, allFollowups.length - FOLLOWUP_PAGE_SIZE),
    });
  },

  async loadDetail() {
    const token = this.getToken();
    if (!token) {
      this.setData({ needLogin: true, loading: false });
      return;
    }
    if (getTokenAud(token) === "admin") {
      this.setData({ internalOnly: true, loading: false });
      return;
    }
    this.setData({ loading: true, error: false, forbidden: false, notFound: false, internalOnly: false });
    try {
      // ⚠️ admin 令牌访问本接口会命中 401/403，内部员工无法在端内查看
      const detail = await request<LeadDetail>({
        url: `/public/leads/${this.data.leadId}`,
        header: { Authorization: `Bearer ${token}` },
      });
      this.applyDetail(detail);
    } catch (err) {
      const statusCode = (err as { statusCode?: number } | undefined)?.statusCode;
      if (statusCode === 401) {
        this.clearToken();
        this.setData({ needLogin: true });
      } else if (statusCode === 403) {
        this.setData({ forbidden: true });
      } else if (statusCode === 404) {
        this.setData({ notFound: true });
      } else {
        this.setData({ error: true });
      }
    } finally {
      this.setData({ loading: false });
    }
  },

  onLoadMoreFollowups() {
    const nextPage = this.data.followupPage + 1;
    const next = sliceFollowups(this.data.allFollowups, nextPage, FOLLOWUP_PAGE_SIZE);
    if (next.length === 0) {
      return;
    }
    const merged = this.data.followups.concat(next);
    const remaining = Math.max(0, this.data.allFollowups.length - merged.length);
    this.setData({
      followupPage: nextPage,
      followups: merged,
      hasMore: remaining > 0,
      remaining,
    });
  },

  onPreviewImage(e: WechatMiniprogram.BaseEvent) {
    const current = e.currentTarget.dataset.src as string;
    wx.previewImage({ current, urls: this.data.images });
  },

  onGoLogin() {
    wx.navigateTo({ url: "/pages/test-login/index/index" });
  },

  onBack() {
    wx.navigateBack();
  },

  onRetry() {
    this.loadDetail();
  },
});