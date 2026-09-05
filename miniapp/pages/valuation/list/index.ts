/**
 * 「我的评估」列表页.
 *
 * 具备 C 端身份的内部员工（后端按其 customer 身份签发 aud=c 令牌）可正常访问 C 端
 * /public/leads/mine 查看自己的评估；仅当请求返回 401（admin 令牌受众不匹配）或 403
 * （无 C 端身份）时，才展示内部限定态，而非误判为「登录已失效」清空有效登录态。
 */
import type { components } from "../../../types/api-types";
import { request } from "../../../utils/request";
import { getAccessToken, getCAccessToken } from "../../../utils/token";
import { formatDate, statusBadgeStyle } from "../../../utils/valuation-display";
import { fetchValuationSubscribeTemplate, requestValuationPriceSubscribe } from "../../../utils/valuation-notify";

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
  /** 无 C 端身份（admin 令牌受众不匹配 / 403）时展示内部限定态，而非登录失效. */
  internalOnly: boolean;
  /** 「授权价提醒」授权入口可见（后端已下发订阅模板 ID）. */
  notifyBanner: boolean;
}

/** 页面自定义方法（含非响应式实例字段）. */
interface PageCustom {
  /** 请求时代戳：每次 reset 加载（onShow 刷新/下拉刷新/重试）+1，用于丢弃晚到的旧代响应（竞态守卫） */
  _epoch: number;
  /** 「授权价提醒」订阅模板 ID（后端未配置/取数失败为 null，入口隐藏）. */
  subscribeTemplateId: string | null;
  getToken(): string;
  loadList(reset?: boolean, silent?: boolean): void;
  toDisplay(item: LeadItem): DisplayItem;
  clearToken(): void;
  onItemTap(e: WechatMiniprogram.BaseEvent): void;
  onGoLogin(): void;
  onGoValuation(): void;
  onRetry(): void;
  onSubscribeTap(): void;
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
    internalOnly: false,
    notifyBanner: false,
  },

  _epoch: 0,

  subscribeTemplateId: null,

  onLoad() {
    // 预取「授权价提醒」订阅模板 ID（静默失败置 null，授权入口隐藏）
    fetchValuationSubscribeTemplate().then((templateId) => {
      this.subscribeTemplateId = templateId;
      this.setData({ notifyBanner: !!templateId });
    });
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
      // epoch 守卫：onShow 静默刷新/下拉刷新/重试使旧代在途请求失效（竞态丢弃）
      this._epoch += 1;
    }
    const myEpoch = this._epoch;
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
      const data = await request<components["schemas"]["PublicLeadListResponse"]>({
        url: "/public/leads/mine",
        data: { page, page_size: this.data.pageSize },
        // 不传 header，request.ts 按 /public/* 自动注入 c_access_token
      });
      if (myEpoch !== this._epoch) {
        // 请求已过期（期间发生了新的 reset 加载），整体丢弃，不触碰当前状态
        return;
      }
      const newItems = data.items.map((it) => this.toDisplay(it));
      if (reset) {
        this.setData({
          items: newItems,
          total: data.total,
          page,
          noMore: newItems.length >= data.total,
        });
      } else {
        // 翻页追加：索引路径局部 setData，payload 不随累计页数增长（P-05）
        const patch: Record<string, unknown> = {
          total: data.total,
          page,
          noMore: this.data.items.length + newItems.length >= data.total,
        };
        const base = this.data.items.length;
        newItems.forEach((it, i) => {
          patch[`items[${base + i}]`] = it;
        });
        this.setData(patch);
      }
    } catch (err) {
      if (myEpoch !== this._epoch) {
        // 过期请求的失败不清 token、不切内部限定态、不回滚页码、不弹 toast
        return;
      }
      const statusCode = (err as { statusCode?: number } | undefined)?.statusCode;
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
        // 翻页失败：回滚页码并重置 noMore，避免下次触底被 noMore 拦截跳过本页（弱网下不丢数据）
        this.setData({ page: Math.max(1, this.data.page - 1), noMore: false });
        wx.showToast({ title: "加载失败，请重试", icon: "none" });
      }
    } finally {
      if (myEpoch === this._epoch) {
        // 仅当前代请求负责恢复加载标志；过期请求交给接管的新代请求收尾
        this.setData({ loading: false, loadingMore: false });
      }
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

  onItemTap(e: WechatMiniprogram.BaseEvent) {
    const id = e.currentTarget.dataset.id as string;
    wx.navigateTo({ url: `/pages/valuation/detail/index?id=${id}` });
  },

  onGoLogin() {
    // 统一走正式登录页；from=valuation 让登录成功后 navigateBack 返回本页（onShow 自动刷新）
    wx.navigateTo({ url: "/pages/login/index/index?from=valuation" });
  },

  onGoValuation() {
    // submit 页为 tabBar 页，必须用 switchTab 跳转（navigateTo 会报错）
    wx.switchTab({ url: "/pages/valuation/submit/index" });
  },

  onRetry() {
    this.loadList(true);
  },

  /**
   * 「授权价提醒」授权入口：发起一次性订阅授权（积累推送额度）.
   * ⚠️ wx.requestSubscribeMessage 必须在 tap 手势回调内同步调用；
   * 用户允许/拒绝均静默（授权结果反馈由 utils 内 toast/modal 承担）.
   */
  onSubscribeTap() {
    requestValuationPriceSubscribe(this.subscribeTemplateId);
  },
});
