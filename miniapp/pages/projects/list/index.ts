import type { components } from "../../../types/api-types";
import { request } from "../../../utils/request";
import { resolveImageUrl } from "../../../utils/url";
import { getCAccessToken } from "../../../utils/token";
import { consumeProjectListPendingTab } from "../../../utils/project-list-tab";
import { animateServedCount, clearServedCountTimer, loadServedCount } from "../../../utils/served-count";
import {
  fetchMarketingSubscribeTemplates,
  fetchMarketingSubscriptionStatus,
  requestMarketingSubscribe,
  type MarketingSubscribeTemplates,
  type MarketingSubscriptionStatus,
} from "../../../utils/marketing-notify";

/** 在售房源列表项. */
type OnSaleItem = components["schemas"]["PublicProjectListItem"];
/** 已成交房源列表项. */
type SoldItem = components["schemas"]["PublicSoldProjectItem"];

/** 状态 tab. */
type Tab = "all" | "on_sale" | "renovating" | "sold";

/** 列表项展示用统一结构. */
interface DisplayItem {
  id: number;
  title: string;
  desc: string;
  area: string;
  total_price: number;
  cover_thumbnail_url?: string | null;
  cover_image?: string | null;
  tags?: string[];
  badgeText: string;
  badgeClass: string;
  /** 新上黑标（发布 ≤ 7 天，依后端 is_new_listing） */
  isNew: boolean;
  /** 调价行（最近一次调价 ≤ 7 天，依后端 latest_price_change） */
  changeText: string;
  changeClass: string;
  changeMeta: string;
}

/** 每页数量. */
const PAGE_SIZE = 10;

/** 列表响应. */
interface ListResponse {
  items: OnSaleItem[] | SoldItem[];
  total: number;
  page: number;
  page_size: number;
}

/** 区间选项：min/max 任一为空表示单侧开放. */
interface RangeOption {
  key: string;
  label: string;
  min?: number;
  max?: number;
}

/** 价格区间预设（单位：万）. */
const PRICE_OPTIONS: RangeOption[] = [
  { key: "", label: "不限" },
  { key: "lt50", label: "50万以下", max: 50 },
  { key: "50-100", label: "50-100万", min: 50, max: 100 },
  { key: "100-200", label: "100-200万", min: 100, max: 200 },
  { key: "200-300", label: "200-300万", min: 200, max: 300 },
  { key: "300-500", label: "300-500万", min: 300, max: 500 },
  { key: "gt500", label: "500万以上", min: 500 },
];

/** 面积区间预设（单位：㎡）. */
const AREA_OPTIONS: RangeOption[] = [
  { key: "", label: "不限" },
  { key: "lt50", label: "50㎡以下", max: 50 },
  { key: "50-80", label: "50-80㎡", min: 50, max: 80 },
  { key: "80-120", label: "80-120㎡", min: 80, max: 120 },
  { key: "120-150", label: "120-150㎡", min: 120, max: 150 },
  { key: "gt150", label: "150㎡以上", min: 150 },
];

/** 户型选项（前缀匹配，如「2室」命中「2室1厅1卫」）. */
const LAYOUT_OPTIONS: RangeOption[] = [
  { key: "", label: "不限" },
  { key: "1室", label: "一室" },
  { key: "2室", label: "两室" },
  { key: "3室", label: "三室" },
  { key: "4室", label: "四室" },
];

/** 筛选 pill 标识. */
type FilterKey = "" | "price" | "layout" | "area" | "floor";

/** 页面 data. */
interface PageData {
  tab: Tab;
  items: DisplayItem[];
  page: number;
  pageSize: number;
  total: number;
  loading: boolean;
  loadingMore: boolean;
  error: boolean;
  noMore: boolean;
  // 筛选值（已生效）
  keyword: string;
  priceKey: string;
  areaKey: string;
  layoutKey: string;
  floorMin: string;
  floorMax: string;
  // UI 状态
  searchValue: string;
  activeFilter: FilterKey;
  // pill 标签
  priceLabel: string;
  areaLabel: string;
  layoutLabel: string;
  floorLabel: string;
  // 选项数据
  priceOptions: RangeOption[];
  areaOptions: RangeOption[];
  layoutOptions: RangeOption[];
  // 累计服务人数标签
  servedCountTotal: number;
  servedCountDisplay: string;
  servedCountLoading: boolean;
  servedCountVisible: boolean;
  // 订阅提醒（模板均未配置时入口整体隐藏）
  subscribeEnabled: boolean;
  /** 空串=未订阅；"on"=已订阅有额度；"expired"=额度耗尽待续订 */
  subscribeState: "" | "on" | "expired";
  /** 两频道剩余额度合计（列表页按钮角标展示） */
  subscribeQuota: number;
  /**
   * 未登录 accept 后待登录生效标记（与 subscribeState 正交）。
   * 未登录时服务端无额度可查，若仅置 state="on" 会渲染出「已订阅 · 可收 0 条」
   * 的自相矛盾文案（按钮反白像已生效、额度却是 0），因此单独标记并改用
   * 「已授权 · 登录后生效」文案，不虚假宣称可收条数。
   */
  subscribePendingLogin: boolean;
  // 订阅弹层
  sheetVisible: boolean;
  sheetNewQuota: number;
  sheetPriceQuota: number;
}

/** 页面自定义方法. */
interface PageCustom {
  loadList(reset?: boolean): void;
  toDisplay(item: OnSaleItem | SoldItem, tab: Tab): DisplayItem;
  buildQueryParams(): Record<string, string | number>;
  onShow(): void;
  onStatusTabChange(e: WechatMiniprogram.BaseEvent): void;
  switchToTab(tab: Tab): void;
  onSearchInput(e: WechatMiniprogram.Input): void;
  onSearchConfirm(): void;
  onFilterPillTap(e: WechatMiniprogram.BaseEvent): void;
  onFilterOptionTap(e: WechatMiniprogram.BaseEvent): void;
  onFloorMinInput(e: WechatMiniprogram.Input): void;
  onFloorMaxInput(e: WechatMiniprogram.Input): void;
  onFloorConfirm(): void;
  onFloorReset(): void;
  resetAllFilters(): void;
  onItemTap(e: WechatMiniprogram.BaseEvent): void;
  onRetry(): void;
  onServedTagTap(): void;
  loadServedCount(): void;
  animateServedCount(target: number): void;
  clearServedCountTimer(): void;
  servedCountTimer: ReturnType<typeof setInterval> | null;
  /** 拉取订阅功能开关与额度状态（onLoad/onShow 刷新） */
  loadSubscribeState(): void;
  /** 计数行铃铛 tap：打开订阅弹层 */
  onNotifyTap(): void;
  /** 弹层「开启提醒」：tap 手势内同步发起 requestSubscribeMessage */
  onSubscribeConfirm(): void;
  /** 弹层关闭 */
  onSubscribeClose(): void;
  /** 登录返回后补报：重开弹层由用户再点「开启提醒」上报（需重新授权，避免旧结果过期） */
  resumeSubscribeAfterLogin(): void;
  /** 弹层内容区阻止冒泡空实现（catchtap 绑定） */
  noop(): void;
  /** 授权结果应用：toast 已由 notify 工具弹出，这里刷新额度状态 */
  applySubscribeResult(quotas: MarketingSubscriptionStatus | null): void;
  /** 请求时代戳：每次 reset 加载（切 tab/搜索/筛选）+1，用于丢弃晚到的旧代翻页响应（竞态守卫） */
  _epoch: number;
  /** 订阅模板 ID 对（内存态，不进 data） */
  _subscribeTemplates: MarketingSubscribeTemplates | null;
  /** 未登录时 accept 后待补报的模板对（登录返回后补报） */
  _pendingSubscribeReport: MarketingSubscribeTemplates | null;
}

/** 根据 key 查 RangeOption label. */
function labelOf(options: RangeOption[], key: string, fallback: string): string {
  if (!key) return fallback;
  return options.find((o) => o.key === key)?.label ?? fallback;
}

Page<PageData, PageCustom>({
  data: {
    tab: "all",
    items: [],
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
    loading: false,
    loadingMore: false,
    error: false,
    noMore: false,
    keyword: "",
    priceKey: "",
    areaKey: "",
    layoutKey: "",
    floorMin: "",
    floorMax: "",
    searchValue: "",
    activeFilter: "",
    priceLabel: "价格",
    areaLabel: "面积",
    layoutLabel: "户型",
    floorLabel: "楼层",
    priceOptions: PRICE_OPTIONS,
    areaOptions: AREA_OPTIONS,
    layoutOptions: LAYOUT_OPTIONS,
    servedCountTotal: 0,
    servedCountDisplay: "0",
    servedCountLoading: false,
    servedCountVisible: true,
    // 订阅提醒：默认关闭（模板未配置/未拉取到时入口隐藏）
    subscribeEnabled: false,
    subscribeState: "",
    subscribeQuota: 0,
    subscribePendingLogin: false,
    sheetVisible: false,
    sheetNewQuota: 0,
    sheetPriceQuota: 0,
  },
  servedCountTimer: null,
  _epoch: 0,
  _subscribeTemplates: null,
  _pendingSubscribeReport: null,
  onLoad() {
    this.loadList(true);
    this.loadServedCount();
    this.loadSubscribeState();
  },
  onShow() {
    // 消费其它 tabBar 页（服务页等）写入的待切换 tab
    const pending = consumeProjectListPendingTab();
    if (pending === "sold") {
      this.switchToTab("sold");
    }
    // 推送消耗额度发生在服务端：每次回前台刷新额度状态
    if (this.data.subscribeEnabled) {
      this.loadSubscribeState();
    }
    // 登录返回（from=subscribe）：重开弹层补报订阅授权
    this.resumeSubscribeAfterLogin();
  },
  onUnload() {
    this.clearServedCountTimer();
  },
  onStatusTabChange(e: WechatMiniprogram.BaseEvent) {
    const tab = e.currentTarget.dataset.tab as Tab;
    if (!tab) {
      return;
    }
    this.switchToTab(tab);
  },
  /** 切换状态 tab：清空所有筛选 + 关闭搜索/下拉，重新加载. */
  switchToTab(tab: Tab) {
    if (tab === this.data.tab) {
      return;
    }
    // 切 tab 清空所有筛选 + 关闭搜索/下拉，避免 sold tab 不支持的筛选残留造成困惑
    this.setData({
      tab,
      items: [],
      page: 1,
      total: 0,
      error: false,
      noMore: false,
      keyword: "",
      priceKey: "",
      areaKey: "",
      layoutKey: "",
      floorMin: "",
      floorMax: "",
      searchValue: "",
      activeFilter: "",
      priceLabel: "价格",
      areaLabel: "面积",
      layoutLabel: "户型",
      floorLabel: "楼层",
    });
    this.loadList(true);
  },
  toDisplay(item: OnSaleItem | SoldItem, tab: Tab): DisplayItem {
    const community = item.community_name || "";
    const layout = item.layout;
    if (tab === "sold") {
      return {
        id: item.id,
        title: item.title,
        desc: `${community} · ${layout}`,
        area: `${item.area}㎡`,
        total_price: item.total_price,
        cover_thumbnail_url: resolveImageUrl(item.cover_thumbnail_url),
        cover_image: resolveImageUrl(item.cover_image),
        tags: [],
        badgeText: "过往案例",
        badgeClass: "badge-fog",
        isNew: false,
        changeText: "",
        changeClass: "",
        changeMeta: "",
      };
    }
    // on_sale / renovating / all 共用描述格式
    const onSale = item as OnSaleItem;
    const desc = `${community} · ${layout} · ${onSale.orientation} · ${onSale.floor_info}`;
    let badgeText = "";
    let badgeClass = "";
    if (tab === "on_sale") {
      badgeText = "在售";
      badgeClass = "badge-apricot";
    } else if (tab === "renovating") {
      badgeText = "装修中";
      badgeClass = "badge-sky";
    } else {
      // all：按 project_status 映射
      const status = onSale.project_status;
      if (status === "在售") {
        badgeText = "在售";
        badgeClass = "badge-apricot";
      } else if (status === "在途") {
        badgeText = "装修中";
        badgeClass = "badge-sky";
      } else if (status === "已售") {
        badgeText = "过往案例";
        badgeClass = "badge-fog";
      }
    }
    // 调价行（后端 7 天窗口内才下发）：降价营销文案（绿 chip），涨价中性文案（灰 chip）
    let changeText = "";
    let changeClass = "";
    let changeMeta = "";
    const change = onSale.latest_price_change;
    if (change) {
      // 差价文案：后端价为 Numeric(12,2)，最小真实差价是 0.01 万。按 0.01 万**四舍五入**
      // 去尾零（不能用 floor：246.00→245.99 的二进制浮点差为 0.00999…，floor 会归 0
      // 而吞掉一笔真实降价）；仅当差价确实不足半分钱时回退中性文案，
      // 避免出现旧实现 Math.round(diff) 把 0.5 万显示成「直降 0 万」的假象。
      const diff = Math.abs(change.new_price - change.old_price);
      const diffWan = Math.round(diff * 100) / 100;
      if (change.direction === "down") {
        changeText = diffWan > 0 ? `↓ 直降 ${diffWan} 万` : "↓ 价格已下调";
        changeClass = "change-down";
      } else {
        changeText = "↑ 价格已更新";
        changeClass = "change-up";
      }
      const changedDate = change.changed_at.slice(5, 10).replace("-", "/");
      changeMeta = `原价 ${change.old_price} 万 · ${changedDate} 调整`;
    }
    return {
      id: onSale.id,
      title: onSale.title,
      desc,
      area: `${onSale.area}㎡`,
      total_price: onSale.total_price,
      cover_thumbnail_url: resolveImageUrl(onSale.cover_thumbnail_url),
      cover_image: resolveImageUrl(onSale.cover_image),
      tags: onSale.tags,
      badgeText,
      badgeClass,
      isNew: !!onSale.is_new_listing,
      changeText,
      changeClass,
      changeMeta,
    };
  },
  /** 把当前筛选值转换为后端 query 参数. */
  buildQueryParams(): Record<string, string | number> {
    const params: Record<string, string | number> = {
      page: this.data.page,
      page_size: this.data.pageSize,
    };
    const tab = this.data.tab;
    if (tab === "renovating") {
      params.project_status = "在途";
    } else if (tab === "on_sale") {
      params.project_status = "在售";
    }
    if (this.data.keyword) {
      params.keyword = this.data.keyword;
    }
    // sold tab 后端仅支持 keyword + 楼层，其他筛选不传
    if (tab !== "sold") {
      if (this.data.layoutKey) {
        params.layout = this.data.layoutKey;
      }
      const price = PRICE_OPTIONS.find((o) => o.key === this.data.priceKey);
      if (price) {
        if (price.min !== undefined) params.min_price = price.min;
        if (price.max !== undefined) params.max_price = price.max;
      }
      const area = AREA_OPTIONS.find((o) => o.key === this.data.areaKey);
      if (area) {
        if (area.min !== undefined) params.min_area = area.min;
        if (area.max !== undefined) params.max_area = area.max;
      }
    }
    // 楼层两个 tab 都支持
    if (this.data.floorMin) {
      const n = Number(this.data.floorMin);
      if (Number.isFinite(n) && n > 0) params.min_floor = Math.floor(n);
    }
    if (this.data.floorMax) {
      const n = Number(this.data.floorMax);
      if (Number.isFinite(n) && n > 0) params.max_floor = Math.floor(n);
    }
    return params;
  },
  async loadList(reset = false) {
    // epoch 守卫：切 tab/搜索/筛选等 reset 加载使旧代请求失效，防止晚到响应污染新列表
    if (reset) {
      this._epoch += 1;
    }
    const myEpoch = this._epoch;
    if (reset) {
      this.setData({ loading: true, error: false, noMore: false });
    } else {
      this.setData({ loadingMore: true });
    }
    try {
      const tab = this.data.tab;
      const data = this.buildQueryParams();
      // reset 时强制 page=1
      if (reset) data.page = 1;
      let response: ListResponse;
      if (tab === "sold") {
        response = await request<{ items: SoldItem[]; total: number; page: number; page_size: number }>({
          url: "/public/projects/sold",
          data,
          skipAuth: true,
        });
      } else {
        response = await request<{ items: OnSaleItem[]; total: number; page: number; page_size: number }>({
          url: "/public/projects",
          data,
          skipAuth: true,
        });
      }
      const rawItems: OnSaleItem[] | SoldItem[] = response.items;
      const total = response.total;
      if (myEpoch !== this._epoch) {
        // 请求已过期（期间发生了新的 reset 加载），整体丢弃，不触碰当前状态
        return;
      }
      const newItems: DisplayItem[] = rawItems.map((it) =>
        this.toDisplay(it as OnSaleItem | SoldItem, tab)
      );
      if (reset) {
        this.setData({
          items: newItems,
          total,
          noMore: newItems.length >= total,
        });
      } else {
        // 翻页追加：索引路径局部 setData，payload 不随累计页数增长（P-05）
        const patch: Record<string, unknown> = {
          total,
          noMore: this.data.items.length + newItems.length >= total,
        };
        const base = this.data.items.length;
        newItems.forEach((it, i) => {
          patch[`items[${base + i}]`] = it;
        });
        this.setData(patch);
      }
    } catch {
      if (myEpoch !== this._epoch) {
        // 过期请求的失败不回滚页码、不弹 toast，避免干扰新一代请求的状态
        return;
      }
      if (reset) {
        this.setData({ error: true, items: [] });
      } else {
        // 翻页失败：回滚页码并重置 noMore，避免下次触底被 noMore 拦截跳过本页（弱网下不丢数据）；loadingMore 由 finally 统一恢复
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
    if (this.data.loading || this.data.loadingMore) {
      return;
    }
    if (this.data.noMore) {
      return;
    }
    this.setData({ page: this.data.page + 1 });
    this.loadList(false);
  },
  // ===== 搜索框 =====
  onSearchInput(e: WechatMiniprogram.Input) {
    this.setData({ searchValue: e.detail.value });
  },
  onSearchConfirm() {
    const kw = this.data.searchValue.trim();
    this.setData({ keyword: kw, items: [], page: 1, total: 0, noMore: false });
    this.loadList(true);
  },
  // ===== 筛选 pill =====
  onFilterPillTap(e: WechatMiniprogram.BaseEvent) {
    const key = e.currentTarget.dataset.key as FilterKey;
    // 再次点击同一 pill 收起
    this.setData({ activeFilter: this.data.activeFilter === key ? "" : key });
  },
  /** 价格/户型/面积 选项点击：单选即生效. */
  onFilterOptionTap(e: WechatMiniprogram.BaseEvent) {
    const { filter, key } = e.currentTarget.dataset as { filter: string; key: string };
    if (filter === "price") {
      this.setData({
        priceKey: key,
        priceLabel: labelOf(PRICE_OPTIONS, key, "价格"),
        activeFilter: "",
        items: [],
        page: 1,
        total: 0,
        noMore: false,
      });
    } else if (filter === "area") {
      this.setData({
        areaKey: key,
        areaLabel: labelOf(AREA_OPTIONS, key, "面积"),
        activeFilter: "",
        items: [],
        page: 1,
        total: 0,
        noMore: false,
      });
    } else if (filter === "layout") {
      this.setData({
        layoutKey: key,
        layoutLabel: labelOf(LAYOUT_OPTIONS, key, "户型"),
        activeFilter: "",
        items: [],
        page: 1,
        total: 0,
        noMore: false,
      });
    } else {
      return;
    }
    this.loadList(true);
  },
  // ===== 楼层输入 =====
  onFloorMinInput(e: WechatMiniprogram.Input) {
    this.setData({ floorMin: e.detail.value });
  },
  onFloorMaxInput(e: WechatMiniprogram.Input) {
    this.setData({ floorMax: e.detail.value });
  },
  onFloorConfirm() {
    const min = this.data.floorMin.trim();
    const max = this.data.floorMax.trim();
    let label = "楼层";
    if (min || max) {
      label = `${min || "0"}-${max || "∞"}层`;
    }
    this.setData({
      floorLabel: label,
      activeFilter: "",
      items: [],
      page: 1,
      total: 0,
      noMore: false,
    });
    this.loadList(true);
  },
  onFloorReset() {
    this.setData({ floorMin: "", floorMax: "", floorLabel: "楼层" });
  },
  resetAllFilters() {
    this.setData({
      keyword: "",
      priceKey: "",
      areaKey: "",
      layoutKey: "",
      floorMin: "",
      floorMax: "",
      searchValue: "",
      priceLabel: "价格",
      areaLabel: "面积",
      layoutLabel: "户型",
      floorLabel: "楼层",
      activeFilter: "",
      items: [],
      page: 1,
      total: 0,
      noMore: false,
    });
    this.loadList(true);
  },
  onItemTap(e: WechatMiniprogram.BaseEvent) {
    const id = e.currentTarget.dataset.id as number;
    wx.navigateTo({ url: `/pages/projects/detail/index?id=${id}` });
  },
  onRetry() {
    this.loadList(true);
  },
  /** 累计服务标签点击：本页已在房源列表，直接切到过往案例. */
  onServedTagTap() {
    this.switchToTab("sold");
  },
  /** 拉取平台统计 total_sold（公开接口，skipAuth），成功后从 0 缓动. */
  async loadServedCount() {
    return loadServedCount(this);
  },
  /** 从 0 缓动到 target（约 1.2s ease-out）. */
  animateServedCount(target: number) {
    return animateServedCount(this, target);
  },
  clearServedCountTimer() {
    return clearServedCountTimer(this);
  },
  /**
   * 拉取订阅开关与额度状态.
   * 模板均未配置（subscribe_enabled=false）时入口整体隐藏；
   * 拉到额度后同步弹层展示值（弹层下次打开时已最新）。
   */
  async loadSubscribeState() {
    const templates = await fetchMarketingSubscribeTemplates();
    this._subscribeTemplates = templates;
    if (!templates) {
      this.setData({ subscribeEnabled: false, subscribeState: "", subscribeQuota: 0 });
      return;
    }
    // 免登录入口也展示；未登录（无 c_access_token）时额度展示 0，
    // 点「开启提醒」授权成功后再补登录+补报（onSubscribeConfirm 内处理）
    const status = await fetchMarketingSubscriptionStatus();
    if (status === null) {
      // 未登录/查询失败：服务端额度不可知，同时清除「待登录生效」本地标记，
      // 避免停留在「已授权但未上报」的过期提示
      this.setData({
        subscribeEnabled: true,
        subscribeState: "expired",
        subscribeQuota: 0,
        subscribePendingLogin: false,
        sheetNewQuota: 0,
        sheetPriceQuota: 0,
      });
      return;
    }
    const newQuota = status.newListingQuota;
    const priceQuota = status.priceChangeQuota;
    const total = newQuota + priceQuota;
    this.setData({
      subscribeEnabled: true,
      subscribeState: total > 0 ? "on" : "expired",
      subscribeQuota: total,
      // 服务端已能查到额度：登录补报已生效（或本来就已上报过），清除待登录标记
      subscribePendingLogin: false,
      sheetNewQuota: newQuota,
      sheetPriceQuota: priceQuota,
    });
  },
  /** 计数行铃铛 tap：打开订阅弹层（同步展示当前额度）. */
  onNotifyTap() {
    if (!this.data.subscribeEnabled) {
      return;
    }
    // 打开前先刷新额度（推送消耗后进页面能看到最新值）
    this.loadSubscribeState();
    this.setData({ sheetVisible: true });
  },
  /**
   * 弹层「开启提醒」tap：在回调内同步发起 requestSubscribeMessage.
   * ⚠️ 不可包 async/await 之后再调（requestSubscribeMessage 手势同步限制）。
   */
  onSubscribeConfirm() {
    const templates = this._subscribeTemplates;
    if (!templates) {
      return;
    }
    // 未登录：不能先跳登录（会丢失 requestSubscribeMessage 手势同步窗口），
    // 仍同步拉起授权面板；授权 accept 后登录态缺失会导致上报 401，
    // 由 requestMarketingSubscribe 回调引导登录（from=subscribe）+ 登录返回后重开弹层补报
    const notLoggedIn = !getCAccessToken();
    requestMarketingSubscribe(templates, (status, quotas) => {
      // 已登录且上报成功：额度刷新 + 收起弹层
      if (quotas) {
        const total = quotas.newListingQuota + quotas.priceChangeQuota;
        this.setData({
          sheetNewQuota: quotas.newListingQuota,
          sheetPriceQuota: quotas.priceChangeQuota,
          subscribeState: total > 0 ? "on" : "expired",
          subscribeQuota: total,
        });
        this.setData({ sheetVisible: false });
        return;
      }
      // 未登录 + accept：授权结果已弹出但无法上报（未登录），不能谎称「可收 N 条」：
      // 服务端此时无任何额度（额度仅在 report 后才累计），所以下方状态刷新（onShow /
      // loadSubscribeState）会把额度拉回 0。改用 pendingLogin 标记走「已授权 · 登录后生效」
      // 文案，不虚报可收条数；引导登录（登录成功返回后 onShow 重开弹层补报）。
      if (notLoggedIn && status === "accept") {
        this.setData({
          subscribeState: "on",
          subscribePendingLogin: true,
          sheetVisible: false,
        });
        this._pendingSubscribeReport = templates;
        wx.showModal({
          title: "登录后生效",
          content: "订阅提醒需要登录后才能生效，是否立即登录？",
          confirmText: "去登录",
          success: (res) => {
            if (res.confirm) {
              wx.navigateTo({ url: "/pages/login/index/index?from=subscribe" });
            }
          },
        });
        return;
      }
      // 已登录但上报失败（网络异常等）：收起弹层，onShow 会重新拉额度
      this.setData({ sheetVisible: false });
    });
  },
  /** 弹层关闭（点遮罩/「暂不」）. */
  onSubscribeClose() {
    this.setData({ sheetVisible: false });
  },
  /** 登录返回后补报：重开弹层由用户再点「开启提醒」上报（需重新授权，避免旧结果过期） */
  resumeSubscribeAfterLogin() {
    if (!this._pendingSubscribeReport) {
      return;
    }
    this._pendingSubscribeReport = null;
    if (this.data.subscribeEnabled) {
      this.loadSubscribeState();
      this.setData({ sheetVisible: true });
    }
  },
  /** 弹层内容区空实现（catchtap 阻止冒泡到遮罩关闭）. */
  noop() {
    // 故意留空
  },
  /** 授权结果应用（保留接口位：当前状态刷新已内联在 onSubscribeConfirm）. */
  applySubscribeResult(quotas: MarketingSubscriptionStatus | null) {
    if (!quotas) {
      return;
    }
    const total = quotas.newListingQuota + quotas.priceChangeQuota;
    this.setData({
      subscribeState: total > 0 ? "on" : "expired",
      subscribeQuota: total,
    });
  },
});
