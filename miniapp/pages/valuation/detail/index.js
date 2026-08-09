/**
 * 「评估详情」页.
 *
 * ⚠️ 未覆盖：后端多角色用户微信登录仅签发 admin 令牌，无法访问 /public/leads/{id}（需 C 端
 * aud=c 令牌）；内部员工本轮在端内无法查看该页，401 时按「登录已失效」处理。
 */
var request = require("../../../utils/request").request;
var resolveAssetUrl = require("../../../utils/url").resolveAssetUrl;
var display = require("../../../utils/valuation-display");
var followupMethodLabel = display.followupMethodLabel;
var formatDate = display.formatDate;
var sliceFollowups = display.sliceFollowups;

/** 跟进记录每批展示条数. */
var FOLLOWUP_PAGE_SIZE = 5;

Page({
  data: {
    leadId: "",
    loading: true,
    error: false,
    needLogin: false,
    forbidden: false,
    notFound: false,
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
    return wx.getStorageSync("access_token");
  },

  clearToken() {
    wx.removeStorageSync("access_token");
    wx.removeStorageSync("refresh_token");
  },

  onLoad(query) {
    this.setData({ leadId: (query && query.id) || "" });
    if (!this.getToken()) {
      this.setData({ needLogin: true, loading: false });
      return;
    }
    this.loadDetail();
  },

  applyDetail(detail) {
    var allFollowups = (detail.follow_ups || []).map(function (f) {
      return {
        method: followupMethodLabel(f.method),
        content: f.content,
        at: formatDate(f.followed_at, true),
      };
    });
    var thumbnails =
      detail.image_thumbnails && detail.image_thumbnails.length
        ? detail.image_thumbnails
        : (detail.images || []);
    this.setData({
      loading: false,
      community_name: detail.community_name,
      layout: detail.layout || "",
      area: detail.area != null ? detail.area + "㎡" : "",
      floor_display: [detail.floor_info, detail.orientation].filter(Boolean).join(" · "),
      remarks: detail.remarks || "",
      created_at: formatDate(detail.created_at, true),
      // 缩略图优先，兜底原图
      images: thumbnails.map(function (u) {
        return resolveAssetUrl(u);
      }),
      evalPrice: detail.eval_price != null ? String(detail.eval_price) : "",
      hasEvalPrice: detail.eval_price != null,
      allFollowups: allFollowups,
      followups: sliceFollowups(allFollowups, 1, FOLLOWUP_PAGE_SIZE),
      followupPage: 1,
      hasMore: allFollowups.length > FOLLOWUP_PAGE_SIZE,
      remaining: Math.max(0, allFollowups.length - FOLLOWUP_PAGE_SIZE),
    });
  },

  async loadDetail() {
    var token = this.getToken();
    if (!token) {
      this.setData({ needLogin: true, loading: false });
      return;
    }
    this.setData({ loading: true, error: false, forbidden: false, notFound: false });
    try {
      // ⚠️ admin 令牌访问本接口会命中 401/403，内部员工无法在端内查看
      var detail = await request({
        url: "/public/leads/" + this.data.leadId,
        header: { Authorization: "Bearer " + token },
      });
      this.applyDetail(detail);
    } catch (err) {
      var statusCode = err && err.statusCode;
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
    var nextPage = this.data.followupPage + 1;
    var next = sliceFollowups(this.data.allFollowups, nextPage, FOLLOWUP_PAGE_SIZE);
    if (next.length === 0) {
      return;
    }
    var merged = this.data.followups.concat(next);
    var remaining = Math.max(0, this.data.allFollowups.length - merged.length);
    this.setData({
      followupPage: nextPage,
      followups: merged,
      hasMore: remaining > 0,
      remaining: remaining,
    });
  },

  onPreviewImage(e) {
    var current = e.currentTarget.dataset.src;
    wx.previewImage({ current: current, urls: this.data.images });
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