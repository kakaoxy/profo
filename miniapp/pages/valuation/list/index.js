/**
 * 「我的评估」列表页.
 *
 * ⚠️ 未覆盖：后端多角色用户微信登录仅签发 admin 令牌，无法访问 /public/leads/*（需 C 端
 * aud=c 令牌）；内部员工本轮在端内无法查看「我的评估」，列表接口返回 401 时按「登录已失效」处理。
 */
var request = require("../../../utils/request").request;
var display = require("../../../utils/valuation-display");
var formatDate = display.formatDate;
var statusBadgeStyle = display.statusBadgeStyle;

var PAGE_SIZE = 10;

Page({
  data: {
    items: [],
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
    loading: false,
    loadingMore: false,
    error: false,
    noMore: false,
    // 未登录（无 access_token）
    needLogin: false,
  },

  getToken() {
    return wx.getStorageSync("access_token");
  },

  clearToken() {
    wx.removeStorageSync("access_token");
    wx.removeStorageSync("refresh_token");
  },

  toDisplay(item) {
    var layout = item.layout || "";
    var area = item.area != null ? item.area + "㎡" : "";
    var desc = [layout, area].filter(Boolean).join(" · ");
    var badge = statusBadgeStyle(item.status_color);
    return {
      id: item.id,
      community_name: item.community_name,
      desc: desc,
      date: formatDate(item.created_at),
      badgeText: item.status_display,
      badgeColor: badge.color,
      badgeBackground: badge.background,
    };
  },

  onLoad() {
    this.loadList(true);
  },

  onShow() {
    // 从登录页返回时 token 可能已补齐，重新检测；仅在处于未登录空态时加载
    if (this.data.needLogin && this.getToken()) {
      this.loadList(true);
    }
  },

  async loadList(reset) {
    reset = reset || false;
    var token = this.getToken();
    if (!token) {
      this.setData({ needLogin: true, loading: false, loadingMore: false });
      return;
    }
    if (reset) {
      this.setData({ loading: true, error: false, noMore: false, needLogin: false });
    } else {
      this.setData({ loadingMore: true });
    }
    try {
      // reset 时强制 page=1
      var page = reset ? 1 : this.data.page;
      var data = await request({
        url: "/public/leads/mine",
        data: { page: page, page_size: this.data.pageSize },
        header: { Authorization: "Bearer " + token },
      });
      var newItems = data.items.map(
        function (it) {
          return this.toDisplay(it);
        }.bind(this)
      );
      var merged = reset ? newItems : this.data.items.concat(newItems);
      this.setData({
        items: merged,
        total: data.total,
        page: page,
        noMore: merged.length >= data.total,
      });
    } catch (err) {
      // 401：令牌失效，清 token 并切「登录已失效」态
      var statusCode = err && err.statusCode;
      if (statusCode === 401) {
        this.clearToken();
        this.setData({ needLogin: true, items: [], total: 0 });
      } else if (reset) {
        this.setData({ error: true, items: [] });
      } else {
        wx.showToast({ title: "加载失败，请重试", icon: "none" });
      }
    } finally {
      this.setData({ loading: false, loadingMore: false });
    }
  },

  onReachBottom() {
    // 限流防抖：加载中或无更多直接 return
    if (this.data.loading || this.data.loadingMore || this.data.noMore) {
      return;
    }
    if (this.data.items.length >= this.data.total) {
      return;
    }
    this.setData({ page: this.data.page + 1 });
    this.loadList(false);
  },

  onPullDownRefresh() {
    this.loadList(true);
    wx.stopPullDownRefresh();
  },

  onItemTap(e) {
    var id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: "/pages/valuation/detail/index?id=" + id });
  },

  onGoLogin() {
    wx.navigateTo({ url: "/pages/test-login/index/index" });
  },

  onGoValuation() {
    wx.navigateTo({ url: "/pages/valuation/submit/index" });
  },

  onRetry() {
    this.loadList(true);
  },
});