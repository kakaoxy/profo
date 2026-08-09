/**
 * 「我的评估」列表页.
 *
 * 具备 C 端身份的内部员工（后端按其 customer 身份签发 aud=c 令牌）可正常访问 C 端
 * /public/leads/mine 查看自己的评估；仅当请求返回 401（admin 令牌受众不匹配）或 403
 * （无 C 端身份）时，才展示内部限定态，而非误判为「登录已失效」清空有效登录态。
 */
var request = require("../../../utils/request").request;
var getTokenAud = require("../../../utils/token").getTokenAud;
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
    // 无 C 端身份（admin 令牌受众不匹配 / 403）时展示内部限定态，而非登录失效
    internalOnly: false,
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

  onShow() {
    var token = this.getToken();
    if (!token) {
      this.setData({ needLogin: true, loading: false, loadingMore: false });
      return;
    }
    if (this.data.items.length === 0) {
      // 首次进入 / 空态：骨架屏加载
      this.loadList(true, false);
    } else {
      // 已有数据：静默刷新（保留当前列表，避免骨架屏闪烁）。
      // 用于从「估价提交」页 navigateBack 返回时，能展示刚提交的最新估价。
      this.loadList(true, true);
    }
  },

  async loadList(reset, silent) {
    reset = reset || false;
    silent = silent || false;
    var token = this.getToken();
    if (!token) {
      this.setData({ needLogin: true, loading: false, loadingMore: false });
      return;
    }
    if (reset) {
      // silent 时不置 loading（保留当前列表，避免骨架屏闪烁）
      var patch = {
        error: false,
        noMore: false,
        needLogin: false,
        internalOnly: false,
      };
      if (!silent) {
        patch.loading = true;
      }
      this.setData(patch);
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
      // 401：令牌失效或受众不匹配，区分处理——
      // 返回 401 且为 admin 令牌（内部员工，无 C 端身份）→ 展示内部限定态而非清空有效登录态；
      // 其余（C 端令牌失效）→ 清 token 并切「登录已失效」态。
      var statusCode = err && err.statusCode;
      if (statusCode === 401) {
        if (getTokenAud(token) === "admin") {
          this.setData({ internalOnly: true, items: [], total: 0 });
        } else {
          this.clearToken();
          this.setData({ needLogin: true, items: [], total: 0 });
        }
      } else if (reset) {
        // silent 时保留旧数据，避免返回刷新失败时误清列表
        if (!silent) {
          this.setData({ error: true, items: [] });
        }
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

  async onPullDownRefresh() {
    // loadList 异步，需等其结束（含无 token 提前返回 / catch）后再停止下拉刷新，
    // 否则刷新动画会在请求完成前提前消失；silent 避免与下拉动画叠加骨架屏闪烁
    await this.loadList(true, true);
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
    // submit 页为 tabBar 页，必须用 switchTab 跳转（navigateTo 会报错）
    wx.switchTab({ url: "/pages/valuation/submit/index" });
  },

  onRetry() {
    this.loadList(true);
  },
});