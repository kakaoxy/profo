/**
 * 我的客户 · 四链路聚合列表页（估价/预约/房源单/招募）.
 *
 * 页面职责：
 * - 订阅提醒条：subscribe-template 返回模板 ID 且本地未授权时展示；
 *   「开启」在 tap 手势回调内同步发起 wx.requestSubscribeMessage
 *   （accept → 隐藏+toast+写本地标记；ban → 引导 openSetting；其余静默）
 * - 漏斗统计卡：今日/累计两行 × 分享/打开 PV/访客 UV/留资（留资列 rust 强调）
 * - 两级筛选：模块 tabs（色点+计数）× 统一状态 chips（计数），切换重置第 1 页
 * - 客户卡片：模块标签（色点）+脱敏手机号+统一状态标签+模块摘要+来源 chip+相对时间；
 *   new →「联系客户」+「状态流转」；contacted/high_intent →「再次联系」+「状态流转」；
 *   converted/eliminated → 仅「查看详情」；查看号码按响应最新状态就地刷新卡片
 * - 分页：PAGE_SIZE=10 触底追加；onLoad 并行加载 stats+第 1 页列表；
 *   onShow 静默刷新（initialLoaded 防双载）
 * - 空态：累计漏斗全零且列表空 → 整页空态；筛选无结果 → 行内空态；
 *   401/403 空态兜底不清登录态
 *
 * 展示映射常量与纯函数（chips 元信息/摘要拼装/相对时间）拆至同目录 meta.ts。
 */
import { request } from "../../../utils/request";
import type { HttpResponseError } from "../../../utils/request";
import { getAccessToken, getCAccessToken } from "../../../utils/token";
import type { components } from "../../../types/api-types";
import { ACTION_BY_STATUS, MODULE_TABS, STATUS_CHIPS, STATUS_META, toDisplayItem } from "./meta";
import { statusLabel } from "../detail/constants";
import type { CustomerDisplayItem, ModuleTab, StatusChip } from "./meta";

type MyCustomerListResponse = components["schemas"]["MyCustomerListResponse"];
type MyCustomerShareStatsResponse = components["schemas"]["MyCustomerShareStatsResponse"];
type MyCustomerSubscribeTemplateResponse = components["schemas"]["MyCustomerSubscribeTemplateResponse"];
type MyCustomerPhoneResponse = components["schemas"]["MyCustomerPhoneResponse"];

/** 每页数量. */
const PAGE_SIZE = 10;
/** 未登录/无 C 端身份（401）：空态兜底，不清登录态、不报错. */
const HTTP_UNAUTHORIZED = 401;
/** 无获客权限（403）：与 401 同口径空态兜底. */
const HTTP_FORBIDDEN = 403;
/** 订阅授权本地标记（accept 后写入，命中则不再展示订阅提醒条）. */
const SUBSCRIBE_GRANTED_KEY = "customers_subscribe_granted";

/** 分享统计展示结构（累计 + 今日两行漏斗；空态判定仅用累计字段）. */
interface ShareStatsDisplay {
  shareCount: number;
  pv: number;
  uv: number;
  leadCount: number;
  todayShareCount: number;
  todayPv: number;
  todayUv: number;
  todayLeadCount: number;
}

interface PageData {
  /** 模块 tabs（含计数）. */
  moduleTabs: ModuleTab[];
  /** 统一状态 chips（含计数；全部不带计数）. */
  statusChips: StatusChip[];
  activeModule: string;
  activeStatus: string;
  stats: ShareStatsDisplay;
  items: CustomerDisplayItem[];
  page: number;
  pageSize: number;
  total: number;
  loading: boolean;
  loadingMore: boolean;
  noMore: boolean;
  /** 整页空态（累计漏斗全零 && items 空 && total 0）. */
  empty: boolean;
  subscribeTemplateId: string;
  showSubscribePrompt: boolean;
}

interface PageCustom {
  hasToken(): boolean;
  loadAll(silent?: boolean): Promise<void>;
  loadStats(): Promise<void>;
  loadLeads(reset?: boolean, silent?: boolean): Promise<void>;
  loadSubscribeTemplate(): Promise<void>;
  onModuleTap(e: WechatMiniprogram.BaseEvent): void;
  onStatusChipTap(e: WechatMiniprogram.BaseEvent): void;
  onContactTap(e: WechatMiniprogram.BaseEvent): void;
  dial(phone: string): void;
  onCardTap(e: WechatMiniprogram.BaseEvent): void;
  onFlowTap(e: WechatMiniprogram.BaseEvent): void;
  onGoShare(): void;
  onGoRules(): void;
  onSubscribeTap(): void;
  /** 首次加载完成标志（避免 onLoad/onShow 双载）. */
  initialLoaded?: boolean;
}

Page<PageData, PageCustom>({
  data: {
    moduleTabs: MODULE_TABS.map((tab) => ({ ...tab, count: 0 })),
    statusChips: STATUS_CHIPS.map((chip) => ({ ...chip, count: -1 })),
    activeModule: "",
    activeStatus: "",
    stats: {
      shareCount: 0,
      pv: 0,
      uv: 0,
      leadCount: 0,
      todayShareCount: 0,
      todayPv: 0,
      todayUv: 0,
      todayLeadCount: 0,
    },
    items: [],
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
    loading: false,
    loadingMore: false,
    noMore: false,
    empty: false,
    subscribeTemplateId: "",
    showSubscribePrompt: false,
  },

  onLoad() {
    // 订阅模板配置与首屏数据互不依赖，各自动发起
    this.loadSubscribeTemplate();
    this.loadAll();
  },

  onShow() {
    if (this.initialLoaded) {
      // 返回本页（如从详情流转后返回）：静默刷新统计与列表
      this.loadAll(true);
      return;
    }
    this.initialLoaded = true;
    if (!this.hasToken()) {
      // 游客：不发请求，直接展示空态
      this.setData({ empty: true });
    }
  },

  hasToken() {
    return !!getCAccessToken() || !!getAccessToken();
  },

  /** 并行加载统计与第 1 页列表（统计与列表互不依赖，消除请求瀑布）. */
  async loadAll(silent = false) {
    if (!this.hasToken()) {
      this.setData({ empty: true, loading: false, loadingMore: false });
      return;
    }
    if (!silent && this.data.items.length === 0) {
      this.setData({ loading: true });
    }
    await Promise.all([this.loadStats(), this.loadLeads(true, true)]);
    const { stats, items, total } = this.data;
    const allZero =
      stats.shareCount === 0 && stats.pv === 0 && stats.uv === 0 && stats.leadCount === 0;
    // 累计漏斗全零且列表空 → 整页空态；有数据但当前筛选无结果 → 保留统计卡 + 行内空态
    this.setData({
      loading: false,
      empty: allZero && items.length === 0 && total === 0,
    });
  },

  /** 漏斗统计；失败（401/网络）保持 0，由 loadAll 统一判定空态. */
  async loadStats() {
    try {
      const res = await request<MyCustomerShareStatsResponse>({
        url: "/public/customers/my/share-stats",
      });
      this.setData({
        stats: {
          shareCount: res.share_count || 0,
          pv: res.pv || 0,
          uv: res.uv || 0,
          leadCount: res.lead_count || 0,
          todayShareCount: res.today_share_count || 0,
          todayPv: res.today_pv || 0,
          todayUv: res.today_uv || 0,
          todayLeadCount: res.today_lead_count || 0,
        },
      });
    } catch {
      // 401（无 C 端身份）/网络异常：静默
    }
  },

  /** 订阅模板配置：template_id 为 null 或本地已授权 → 隐藏提示条. */
  async loadSubscribeTemplate() {
    try {
      const res = await request<MyCustomerSubscribeTemplateResponse>({
        url: "/public/customers/my/subscribe-template",
      });
      const granted = wx.getStorageSync(SUBSCRIBE_GRANTED_KEY) === true;
      const templateId = res.template_id || "";
      this.setData({ subscribeTemplateId: templateId, showSubscribePrompt: !!templateId && !granted });
    } catch {
      // 拉取失败：静默隐藏提示条
    }
  },

  /** 客户列表分页加载；reset=重置第 1 页（筛选切换/刷新），否则追加下一页. */
  async loadLeads(reset = false, silent = false) {
    if (reset && !silent) {
      this.setData({ loading: true });
    } else if (!reset) {
      this.setData({ loadingMore: true });
    }
    const { activeStatus, pageSize } = this.data;
    const page = reset ? 1 : this.data.page;
    try {
      const res = await request<MyCustomerListResponse>({
        url: "/public/customers/my",
        data: {
          page,
          page_size: pageSize,
          ...(this.data.activeModule ? { module: this.data.activeModule } : {}),
          ...(activeStatus ? { status: activeStatus } : {}),
        },
      });
      const newItems = (res.items || []).map((it) => toDisplayItem(it));
      const merged = reset ? newItems : [...this.data.items, ...newItems];
      const total = res.total || 0;
      // module_counts/status_counts 为该用户全部线索口径，随列表响应刷新 tabs/chips 计数
      const moduleCounts = res.module_counts || {};
      const statusCounts = res.status_counts || {};
      this.setData({
        items: merged,
        total,
        page,
        noMore: merged.length >= total,
        loading: false,
        loadingMore: false,
        moduleTabs: MODULE_TABS.map((tab) => ({
          ...tab,
          count:
            tab.value === ""
              ? Object.values(moduleCounts).reduce((sum, n) => sum + (n || 0), 0)
              : moduleCounts[tab.value] || 0,
        })),
        statusChips: STATUS_CHIPS.map((chip) => ({
          ...chip,
          count: chip.value === "" ? -1 : statusCounts[chip.value] || 0,
        })),
      });
    } catch (err) {
      const statusCode = (err as HttpResponseError).statusCode;
      this.setData({ loading: false, loadingMore: false });
      if (statusCode === HTTP_UNAUTHORIZED || statusCode === HTTP_FORBIDDEN) {
        // 401（未登录/无 C 端身份）或 403（无获客权限）：空态兜底，不清登录态、不报错
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

  /** 模块 tab 切换：重置第 1 页（counts 随列表响应一起刷新）. */
  onModuleTap(e: WechatMiniprogram.BaseEvent) {
    const value = String(e.currentTarget.dataset.value ?? "");
    if (value === this.data.activeModule) {
      return;
    }
    this.setData({ activeModule: value, page: 1 });
    this.loadLeads(true);
  },

  /** 统一状态 chip 切换：重置第 1 页. */
  onStatusChipTap(e: WechatMiniprogram.BaseEvent) {
    const value = String(e.currentTarget.dataset.value ?? "");
    if (value === this.data.activeStatus) {
      return;
    }
    this.setData({ activeStatus: value, page: 1 });
    this.loadLeads(true);
  },

  /**
   * 「联系客户/再次联系」：拉取完整手机号并按响应最新统一状态就地刷新卡片
   * （招募/预约线后端查看即 new→contacted 隐式流转）；已查看过则直接拨打.
   */
  async onContactTap(e: WechatMiniprogram.BaseEvent) {
    const id = String(e.currentTarget.dataset.id ?? "");
    const module = String(e.currentTarget.dataset.module ?? "");
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
      const res = await request<MyCustomerPhoneResponse>({
        url: `/public/customers/my/${encodeURIComponent(module)}/${encodeURIComponent(id)}/phone`,
      });
      if (res.phone) {
        const meta = STATUS_META[res.unified_status];
        const actions = ACTION_BY_STATUS[res.unified_status];
        // 就地刷新：完整号码 + 最新状态标签（booking 按模块映射）+ 按最新状态重算操作按钮组
        this.setData({
          [`items[${idx}].phoneFull`]: res.phone,
          [`items[${idx}].statusValue`]: res.unified_status,
          [`items[${idx}].statusText`]: statusLabel(res.unified_status, item.module),
          [`items[${idx}].statusClass`]: meta.cls,
          [`items[${idx}].primaryText`]: actions.primaryText,
          [`items[${idx}].flowText`]: actions.flowText,
          [`items[${idx}].viewText`]: actions.viewText,
        });
        this.dial(res.phone);
      } else {
        wx.showToast({ title: "未提供联系方式", icon: "none" });
      }
    } catch (err) {
      const statusCode = (err as HttpResponseError).statusCode;
      if (statusCode === HTTP_UNAUTHORIZED || statusCode === HTTP_FORBIDDEN) {
        // 401/403 与列表口径一致：静默
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

  /** 卡片主体/「查看详情」：进入客户详情页. */
  onCardTap(e: WechatMiniprogram.BaseEvent) {
    const module = String(e.currentTarget.dataset.module ?? "");
    const id = String(e.currentTarget.dataset.id ?? "");
    wx.navigateTo({
      url: `/pages/customers/detail/index?module=${encodeURIComponent(module)}&id=${encodeURIComponent(id)}`,
    });
  },

  /** 「状态流转」：进入详情页并自动打开流转面板. */
  onFlowTap(e: WechatMiniprogram.BaseEvent) {
    const module = String(e.currentTarget.dataset.module ?? "");
    const id = String(e.currentTarget.dataset.id ?? "");
    wx.navigateTo({
      url: `/pages/customers/detail/index?module=${encodeURIComponent(module)}&id=${encodeURIComponent(id)}&openFlow=1`,
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

  /** 整页空态「去分享获客」：切回「我的」tab 分享获客分组. */
  onGoShare() {
    wx.switchTab({ url: "/pages/profile/index/index" });
  },

  /** 整页空态「查看状态流转规则」：进入状态流转规则页. */
  onGoRules() {
    wx.navigateTo({ url: "/pages/customers/rules/index" });
  },

  /**
   * 开启订阅提醒：必须在 tap 手势回调内同步调 wx.requestSubscribeMessage（不可包 async/await）.
   * accept → 隐藏提示条+toast+写本地标记；ban → 引导去设置开启订阅消息；其余静默.
   */
  onSubscribeTap() {
    const templateId = this.data.subscribeTemplateId;
    if (!templateId) {
      return;
    }
    wx.requestSubscribeMessage({
      tmplIds: [templateId],
      success: (res) => {
        const status = res[templateId];
        if (status === "accept") {
          wx.setStorageSync(SUBSCRIBE_GRANTED_KEY, true);
          this.setData({ showSubscribePrompt: false });
          wx.showToast({ title: "已开启提醒", icon: "success" });
          return;
        }
        if (status === "ban") {
          wx.showModal({
            title: "无法开启提醒",
            content: "您此前选择了总是拒收订阅消息，请在设置中开启「订阅消息」后重试",
            confirmText: "去设置",
            success: (modalRes) => {
              if (modalRes.confirm) {
                wx.openSetting({});
              }
            },
          });
        }
        // reject/filter：静默
      },
      fail: () => {},
    });
  },
});
