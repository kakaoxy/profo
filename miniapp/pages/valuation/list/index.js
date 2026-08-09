// 与 index.ts 逻辑完全一致（去掉类型注解），改动需同步两侧
import { request } from "../../../utils/request";
import { getAccessToken, getCAccessToken } from "../../../utils/token";
import { formatDate, statusBadgeStyle } from "../../../utils/valuation-display";

const PAGE_SIZE = 10;

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
    // 未登录（无 access_token 且无 c_access_token）
    needLogin: false,
    // 有 admin 令牌但 C 端令牌缺失/失效（内部员工）时展示内部限定态，而非登录失效
    internalOnly: false,
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

  toDisplay(item) {
    const layout = item.layout || "";
    const area = item.area != null ? `${item.area}㎡` : "";
    const desc = [layout, area].filter(Boolean).join(" · ");
    const badge = statusBadgeStyle(item.status_color);
    return {
      id: item.id,
      community_name: item.community_name,
      desc,
      date: formatDate(item.created_at),
      badgeText: item.status_display,
      badgeColor: badge.color,
      badgeBackground: badge.background,
    };
  },

  onShow() {
    const cToken = getCAccessToken();
    const adminToken = this.getToken();
    if (!cToken && !adminToken) {
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

  async loadList(reset = false, silent = false) {
    const cToken = getCAccessToken();
    const adminToken = this.getToken();
    if (!cToken && !adminToken) {
      this.setData({ needLogin: true, loading: false, loadingMore: false });
      return;
    }
    if (reset) {
      // silent 时不置 loading（保留当前列表，避免骨架屏闪烁）
      this.setData({
        error: false,
        noMore: false,
        needLogin: false,
        internalOnly: false,
        ...(silent ? {} : { loading: true }),
      });
    } else {
      this.setData({ loadingMore: true });
    }
    try {
      // reset 时强制 page=1
      const page = reset ? 1 : this.data.page;
      const data = await request({
        url: "/public/leads/mine",
        data: { page, page_size: this.data.pageSize },
        // 不传 header，request.ts 按 /public/* 自动注入 c_access_token
      });
      const newItems = data.items.map((it) => this.toDisplay(it));
      const merged = reset ? newItems : [...this.data.items, ...newItems];
      this.setData({
        items: merged,
        total: data.total,
        page,
        noMore: merged.length >= data.total,
      });
    } catch (err) {
      const statusCode = err && err.statusCode;
      // /public/leads/mine 要求 C 端令牌（aud=c）；401（受众不匹配/令牌失效）或 403（无 C 端身份）时：
      // - 有 admin 令牌但 C 端令牌缺失/失效（内部员工）→ 展示内部限定态，保留有效后台登录态；
      // - 无 admin 令牌（纯 C 端用户，令牌失效）→ 清 token 并切「登录已失效」态。
      if (statusCode === 401 || statusCode === 403) {
        if (adminToken) {
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
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/valuation/detail/index?id=${id}` });
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
