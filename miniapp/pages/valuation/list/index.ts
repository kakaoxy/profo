/**
 * 「我的评估」列表页.
 *
 * ⚠️ 未覆盖：后端多角色用户微信登录仅签发 admin 令牌，无法访问 /public/leads/*（需 C 端
 * aud=c 令牌）；内部员工本轮在端内无法查看「我的评估」，列表接口返回 401 时按「登录已失效」处理。
 */
import type { components } from "../../../types/api-types";
import { request } from "../../../utils/request";
import { formatDate, statusBadgeStyle } from "../../../utils/valuation-display";

type LeadItem = components["schemas"]["PublicLeadListItem"];

/** 每页数量. */
const PAGE_SIZE = 10;

/** 列表项展示用统一结构. */
interface DisplayItem {
  id: string;
  community_name: string;
  desc: string;
  date: string;
  badgeText: string;
  badgeColor: string;
  badgeBackground: string;
}

/** 页面 data. */
interface PageData {
  items: DisplayItem[];
  page: number;
  pageSize: number;
  total: number;
  loading: boolean;
  loadingMore: boolean;
  error: boolean;
  noMore: boolean;
  /** 未登录（无 access_token）. */
  needLogin: boolean;
}

/** 页面自定义方法. */
interface PageCustom {
  getToken(): string;
  loadList(reset?: boolean): void;
  toDisplay(item: LeadItem): DisplayItem;
  clearToken(): void;
  onItemTap(e: WechatMiniprogram.BaseEvent): void;
  onGoLogin(): void;
  onGoValuation(): void;
  onRetry(): void;
}

Page<PageData, PageCustom>({
  data: {
    items: [],
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
    loading: false,
    loadingMore: false,
    error: false,
    noMore: false,
    needLogin: false,
  },

  getToken() {
    return wx.getStorageSync("access_token") as string;
  },

  clearToken() {
    wx.removeStorageSync("access_token");
    wx.removeStorageSync("refresh_token");
  },

  toDisplay(item: LeadItem): DisplayItem {
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

  onLoad() {
    this.loadList(true);
  },

  onShow() {
    // 从登录页返回时 token 可能已补齐，重新检测；仅在处于未登录空态时加载
    if (this.data.needLogin && this.getToken()) {
      this.loadList(true);
    }
  },

  async loadList(reset = false) {
    const token = this.getToken();
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
      const page = reset ? 1 : this.data.page;
      const data = await request<components["schemas"]["PublicLeadListResponse"]>({
        url: "/public/leads/mine",
        data: { page, page_size: this.data.pageSize },
        header: { Authorization: `Bearer ${token}` },
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
      // 401：令牌失效，清 token 并切「登录已失效」态
      const statusCode = (err as { statusCode?: number } | undefined)?.statusCode;
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

  async onPullDownRefresh() {
    // loadList 异步，需等其结束（含无 token 提前返回 / catch）后再停止下拉刷新，
    // 否则刷新动画会在请求完成前提前消失
    await this.loadList(true);
    wx.stopPullDownRefresh();
  },

  onItemTap(e: WechatMiniprogram.BaseEvent) {
    const id = e.currentTarget.dataset.id as string;
    wx.navigateTo({ url: `/pages/valuation/detail/index?id=${id}` });
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