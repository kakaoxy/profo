// 与 index.ts 逻辑完全一致（去掉类型注解），改动需同步两侧
import { request } from "../../../utils/request";
import { getAccessToken, getCAccessToken } from "../../../utils/token";
import { resolveAssetUrl } from "../../../utils/url";
import { followupMethodLabel, formatDate, sliceFollowups } from "../../../utils/valuation-display";

const FOLLOWUP_PAGE_SIZE = 5;

Page({
  data: {
    leadId: "",
    loading: true,
    error: false,
    needLogin: false,
    forbidden: false,
    notFound: false,
    // 有 admin 令牌但 C 端令牌缺失/失效（内部员工）时展示内部限定态，而非登录失效
    internalOnly: false,
    // 房源信息
    community_name: "",
    layout: "",
    area: "",
    floor_display: "",
    remarks: "",
    created_at: "",
    // 户型图
    images: [],
    // 评估价格
    evalPrice: "",
    hasEvalPrice: false,
    // 跟进记录（全量缓存于 allFollowups，展示用 followups 切片）
    allFollowups: [],
    followups: [],
    followupPage: 1,
    hasMore: false,
    remaining: 0,
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

  onLoad(query) {
    this.setData({ leadId: (query && query.id) || "" });
    const cToken = getCAccessToken();
    const adminToken = this.getToken();
    if (!cToken && !adminToken) {
      this.setData({ needLogin: true, loading: false });
      return;
    }
    this.loadDetail();
  },

  applyDetail(detail) {
    const allFollowups = (detail.follow_ups || []).map((f) => ({
      method: followupMethodLabel(f.method),
      content: f.content,
      at: formatDate(f.followed_at, true),
    }));
    const thumbnails =
      detail.image_thumbnails && detail.image_thumbnails.length
        ? detail.image_thumbnails
        : (detail.images || []);
    this.setData({
      loading: false,
      community_name: detail.community_name,
      layout: detail.layout || "",
      area: detail.area != null ? `${detail.area}㎡` : "",
      floor_display: [detail.floor_info, detail.orientation].filter(Boolean).join(" · "),
      remarks: detail.remarks || "",
      created_at: formatDate(detail.created_at, true),
      // 缩略图优先，兜底原图
      images: thumbnails.map((u) => resolveAssetUrl(u)),
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
      const detail = await request({
        url: `/public/leads/${this.data.leadId}`,
      });
      this.applyDetail(detail);
    } catch (err) {
      const statusCode = err && err.statusCode;
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
    const merged = [...this.data.followups, ...next];
    const remaining = Math.max(0, this.data.allFollowups.length - merged.length);
    this.setData({
      followupPage: nextPage,
      followups: merged,
      hasMore: remaining > 0,
      remaining,
    });
  },

  onPreviewImage(e) {
    const current = e.currentTarget.dataset.src;
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
