/**
 * 区域伙伴招募计划 · 我的分享 / 我的线索页（招募计划二期）.
 *
 * 页面职责：
 * - 统计卡：分享次数 / 带来打开 PV / 独立访客 UV / 留资数（留资数品牌蓝强调）
 * - 筛选 chips：全部/新线索/已联系/意向高/已转化/已淘汰（切换重置第 1 页）
 * - 线索列表：脱敏手机号/主营商圈/状态标签/来源标签（卡片/海报）/留资时间；
 *   「联系客户」查看完整号码并调起拨号（后端查看即 new→contacted，就地更新卡片）；
 *   触底加载更多 + 下拉刷新
 * - 游客/空态：「分享产生的客户线索将展示在这里」+「去招募页分享」
 *   （campaign_id 取进入参数；缺失时跳详情页由其 notFound 空态兜底）
 * - 未登录或接口 401：静默展示空态（request 已自动尝试刷新，此处不清登录态不报错）
 */
import type { components } from "../../../types/api-types";
import { request, type HttpResponseError } from "../../../utils/request";
import { getAccessToken, getCAccessToken } from "../../../utils/token";
import {
  applyLeadPhone,
  RECRUIT_LEAD_STATUS_CHIPS,
  toMyLeadDisplayItem,
  type RecruitLeadChip,
  type RecruitMyLeadDisplayItem,
} from "../../../utils/recruit-logic";

type RecruitMyLeadListResponse = components["schemas"]["RecruitMyLeadListResponse"];
type RecruitMyShareStatsResponse = components["schemas"]["RecruitMyShareStatsResponse"];
type RecruitMyLeadPhoneResponse = components["schemas"]["RecruitMyLeadPhoneResponse"];

/** 每页数量. */
const PAGE_SIZE = 10;
/** 未登录/无 C 端身份（401）：展示游客空态，不清登录态、不报错. */
const HTTP_UNAUTHORIZED = 401;

/** 分享统计展示结构. */
interface ShareStatsDisplay {
  shareCount: number;
  pv: number;
  uv: number;
  leadCount: number;
}

interface PageData {
  chips: RecruitLeadChip[];
  /** 当前筛选状态值；空串=全部. */
  activeStatus: string;
  stats: ShareStatsDisplay;
  items: RecruitMyLeadDisplayItem[];
  page: number;
  pageSize: number;
  total: number;
  loading: boolean;
  loadingMore: boolean;
  noMore: boolean;
  /** 游客/空态：不渲染统计卡与筛选. */
  empty: boolean;
  /** 来源活动 ID（「去招募页分享」回跳用）. */
  campaignId: string;
}

interface PageCustom {
  hasToken(): boolean;
  loadAll(silent?: boolean): Promise<void>;
  loadStats(): Promise<void>;
  loadLeads(reset?: boolean, silent?: boolean): Promise<void>;
  onChipTap(e: WechatMiniprogram.BaseEvent): void;
  onContactTap(e: WechatMiniprogram.BaseEvent): void;
  dial(phone: string): void;
  onReachBottom(): void;
  onPullDownRefresh(): void;
  onGoRecruit(): void;
  /** 首次加载完成标志（避免 onLoad/onShow 双载）. */
  initialLoaded?: boolean;
}

Page<PageData, PageCustom>({
  data: {
    chips: RECRUIT_LEAD_STATUS_CHIPS,
    activeStatus: "",
    stats: { shareCount: 0, pv: 0, uv: 0, leadCount: 0 },
    items: [],
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
    loading: false,
    loadingMore: false,
    noMore: false,
    empty: false,
    campaignId: "",
  },

  onLoad(options) {
    const raw = options as Record<string, string | undefined>;
    this.setData({ campaignId: raw.campaign_id || "" });
  },

  hasToken() {
    return !!getCAccessToken() || !!getAccessToken();
  },

  onShow() {
    if (this.initialLoaded) {
      // 返回本页（如从招募详情分享后返回）：静默刷新统计与列表
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

  /** 并行加载统计与第 1 页线索（统计与列表互不依赖，消除请求瀑布）. */
  async loadAll(silent = false) {
    if (!this.hasToken()) {
      this.setData({ empty: true, loading: false, loadingMore: false });
      return;
    }
    if (!silent && this.data.items.length === 0) {
      this.setData({ loading: true });
    }
    // silent 透传给 loadLeads：刷新时保留当前列表，避免骨架屏闪烁
    await Promise.all([this.loadStats(), this.loadLeads(true, true)]);
    const { stats, items, total } = this.data;
    const allZero =
      stats.shareCount === 0 && stats.pv === 0 && stats.uv === 0 && stats.leadCount === 0;
    // 游客/员工暂无任何数据 → 空态；有分享数据但当前筛选无线索 → 保留统计卡 + 列表空文案
    this.setData({
      loading: false,
      empty: allZero && items.length === 0 && total === 0,
    });
  },

  /** 我的分享统计；失败（401/网络）保持 0，由 loadAll 统一判定空态. */
  async loadStats() {
    try {
      const res = await request<RecruitMyShareStatsResponse>({
        url: "/public/recruit/my/share-stats",
      });
      this.setData({
        stats: {
          shareCount: res.share_count || 0,
          pv: res.pv || 0,
          uv: res.uv || 0,
          leadCount: res.lead_count || 0,
        },
      });
    } catch {
      // 401（无 C 端身份）/网络异常：静默
    }
  },

  /** 我的线索分页加载；reset=重置第 1 页（chips 切换/刷新），否则追加下一页. */
  async loadLeads(reset = false, silent = false) {
    if (reset && !silent) {
      this.setData({ loading: true });
    } else if (!reset) {
      this.setData({ loadingMore: true });
    }
    const { activeStatus, pageSize } = this.data;
    const page = reset ? 1 : this.data.page;
    try {
      const res = await request<RecruitMyLeadListResponse>({
        url: "/public/recruit/my/leads",
        data: {
          page,
          page_size: pageSize,
          ...(activeStatus ? { status: activeStatus } : {}),
        },
      });
      const newItems = (res.items || []).map((it) => toMyLeadDisplayItem(it));
      const merged = reset ? newItems : [...this.data.items, ...newItems];
      const total = res.total || 0;
      this.setData({
        items: merged,
        total,
        page,
        noMore: merged.length >= total,
        loading: false,
        loadingMore: false,
      });
    } catch (err) {
      const statusCode = (err as HttpResponseError).statusCode;
      this.setData({ loading: false, loadingMore: false });
      if (statusCode === HTTP_UNAUTHORIZED) {
        // 未登录/无 C 端身份：空态兜底（reset 清空当前筛选列表），不清登录态不报错
        if (reset) {
          this.setData({ items: [], total: 0, noMore: true });
        }
        return;
      }
      if (!silent) {
        wx.showToast({ title: "加载失败，请重试", icon: "none" });
      }
    }
  },

  /** 筛选 chips 切换：更新状态并重置第 1 页. */
  onChipTap(e: WechatMiniprogram.BaseEvent) {
    const value = String(e.currentTarget.dataset.value ?? "");
    if (value === this.data.activeStatus) {
      return;
    }
    this.setData({ activeStatus: value, page: 1 });
    this.loadLeads(true);
  },

  /**
   * 「联系客户」：首次点击拉取完整手机号（后端查看即 new→contacted），
   * 就地更新卡片后调起拨号；已查看过则直接拨打。
   */
  async onContactTap(e: WechatMiniprogram.BaseEvent) {
    const id = String(e.currentTarget.dataset.id ?? "");
    const idx = this.data.items.findIndex((it) => it.id === id);
    if (idx < 0) {
      return;
    }
    const item = this.data.items[idx];
    if (item.phoneFull) {
      this.dial(item.phoneFull);
      return;
    }
    try {
      const res = await request<RecruitMyLeadPhoneResponse>({
        url: `/public/recruit/my/leads/${encodeURIComponent(id)}/phone`,
      });
      // 就地更新：完整号码 + 接口返回的最新状态标签
      this.setData({ [`items[${idx}]`]: applyLeadPhone(item, res.phone, res.status) });
      this.dial(res.phone);
    } catch (err) {
      const statusCode = (err as HttpResponseError).statusCode;
      if (statusCode === HTTP_UNAUTHORIZED) {
        // 401 与列表口径一致：静默（request 已自动尝试刷新）
        return;
      }
      wx.showToast({ title: "获取号码失败，请重试", icon: "none" });
    }
  },

  /** 调起系统拨号；用户取消（fail）静默. */
  dial(phone: string) {
    wx.makePhoneCall({
      phoneNumber: phone,
      fail: () => {},
    });
  },

  /** 触底加载更多（限流防抖：加载中/无更多直接 return）. */
  onReachBottom() {
    if (this.data.loading || this.data.loadingMore || this.data.noMore || this.data.empty) {
      return;
    }
    if (this.data.items.length >= this.data.total) {
      return;
    }
    this.setData({ page: this.data.page + 1 });
    this.loadLeads(false);
  },

  /** 下拉刷新：静默并行刷新统计与列表，完成后停止刷新动画. */
  async onPullDownRefresh() {
    await this.loadAll(true);
    wx.stopPullDownRefresh();
  },

  /** 空态「去招募页分享」：携带来源活动 ID；缺失时由详情页 notFound 空态兜底. */
  onGoRecruit() {
    const { campaignId } = this.data;
    const url = campaignId
      ? `/pages/recruit/detail/index?campaign_id=${encodeURIComponent(campaignId)}`
      : "/pages/recruit/detail/index";
    wx.navigateTo({ url });
  },
});
