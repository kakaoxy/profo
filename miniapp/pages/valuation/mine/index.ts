/**
 * 估价分享归因 · 我的获客页.
 *
 * 页面职责：
 * - 统计卡：累计获客 / 待评估 / 待看房 / 已签约（已签约品牌蓝强调）
 * - 筛选 chips：全部/待评估/待看房/已看房/已签约/已驳回（切换重置第 1 页）
 * - 获客列表：小区/户型面积预期价描述/状态标签（后端下发色值）/来源标签（客户分享/员工录入）/
 *   脱敏手机号/留资时间；「联系客户」拉取完整手机号并调起拨号；触底加载更多 + 下拉刷新
 * - 游客/空态：「分享估价页给客户，客户提交后自动生成线索」+「去分享估价页」
 * - 未登录或接口 401：统一空态（request 已自动尝试刷新，此处不清登录态不报错）
 */
import type { components } from "../../../types/api-types";
import { request, type HttpResponseError } from "../../../utils/request";
import { getAccessToken, getCAccessToken } from "../../../utils/token";
import { statusBadgeStyle } from "../../../utils/valuation-display";
import { formatLeadTime } from "../../../utils/recruit-logic";

type PublicAcquiredLeadListItem = components["schemas"]["PublicAcquiredLeadListItem"];
type PublicAcquiredLeadListResponse = components["schemas"]["PublicAcquiredLeadListResponse"];
type PublicAcquiredLeadStatsResponse = components["schemas"]["PublicAcquiredLeadStatsResponse"];
type PublicAcquiredLeadPhoneResponse = components["schemas"]["PublicAcquiredLeadPhoneResponse"];

/** 每页数量. */
const PAGE_SIZE = 10;
/** 未登录/无 C 端身份（401）：展示游客空态，不清登录态、不报错. */
const HTTP_UNAUTHORIZED = 401;

/** 筛选 chip（全部 + 5 个状态，值空串或 LeadStatus 值）. */
interface AcquiredChip {
  label: string;
  value: string;
}

/** 状态筛选 chips（顺序与文案对照设计稿 valuation-mine.html）. */
const ACQUIRED_STATUS_CHIPS: AcquiredChip[] = [
  { label: "全部", value: "" },
  { label: "待评估", value: "pending_assessment" },
  { label: "待看房", value: "pending_visit" },
  { label: "已看房", value: "visited" },
  { label: "已签约", value: "signed" },
  { label: "已驳回", value: "rejected" },
];

/** 获客统计展示结构. */
interface StatsDisplay {
  total: number;
  pendingAssessment: number;
  pendingVisit: number;
  signed: number;
}

/** 获客列表项展示结构（wxml 渲染用）. */
interface DisplayItem {
  id: string;
  communityName: string;
  /** 描述：户型 · 面积㎡ · 预期价 X万 拼接（空段跳过）. */
  desc: string;
  statusText: string;
  statusColor: string;
  statusBackground: string;
  sourceText: string;
  /** 来源标签样式类：s-share（客户分享）/ s-direct（员工录入）. */
  sourceClass: string;
  /** 脱敏手机号；后端未返回时显示「未提供联系方式」. */
  phone: string;
  /** 完整手机号（查看后由「联系客户」接口返回填充；空串=未查看）. */
  phoneFull: string;
  /** 是否有客户联系方式（决定是否展示「联系客户」按钮）. */
  hasPhone: boolean;
  /** 创建时间（相对格式：今天/昨天/MM-DD）. */
  timeText: string;
}

interface PageData {
  stats: StatsDisplay;
  chips: AcquiredChip[];
  /** 当前筛选状态值；空串=全部. */
  activeStatus: string;
  items: DisplayItem[];
  page: number;
  pageSize: number;
  total: number;
  loading: boolean;
  loadingMore: boolean;
  noMore: boolean;
  /** 游客/空态：不渲染统计卡与筛选. */
  empty: boolean;
  /** 未登录（无任何令牌）标记；页面统一空态展示，不单独分流. */
  needLogin: boolean;
}

interface PageCustom {
  hasToken(): boolean;
  loadAll(silent?: boolean): Promise<void>;
  loadStats(): Promise<void>;
  loadLeads(reset?: boolean, silent?: boolean): Promise<void>;
  toDisplay(item: PublicAcquiredLeadListItem): DisplayItem;
  onChipTap(e: WechatMiniprogram.BaseEvent): void;
  onContactTap(e: WechatMiniprogram.BaseEvent): void;
  dial(phone: string): void;
  onReachBottom(): void;
  onPullDownRefresh(): void;
  onGoShare(): void;
  /** 首次加载完成标志（避免 onLoad/onShow 双载）. */
  initialLoaded?: boolean;
}

Page<PageData, PageCustom>({
  data: {
    stats: { total: 0, pendingAssessment: 0, pendingVisit: 0, signed: 0 },
    chips: ACQUIRED_STATUS_CHIPS,
    activeStatus: "",
    items: [],
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
    loading: false,
    loadingMore: false,
    noMore: false,
    empty: false,
    needLogin: false,
  },

  hasToken() {
    return !!getCAccessToken() || !!getAccessToken();
  },

  onShow() {
    if (this.initialLoaded) {
      // 返回本页（如从估价提交页分享/提交后返回）：静默刷新统计与列表
      this.loadAll(true);
      return;
    }
    this.initialLoaded = true;
    if (!this.hasToken()) {
      // 游客：不发请求，直接展示空态
      this.setData({ empty: true, needLogin: true });
      return;
    }
    this.loadAll();
  },

  /** 并行加载统计与第 1 页获客（统计与列表互不依赖，消除请求瀑布）. */
  async loadAll(silent = false) {
    if (!this.hasToken()) {
      this.setData({ empty: true, needLogin: true, loading: false, loadingMore: false });
      return;
    }
    if (!silent && this.data.items.length === 0) {
      this.setData({ loading: true });
    }
    // silent 透传给 loadLeads：刷新时保留当前列表，避免骨架屏闪烁
    await Promise.all([this.loadStats(), this.loadLeads(true, true)]);
    const { stats, items, total } = this.data;
    const allZero =
      stats.total === 0 && stats.pendingAssessment === 0 && stats.pendingVisit === 0 && stats.signed === 0;
    // 游客/员工暂无任何数据 → 空态；有数据但当前筛选无线索 → 保留统计卡 + 列表空文案
    this.setData({
      loading: false,
      needLogin: false,
      empty: allZero && items.length === 0 && total === 0,
    });
  },

  /** 获客统计；失败（401/网络）保持 0，由 loadAll 统一判定空态. */
  async loadStats() {
    try {
      const res = await request<PublicAcquiredLeadStatsResponse>({
        url: "/public/leads/my/acquired/stats",
      });
      this.setData({
        stats: {
          total: res.total || 0,
          pendingAssessment: res.pending_assessment || 0,
          pendingVisit: res.pending_visit || 0,
          signed: res.signed || 0,
        },
      });
    } catch {
      // 401（无 C 端身份）/网络异常：静默
    }
  },

  /** 我的获客分页加载；reset=重置第 1 页（chips 切换/刷新），否则追加下一页. */
  async loadLeads(reset = false, silent = false) {
    if (reset && !silent) {
      this.setData({ loading: true });
    } else if (!reset) {
      this.setData({ loadingMore: true });
    }
    const { activeStatus, pageSize } = this.data;
    const page = reset ? 1 : this.data.page;
    try {
      const res = await request<PublicAcquiredLeadListResponse>({
        url: "/public/leads/my/acquired",
        data: {
          page,
          page_size: pageSize,
          ...(activeStatus ? { status: activeStatus } : {}),
        },
      });
      const newItems = (res.items || []).map((it) => this.toDisplay(it));
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
        // 未登录/无 C 端身份：统一空态兜底（reset 清空当前筛选列表），不清登录态不报错
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

  /** 获客列表项 → 展示结构（描述拼接/状态标签/来源标签/相对时间）. */
  toDisplay(item: PublicAcquiredLeadListItem): DisplayItem {
    const layout = item.layout || "";
    const area = item.area != null ? `${item.area}㎡` : "";
    const price = item.expected_price != null ? `预期 ${item.expected_price}万` : "";
    const desc = [layout, area, price].filter(Boolean).join(" · ");
    const badge = statusBadgeStyle(item.status_color);
    const source =
      item.source === "customer_share"
        ? { text: "客户分享", cls: "s-share" }
        : { text: "员工录入", cls: "s-direct" };
    return {
      id: item.id,
      communityName: item.community_name,
      desc,
      statusText: item.status_display,
      statusColor: badge.color,
      statusBackground: badge.background,
      sourceText: source.text,
      sourceClass: source.cls,
      phone: item.phone_masked || "未提供联系方式",
      phoneFull: "",
      hasPhone: !!item.phone_masked,
      timeText: formatLeadTime(item.created_at),
    };
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
   * 「联系客户」：首次点击拉取完整手机号，就地填充后调起拨号；
   * 已查看过则直接拨打；接口返回无号码（非分享来源）toast 提示。
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
      const res = await request<PublicAcquiredLeadPhoneResponse>({
        url: `/public/leads/my/acquired/${encodeURIComponent(id)}/phone`,
      });
      if (!res.phone) {
        // 仅分享来源且有客户手机号的线索才有真实号码
        wx.showToast({ title: "未提供联系方式", icon: "none" });
        return;
      }
      // 就地填充完整号码并拨号
      this.setData({ [`items[${idx}].phoneFull`]: res.phone });
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

  /** 空态「去分享估价页」：估价提交页为 tabBar 页，需 switchTab. */
  onGoShare() {
    wx.switchTab({ url: "/pages/valuation/submit/index" });
  },
});
