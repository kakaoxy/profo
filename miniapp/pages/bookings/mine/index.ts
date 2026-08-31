/**
 * 我的预约页（C 端房源预约列表）.
 *
 * 页面职责：
 * - 预约卡片列表：封面（空则占位）/标题/小区/户型·总价（万元）/预约时间（相对格式）/状态「待联系」
 * - 数据源 GET /public/bookings/my：后端返回全量裸 list（不分页），
 *   前端拿到全量后按每页 PAGE_SIZE 切片展示，触底加载下一页切片
 * - 未登录不发请求；401（令牌失效）统一空态兜底（对齐 valuation/mine：不清登录态、不报错）
 * - 空态：「预约房源后展示在这里」+「去逛房源」（房源列表为 tabBar 页，switchTab）
 * - 点击卡片进入房源详情页
 */
import type { components } from "../../../types/api-types";
import { request } from "../../../utils/request";
import type { HttpResponseError } from "../../../utils/request";
import { getAccessToken, getCAccessToken } from "../../../utils/token";
import { resolveAssetUrl } from "../../../utils/url";
import { formatLeadTime } from "../../../utils/recruit-logic";

type PublicProjectBookingItem = components["schemas"]["PublicProjectBookingItem"];

/** 前端切片分页每页数量. */
const PAGE_SIZE = 10;

/** 未登录/无 C 端身份（401）：统一空态兜底，不清登录态、不报错. */
const HTTP_UNAUTHORIZED = 401;

/** 预约卡片展示结构（wxml 渲染用）. */
interface BookingDisplay {
  /** 预约 ID（列表 key）. */
  id: number;
  /** 房源 ID（点击进详情）. */
  projectId: number;
  /** 封面完整 URL（空串=无封面，渲染占位）. */
  coverUrl: string;
  projectTitle: string;
  /** 小区名（后端可空，空串时 wxml 不渲染该行）. */
  communityName: string;
  /** 户型（后端非空字符串，可能为空串）. */
  layout: string;
  /** 总价展示（如「350万」；total_price 单位万元）. */
  priceText: string;
  /** 预约时间（相对格式：今天/昨天/MM-DD HH:mm）. */
  timeText: string;
}

interface PageData {
  items: BookingDisplay[];
  loading: boolean;
  loadingMore: boolean;
  /** 已展示条数达到全量数时置真，触底不再加载. */
  noMore: boolean;
  /** 游客/无数据：统一空态展示. */
  empty: boolean;
}

interface PageCustom {
  hasToken(): boolean;
  loadAll(silent?: boolean): Promise<void>;
  toDisplay(item: PublicProjectBookingItem): BookingDisplay;
  onCardTap(e: WechatMiniprogram.BaseEvent): void;
  onReachBottom(): void;
  onPullDownRefresh(): void;
  onGoProjects(): void;
  /** 首次加载完成标志（避免 onShow 重复首载；返回本页时走静默刷新）. */
  initialLoaded?: boolean;
  /** 后端全量数据（已倒序、已转展示结构），items 为其前 N 条切片. */
  allItems: BookingDisplay[];
}

Page<PageData, PageCustom>({
  data: {
    items: [],
    loading: false,
    loadingMore: false,
    noMore: false,
    empty: false,
  },

  allItems: [],

  hasToken() {
    return !!getCAccessToken() || !!getAccessToken();
  },

  onShow() {
    if (this.initialLoaded) {
      // 返回本页（如从房源详情预约后返回）：静默刷新全量数据
      this.loadAll(true);
      return;
    }
    this.initialLoaded = true;
    if (!this.hasToken()) {
      // 游客：不发请求，直接展示空态
      this.setData({ empty: true });
      return;
    }
    this.loadAll();
  },

  /**
   * 拉取全量预约并展示第 1 页切片.
   * 后端不分页（返回全量裸 list），此处一次拉取后本地切片；
   * silent=静默刷新（保留当前列表，避免加载态闪烁）.
   */
  async loadAll(silent = false) {
    if (!this.hasToken()) {
      this.allItems = [];
      this.setData({ empty: true, loading: false, loadingMore: false });
      return;
    }
    if (!silent && this.data.items.length === 0) {
      this.setData({ loading: true });
    }
    try {
      const res = await request<PublicProjectBookingItem[]>({
        url: "/public/bookings/my",
      });
      this.allItems = (res || []).map((it) => this.toDisplay(it));
      this.setData({
        items: this.allItems.slice(0, PAGE_SIZE),
        noMore: this.allItems.length <= PAGE_SIZE,
        loading: false,
        empty: this.allItems.length === 0,
      });
    } catch (err) {
      const statusCode = (err as HttpResponseError).statusCode;
      this.setData({ loading: false, loadingMore: false });
      if (statusCode === HTTP_UNAUTHORIZED) {
        // 401（未登录/令牌失效，request 已自动尝试刷新仍失败）：
        // 统一空态兜底，不清登录态、不报「加载失败」（与 valuation/mine 口径一致）
        this.allItems = [];
        this.setData({ items: [], noMore: true, empty: true });
        return;
      }
      if (!silent) {
        wx.showToast({ title: "加载失败，请重试", icon: "none" });
      }
    }
  },

  /** 预约列表项 → 展示结构（封面 URL 解析/总价拼「万」/相对时间）. */
  toDisplay(item: PublicProjectBookingItem): BookingDisplay {
    return {
      id: item.id,
      projectId: item.marketing_project_id,
      coverUrl: resolveAssetUrl(item.cover_image),
      projectTitle: item.project_title,
      communityName: item.community_name || "",
      layout: item.layout || "",
      priceText: item.total_price != null ? `${item.total_price}万` : "",
      timeText: formatLeadTime(item.created_at),
    };
  },

  /** 点击卡片进入房源详情页. */
  onCardTap(e: WechatMiniprogram.BaseEvent) {
    const id = Number(e.currentTarget.dataset.id);
    if (!id) {
      return;
    }
    wx.navigateTo({ url: `/pages/projects/detail/index?id=${id}` });
  },

  /** 触底加载下一页切片（本地切片即时完成，无网络请求）. */
  onReachBottom() {
    if (this.data.loading || this.data.loadingMore || this.data.noMore || this.data.empty) {
      return;
    }
    this.setData({ loadingMore: true });
    const items = this.allItems.slice(0, this.data.items.length + PAGE_SIZE);
    this.setData({
      items,
      noMore: items.length >= this.allItems.length,
      loadingMore: false,
    });
  },

  /** 下拉刷新：静默拉取全量并回到第 1 页切片，完成后停止刷新动画. */
  async onPullDownRefresh() {
    await this.loadAll(true);
    wx.stopPullDownRefresh();
  },

  /** 空态「去逛房源」：房源列表为 tabBar 页，需 switchTab. */
  onGoProjects() {
    wx.switchTab({ url: "/pages/projects/list/index" });
  },
});
