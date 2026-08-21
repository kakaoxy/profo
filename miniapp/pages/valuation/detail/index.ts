/**
 * 「评估详情」页.
 *
 * 内部员工持双令牌（admin + c_access_token）时可正常访问 C 端 /public/leads/{id}；
 * 仅当无 C 端令牌（纯 admin 用户）或令牌均失效时，展示内部限定态或登录失效态.
 */
import type { components } from "../../../types/api-types";
import { request } from "../../../utils/request";
import { getAccessToken, getCAccessToken } from "../../../utils/token";
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

/** phone-bind-modal 组件实例上需调用的方法（selectComponent 返回类型默认不含自定义方法）. */
interface PhoneBindModalInstance {
  show(): void;
  hide(): void;
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
  /** 待进入小区数据分析的小区名（未绑定手机号时暂存，绑定成功后使用）. */
  pendingCommunityName: string;
}

/** 页面自定义方法. */
interface PageCustom {
  getToken(): string;
  clearToken(): void;
  loadDetail(): void;
  applyDetail(detail: LeadDetail): void;
  onLoadMoreFollowups(): void;
  onPreviewImage(e: WechatMiniprogram.BaseEvent): void;
  onTapCommunityAnalysis(): void;
  enterCommunityAnalysis(name: string): void;
  onPhoneModalBound(): void;
  onPhoneModalGoBindAccount(): void;
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
    pendingCommunityName: "",
  },

  getToken() {
    return getAccessToken();
  },

  clearToken() {
    wx.removeStorageSync("access_token");
    wx.removeStorageSync("refresh_token");
    wx.removeStorageSync("c_access_token");
    wx.removeStorageSync("c_refresh_token");
  },

  onLoad(query: Record<string, string | undefined>) {
    this.setData({ leadId: query.id ?? "" });
    const cToken = getCAccessToken();
    const adminToken = this.getToken();
    if (!cToken && !adminToken) {
      this.setData({ needLogin: true, loading: false });
      return;
    }
    this.loadDetail();
  },

  applyDetail(detail: LeadDetail) {
    // 跟进记录：后端 /public/leads/{id} 一次返回全部 follow_ups，无分页参数（C 端场景，
    // 单条线索跟进量有限，可接受全量拉取，不做过度设计）。前端按 FOLLOWUP_PAGE_SIZE
    // 切片逐批展示（allFollowups 全量缓存，followups 展示切片，onLoadMoreFollowups 追加）.
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
    const cToken = getCAccessToken();
    const adminToken = this.getToken();
    if (!cToken && !adminToken) {
      this.setData({ needLogin: true, loading: false });
      return;
    }
    this.setData({ loading: true, error: false, forbidden: false, notFound: false, internalOnly: false });
    try {
      // 不传 header，request.ts 按 /public/* 自动注入 c_access_token 并在过期时自动刷新
      const detail = await request<LeadDetail>({
        url: `/public/leads/${this.data.leadId}`,
      });
      this.applyDetail(detail);
    } catch (err) {
      const statusCode = (err as { statusCode?: number } | undefined)?.statusCode;
      // /public/leads/{id} 要求 C 端令牌（aud=c）；401/403 时：
      // - 有 admin 令牌但 C 端令牌缺失/失效（内部员工）→ 展示内部限定态，保留有效后台登录态；
      // - 无 admin 令牌（纯 C 端用户，令牌失效）→ 清 token 并切「登录已失效」态.
      if (statusCode === 401 || statusCode === 403) {
        if (adminToken) {
          this.setData({ internalOnly: true });
        } else {
          this.clearToken();
          this.setData({ needLogin: true });
        }
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

  /**
   * 小区数据分析入口（手机号门槛）：
   * - 已绑定手机号 → 直接进入分析页；
   * - 未绑定手机号 → 暂存小区名并弹出 phone-bind-modal，绑定成功后进入；
   * - 请求失败 → 提示需登录（/public/* 自动注入 C 端令牌，失效时 request.ts 抛错）.
   */
  async onTapCommunityAnalysis() {
    const communityName = this.data.community_name;
    if (!communityName) {
      return;
    }
    try {
      const me = await request<components["schemas"]["PublicUserInfo"]>({ url: "/public/auth/me" });
      if (me.phone) {
        this.enterCommunityAnalysis(communityName);
        return;
      }
      this.setData({ pendingCommunityName: communityName });
      const modal = this.selectComponent("#phoneModal") as unknown as PhoneBindModalInstance | null;
      if (modal && typeof modal.show === "function") {
        modal.show();
      }
    } catch {
      wx.showToast({ title: "请先登录后查看", icon: "none" });
    }
  },

  /** 进入真实模式的小区数据分析页（携带小区名）. */
  enterCommunityAnalysis(name: string) {
    wx.navigateTo({
      url: "/pages/community-analysis/index/index?mode=real&community_name=" + encodeURIComponent(name),
    });
  },

  /** 手机号绑定成功：进入先前暂存（或当前）的小区分析. */
  onPhoneModalBound() {
    wx.showToast({ title: "手机号绑定成功", icon: "success" });
    const name = this.data.pendingCommunityName || this.data.community_name;
    this.enterCommunityAnalysis(name);
  },

  /** 用户在合并确认视图选「前往绑定已有账号」：跳转 bind-account 页. */
  onPhoneModalGoBindAccount() {
    wx.navigateTo({ url: "/pages/bind-account/index/index" });
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