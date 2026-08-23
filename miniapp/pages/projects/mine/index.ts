/**
 * 房源分享归因 · 我的客户页.
 *
 * 页面职责：
 * - 统计卡：昨日/累计两行漏斗 × 分享次数/打开 PV/访客 UV/留资（留资列品牌蓝强调，
 *   与 valuation/mine 统一口径，数据源 /public/projects/my/share-stats）
 * - 归因客户列表：脱敏手机号/「预约客户」标签/房源标题/小区/户型·总价/预约时间；
 *   点击卡片进入房源详情；数据源 GET /public/projects/my/customers（全量裸 list 不分页），
 *   前端拿到全量后按每页 PAGE_SIZE 切片展示，触底加载下一页切片（同 bookings/mine）
 * - 未登录不发请求；401（令牌失效）统一空态兜底（对齐 bookings/mine：不清登录态、不报错）
 * - 空态判定与 valuation/mine 一致：累计漏斗全零且列表为空才整页空态；
 *   有分享数据但暂无客户 → 保留统计卡 + 列表区空文案
 */
import type { components } from "../../../types/api-types";
import { request, type HttpResponseError } from "../../../utils/request";
import { getAccessToken, getCAccessToken } from "../../../utils/token";
import { formatLeadTime } from "../../../utils/recruit-logic";

type PublicShareStatsResponse = components["schemas"]["PublicShareStatsResponse"];
type PublicCustomerBookingItem = components["schemas"]["PublicCustomerBookingItem"];

/** 前端切片分页每页数量. */
const PAGE_SIZE = 10;

/** 未登录/无 C 端身份（401）：统一空态兜底，不清登录态、不报错. */
const HTTP_UNAUTHORIZED = 401;

/** 分享漏斗统计展示结构（累计 + 昨日两行；空态判定仅用累计字段）. */
interface ShareStatsDisplay {
  shareCount: number;
  pv: number;
  uv: number;
  leadCount: number;
  yesterdayShareCount: number;
  yesterdayPv: number;
  yesterdayUv: number;
  yesterdayLeadCount: number;
}

/** 归因客户列表项展示结构（wxml 渲染用）. */
interface CustomerDisplay {
  /** 预约 ID（列表 key）. */
  id: number;
  /** 房源 ID（点击进详情）. */
  projectId: number;
  /** 客户脱敏手机号（前3后4）；空串=未提供联系方式. */
  phone: string;
  projectTitle: string;
  /** 小区名（后端可空，空串时 wxml 不渲染该行）. */
  communityName: string;
  /** 描述：户型 · 总价 X万 拼接（空段跳过）. */
  desc: string;
  /** 预约时间（相对格式：今天/昨天/MM-DD HH:mm）. */
  timeText: string;
}

interface PageData {
  stats: ShareStatsDisplay;
  items: CustomerDisplay[];
  loading: boolean;
  loadingMore: boolean;
  /** 已展示条数达到全量数时置真，触底不再加载. */
  noMore: boolean;
  /** 游客/暂无任何数据：统一空态展示（统计卡与列表均不渲染）. */
  empty: boolean;
}

interface PageCustom {
  hasToken(): boolean;
  loadAll(silent?: boolean): Promise<void>;
  loadStats(): Promise<void>;
  loadCustomers(silent?: boolean): Promise<void>;
  toDisplay(item: PublicCustomerBookingItem): CustomerDisplay;
  onCardTap(e: WechatMiniprogram.BaseEvent): void;
  onReachBottom(): void;
  onPullDownRefresh(): void;
  onGoProjects(): void;
  /** 首次加载完成标志（避免 onShow 重复首载；返回本页时走静默刷新）. */
  initialLoaded?: boolean;
  /** 后端全量数据（已转展示结构），items 为其前 N 条切片. */
  allItems: CustomerDisplay[];
}

Page<PageData, PageCustom>({
  data: {
    stats: {
      shareCount: 0,
      pv: 0,
      uv: 0,
      leadCount: 0,
      yesterdayShareCount: 0,
      yesterdayPv: 0,
      yesterdayUv: 0,
      yesterdayLeadCount: 0,
    },
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
      // 返回本页（如从房源详情返回）：静默刷新统计与列表
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

  /** 并行加载统计与全量客户（互不依赖，消除请求瀑布），并统一判定空态. */
  async loadAll(silent = false) {
    if (!this.hasToken()) {
      this.allItems = [];
      this.setData({ empty: true, loading: false, loadingMore: false });
      return;
    }
    if (!silent && this.data.items.length === 0) {
      this.setData({ loading: true });
    }
    await Promise.all([this.loadStats(), this.loadCustomers(silent)]);
    const { stats } = this.data;
    // 空态判定基于累计漏斗字段（与 valuation/mine 口径一致）
    const allZero =
      stats.shareCount === 0 && stats.pv === 0 && stats.uv === 0 && stats.leadCount === 0;
    this.setData({
      loading: false,
      empty: allZero && this.allItems.length === 0,
    });
  },

  /** 分享漏斗统计（昨日 + 累计）；失败（401/网络）保持 0，由 loadAll 统一判定空态. */
  async loadStats() {
    try {
      const res = await request<PublicShareStatsResponse>({
        url: "/public/projects/my/share-stats",
      });
      this.setData({
        stats: {
          shareCount: res.share_count || 0,
          pv: res.pv || 0,
          uv: res.uv || 0,
          leadCount: res.lead_count || 0,
          yesterdayShareCount: res.yesterday_share_count || 0,
          yesterdayPv: res.yesterday_pv || 0,
          yesterdayUv: res.yesterday_uv || 0,
          yesterdayLeadCount: res.yesterday_lead_count || 0,
        },
      });
    } catch {
      // 401（无 C 端身份）/网络异常：静默
    }
  },

  /**
   * 拉取全量归因客户并展示第 1 页切片.
   * 后端不分页（返回全量裸 list），此处一次拉取后本地切片；
   * silent=静默刷新（失败不弹 toast，避免刷新打断浏览）.
   */
  async loadCustomers(silent = false) {
    try {
      const res = await request<PublicCustomerBookingItem[]>({
        url: "/public/projects/my/customers",
      });
      this.allItems = (res || []).map((it) => this.toDisplay(it));
      this.setData({
        items: this.allItems.slice(0, PAGE_SIZE),
        noMore: this.allItems.length <= PAGE_SIZE,
        loadingMore: false,
      });
    } catch (err) {
      const statusCode = (err as HttpResponseError).statusCode;
      this.setData({ loadingMore: false });
      if (statusCode === HTTP_UNAUTHORIZED) {
        // 401（未登录/令牌失效，request 已自动尝试刷新仍失败）：
        // 清空列表走空态兜底，不清登录态、不报「加载失败」（与 bookings/mine 口径一致）
        this.allItems = [];
        this.setData({ items: [], noMore: true });
        return;
      }
      if (!silent) {
        wx.showToast({ title: "加载失败，请重试", icon: "none" });
      }
    }
  },

  /** 归因客户列表项 → 展示结构（描述拼接/相对时间）. */
  toDisplay(item: PublicCustomerBookingItem): CustomerDisplay {
    const layout = item.layout || "";
    const price = item.total_price != null ? `${item.total_price}万` : "";
    return {
      id: item.id,
      projectId: item.marketing_project_id,
      phone: item.customer_phone_masked || "",
      projectTitle: item.project_title,
      communityName: item.community_name || "",
      desc: [layout, price].filter(Boolean).join(" · "),
      timeText: formatLeadTime(item.created_at),
    };
  },

  /** 点击卡片进入对应房源详情页. */
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

  /** 下拉刷新：静默重拉统计与全量客户并回到第 1 页切片，完成后停止刷新动画. */
  async onPullDownRefresh() {
    await this.loadAll(true);
    wx.stopPullDownRefresh();
  },

  /** 空态「去分享房源」：房源列表为 tabBar 页，需 switchTab. */
  onGoProjects() {
    wx.switchTab({ url: "/pages/projects/list/index" });
  },
});
