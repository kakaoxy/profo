import { request } from "../../../utils/request";
import { resolveAssetUrl } from "../../../utils/url";

/** 每页数量. */
const PAGE_SIZE = 10;

/** 价格区间预设（单位：万）. */
const PRICE_OPTIONS = [
  { key: "", label: "不限" },
  { key: "lt50", label: "50万以下", max: 50 },
  { key: "50-100", label: "50-100万", min: 50, max: 100 },
  { key: "100-200", label: "100-200万", min: 100, max: 200 },
  { key: "200-300", label: "200-300万", min: 200, max: 300 },
  { key: "300-500", label: "300-500万", min: 300, max: 500 },
  { key: "gt500", label: "500万以上", min: 500 },
];

/** 面积区间预设（单位：㎡）. */
const AREA_OPTIONS = [
  { key: "", label: "不限" },
  { key: "lt50", label: "50㎡以下", max: 50 },
  { key: "50-80", label: "50-80㎡", min: 50, max: 80 },
  { key: "80-120", label: "80-120㎡", min: 80, max: 120 },
  { key: "120-150", label: "120-150㎡", min: 120, max: 150 },
  { key: "gt150", label: "150㎡以上", min: 150 },
];

/** 户型选项（前缀匹配，如「2室」命中「2室1厅1卫」）. */
const LAYOUT_OPTIONS = [
  { key: "", label: "不限" },
  { key: "1室", label: "一室" },
  { key: "2室", label: "两室" },
  { key: "3室", label: "三室" },
  { key: "4室", label: "四室" },
];

/** 根据 key 查 RangeOption label. */
function labelOf(options, key, fallback) {
  if (!key) return fallback;
  return options.find((o) => o.key === key)?.label ?? fallback;
}

Page({
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
    // 筛选值（已生效）
    keyword: "",
    priceKey: "",
    areaKey: "",
    layoutKey: "",
    floorMin: "",
    floorMax: "",
    // UI 状态
    searchValue: "",
    activeFilter: "",
    // pill 标签
    priceLabel: "价格",
    areaLabel: "面积",
    layoutLabel: "户型",
    floorLabel: "楼层",
    // 选项数据
    priceOptions: PRICE_OPTIONS,
    areaOptions: AREA_OPTIONS,
    layoutOptions: LAYOUT_OPTIONS,
  },
  onLoad() {
    this.loadList(true);
  },
  onStatusTabChange(e) {
    const tab = e.currentTarget.dataset.tab;
    if (!tab || tab === this.data.tab) {
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
  toDisplay(item, tab) {
    const community = item.community_name || "";
    const layout = item.layout;
    if (tab === "sold") {
      return {
        id: item.id,
        title: item.title,
        desc: community + " · " + layout,
        area: item.area + "㎡",
        total_price: item.total_price,
        cover_thumbnail_url: resolveAssetUrl(item.cover_thumbnail_url),
        cover_image: resolveAssetUrl(item.cover_image),
        tags: [],
        badgeText: "过往案例",
        badgeClass: "badge-fog",
      };
    }
    // on_sale / renovating / all 共用描述格式
    const desc = community + " · " + layout + " · " + item.orientation + " · " + item.floor_info;
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
      const status = item.project_status;
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
    return {
      id: item.id,
      title: item.title,
      desc,
      area: item.area + "㎡",
      total_price: item.total_price,
      cover_thumbnail_url: resolveAssetUrl(item.cover_thumbnail_url),
      cover_image: resolveAssetUrl(item.cover_image),
      tags: item.tags,
      badgeText,
      badgeClass,
    };
  },
  /** 把当前筛选值转换为后端 query 参数. */
  buildQueryParams() {
    const params = {
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
      let response;
      if (tab === "sold") {
        response = await request({
          url: "/public/projects/sold",
          data,
        });
      } else {
        response = await request({
          url: "/public/projects",
          data,
        });
      }
      const rawItems = response.items;
      const total = response.total;
      const newItems = rawItems.map((it) => this.toDisplay(it, tab));
      const merged = reset ? newItems : [...this.data.items, ...newItems];
      this.setData({
        items: merged,
        total,
        noMore: merged.length >= total,
      });
    } catch {
      if (reset) {
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
  onSearchInput(e) {
    this.setData({ searchValue: e.detail.value });
  },
  onSearchConfirm() {
    const kw = this.data.searchValue.trim();
    this.setData({ keyword: kw, items: [], page: 1, total: 0, noMore: false });
    this.loadList(true);
  },
  // ===== 筛选 pill =====
  onFilterPillTap(e) {
    const key = e.currentTarget.dataset.key;
    // 再次点击同一 pill 收起
    this.setData({ activeFilter: this.data.activeFilter === key ? "" : key });
  },
  onFilterMaskTap() {
    this.setData({ activeFilter: "" });
  },
  /** 价格/户型/面积 选项点击：单选即生效. */
  onFilterOptionTap(e) {
    const { filter, key } = e.currentTarget.dataset;
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
  onFloorMinInput(e) {
    this.setData({ floorMin: e.detail.value });
  },
  onFloorMaxInput(e) {
    this.setData({ floorMax: e.detail.value });
  },
  onFloorConfirm() {
    const min = this.data.floorMin.trim();
    const max = this.data.floorMax.trim();
    let label = "楼层";
    if (min || max) {
      label = (min || "0") + "-" + (max || "∞") + "层";
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
  onItemTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: "/pages/projects/detail/index?id=" + id });
  },
  onRetry() {
    this.loadList(true);
  },
});
