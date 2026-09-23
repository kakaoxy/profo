import type { components } from "../../../types/api-types";
import { request, getCacheData } from "../../../utils/request";
import { getFloorPlan } from "../../../utils/floor-plan";
import { resolveImageUrl, decodeQueryParam } from "../../../utils/url";

type PropertyResponse = components["schemas"]["PropertyResponse"];
type PaginatedPropertyResponse = components["schemas"]["PaginatedPropertyResponse"];

/** 状态 tab. */
type TabKey = "all" | "on_sale" | "sold";
/** 4 个筛选 chip 标识. */
type FilterKey = "" | "rooms" | "floor" | "sort";
/** 鉴权态：对话框外的列表级身份状态. */
type AuthState = "ok" | "unauthorized" | "forbidden";

/** 列表展示用统一结构（房源卡片字段映射）. */
interface DisplayProperty {
  id: number;
  communityName: string;
  statusText: string;
  statusClass: string;
  meta: string;
  totalPrice: number;
  unitPriceText: string;
  loc: string;
  /** 挂牌备注（已 trim；空串表示无备注，WXML 据此隐藏该行）. */
  remark: string;
  thumb: string;
}

/** 户型选项（value=5 表示 5 室以上，走 rooms_gte）. */
interface RoomOption {
  value: number;
  label: string;
}

/** 楼层选项. */
interface FloorOption {
  value: string;
  label: string;
}

/** 排序选项（key 对应后端 sort_by 白名单）. */
interface SortOption {
  key: string;
  label: string;
}

/** 户型面板展示项（selected 由 WXML 直接读取，避免绑定里调 indexOf）. */
interface RoomView {
  value: number;
  label: string;
  selected: boolean;
}

/** 楼层面板展示项. */
interface FloorView {
  value: string;
  label: string;
  selected: boolean;
}

/** 每页数量. */
const PAGE_SIZE = 20;

const ROOM_OPTIONS: RoomOption[] = [
  { value: 1, label: "1室" },
  { value: 2, label: "2室" },
  { value: 3, label: "3室" },
  { value: 4, label: "4室" },
  { value: 5, label: "5室+" },
];

const FLOOR_OPTIONS: FloorOption[] = [
  { value: "低楼层", label: "低楼层" },
  { value: "中楼层", label: "中楼层" },
  { value: "高楼层", label: "高楼层" },
];

const SORT_OPTIONS: SortOption[] = [
  { key: "timeline", label: "成交时间" },
  { key: "total_price", label: "总价" },
  { key: "unit_price", label: "单价" },
  { key: "build_area", label: "面积" },
];

/** 页面 data. */
interface PageData {
  tab: TabKey;
  items: DisplayProperty[];
  page: number;
  pageSize: number;
  total: number;
  loading: boolean;
  loadingMore: boolean;
  error: boolean;
  noMore: boolean;
  authState: AuthState;
  // 已生效筛选
  keyword: string;
  rooms: number[];
  roomsGte: boolean;
  floorLevels: string[];
  sortBy: string;
  sortOrder: "asc" | "desc";
  /** 排序是否已被用户显式选择（决定 chip 的 selected 态与文案）. */
  sortChosen: boolean;
  // UI 状态
  activeFilter: FilterKey;
  searchValue: string;
  roomLabel: string;
  floorLabel: string;
  sortLabel: string;
  // 面板草稿（未确认不生效）
  draftRooms: number[];
  draftRoomsGte: boolean;
  draftFloor: string[];
  // 选项数据（视图含 selected，供 WXML 直接读取）
  roomOptions: RoomOption[];
  floorOptions: FloorOption[];
  sortOptions: SortOption[];
  roomViews: RoomView[];
  floorViews: FloorView[];
}

/** 页面自定义方法. */
interface PageCustom {
  loadList(reset?: boolean): void;
  toDisplay(p: PropertyResponse): DisplayProperty;
  buildQueryParams(): Record<string, string | number>;
  buildCacheKey(): string;
  onStatusTabChange(e: WechatMiniprogram.BaseEvent): void;
  onFilterChipTap(e: WechatMiniprogram.BaseEvent): void;
  onMaskTap(): void;
  onRoomOptionTap(e: WechatMiniprogram.BaseEvent): void;
  onFloorOptionTap(e: WechatMiniprogram.BaseEvent): void;
  onPanelReset(): void;
  onPanelConfirm(): void;
  onSortItemTap(e: WechatMiniprogram.BaseEvent): void;
  onSearchInput(e: WechatMiniprogram.Input): void;
  onSearchConfirm(): void;
  onRetry(): void;
  onClearFilters(): void;
  onGoBack(): void;
  buildViews(
    draftRooms?: number[],
    draftRoomsGte?: boolean,
    draftFloor?: string[]
  ): { roomViews: RoomView[]; floorViews: FloorView[] };
}

/** 千分位格式化. */
function formatThousand(n: number): string {
  if (!Number.isFinite(n)) {
    return "0";
  }
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** 日期格式化为 yyyy/mm/dd（后端返回 ISO 日期，取前 10 位）. */
function formatDate(d: string | null | undefined): string {
  if (!d) {
    return "";
  }
  const dateStr = d.slice(0, 10);
  if (dateStr.length < 10) {
    return dateStr;
  }
  return dateStr.replace(/-/g, "/");
}

/** 户型 chip 文案：如「3室、5室+」. */
function buildRoomLabel(rooms: number[], roomsGte: boolean): string {
  const parts = rooms.map((r) => `${r}室`);
  if (roomsGte) {
    parts.push("5室+");
  }
  return parts.length ? parts.join("、") : "户型";
}

/** 户型面板视图（value=5 的选中取决于 draftRoomsGte）. */
function buildRoomViews(draftRooms: number[], draftRoomsGte: boolean): RoomView[] {
  return ROOM_OPTIONS.map((o) => ({
    value: o.value,
    label: o.label,
    selected: o.value === 5 ? draftRoomsGte : draftRooms.includes(o.value),
  }));
}

/** 楼层面板视图. */
function buildFloorViews(draftFloor: string[]): FloorView[] {
  return FLOOR_OPTIONS.map((o) => ({
    value: o.value,
    label: o.label,
    selected: draftFloor.includes(o.value),
  }));
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
    authState: "ok",
    keyword: "",
    rooms: [],
    roomsGte: false,
    floorLevels: [],
    sortBy: "timeline",
    sortOrder: "desc",
    sortChosen: false,
    activeFilter: "",
    searchValue: "",
    roomLabel: "户型",
    floorLabel: "楼层",
    sortLabel: "排序",
    draftRooms: [],
    draftRoomsGte: false,
    draftFloor: [],
    roomOptions: ROOM_OPTIONS,
    floorOptions: FLOOR_OPTIONS,
    sortOptions: SORT_OPTIONS,
    roomViews: buildRoomViews([], false),
    floorViews: buildFloorViews([]),
  },

  onLoad(query: Record<string, string | undefined>) {
    // 支持外部入口预填搜索词（如小区分析页「查看房源明细」跳转）
    const keyword = decodeQueryParam(query.keyword);
    if (keyword) {
      this.setData({ keyword, searchValue: keyword });
    }
    // 首屏加载房源列表
    this.loadList(true);
  },

  toDisplay(p: PropertyResponse): DisplayProperty {
    const isOnSale = p.status === "在售";
    const date = formatDate(p.sold_date || p.listed_date);
    const locParts: string[] = [];
    if (p.district) {
      locParts.push(p.district);
    }
    if (p.business_circle) {
      locParts.push(p.business_circle);
    }
    if (date) {
      locParts.push(date);
    }
    // 户型段：baths=0 时省略「0卫」，避免出现「3室0卫」
    const layoutPart = p.baths > 0 ? `${p.rooms}室${p.baths}卫` : `${p.rooms}室`;
    // 基础信息行：空值段直接跳过，避免连续分隔符「· ·」（orientation 空串见 DB 61% 记录）
    const meta = [layoutPart, p.orientation, p.floor_display, `${p.build_area}㎡`]
      .filter(Boolean)
      .join(" · ");

    return {
      id: p.id,
      communityName: p.community_name || "",
      statusText: isOnSale ? "在售" : "成交",
      statusClass: isOnSale ? "on-sale" : "sold",
      meta,
      totalPrice: p.total_price,
      unitPriceText: `${formatThousand(p.unit_price)}元/㎡`,
      loc: locParts.join(" · "),
      remark: (p.listing_remarks ?? "").trim(),
      // 列表缩略图按展示尺寸（128rpx×144rpx，3x 屏约 192×216 物理像素）请求，
      // 避免拉取原图：OSS 图 425KB → 约 7KB；非 OSS 外站图由 resolveImageUrl 原样返回
      thumb: resolveImageUrl(getFloorPlan(p.data_source, p.picture_links), {
        width: 240,
        quality: 70,
      }),
    };
  },

  buildQueryParams(): Record<string, string | number> {
    const params: Record<string, string | number> = {
      page: this.data.page,
      page_size: this.data.pageSize,
      sort_by: this.data.sortBy,
      sort_order: this.data.sortOrder,
    };
    if (this.data.tab === "on_sale") {
      params.status = "在售";
    } else if (this.data.tab === "sold") {
      params.status = "成交";
    }
    if (this.data.keyword) {
      params.keyword = this.data.keyword;
    }
    if (this.data.rooms.length > 0) {
      params.rooms = this.data.rooms.join(",");
    }
    if (this.data.roomsGte) {
      params.rooms_gte = 5;
    }
    if (this.data.floorLevels.length > 0) {
      params.floor_levels = this.data.floorLevels.join(",");
    }
    return params;
  },

  /**
   * 首屏（page=1）响应的内存缓存 key：由查询参数按字典序拼接，保证筛选/排序变化即换 key.
   *
   * 不含 token：/properties 返回的房源列表不按用户维度过滤，同筛选条件下结果全局一致。
   */
  buildCacheKey(): string {
    const params = this.buildQueryParams();
    params.page = 1;
    const query = Object.keys(params)
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join("&");
    return `properties-list:${query}`;
  },

  async loadList(reset = false) {
    // SWR：仅首屏（reset）读写内存缓存；翻页追加不参与，避免把第 N 页响应写进首屏 key
    const cacheKey = reset ? this.buildCacheKey() : "";
    const cached = reset
      ? getCacheData<PaginatedPropertyResponse>(cacheKey)
      : undefined;
    if (cached) {
      // 命中缓存：先渲染，避免每次进入都闪骨架屏；随后请求静默刷新覆盖
      const cachedItems: DisplayProperty[] = cached.items.map((it) =>
        this.toDisplay(it)
      );
      this.setData({
        items: cachedItems,
        total: cached.total,
        noMore: cachedItems.length >= cached.total,
      });
    } else if (reset) {
      this.setData({ loading: true, error: false, noMore: false });
    } else {
      this.setData({ loadingMore: true });
    }
    try {
      const data = this.buildQueryParams();
      if (reset) {
        data.page = 1;
      }
      const response = await request<PaginatedPropertyResponse>({
        url: "/properties",
        data,
        cacheKey: reset ? cacheKey : undefined,
      });
      // 缓存命中后的静默刷新期间用户可能已触底翻页（cache-hit 路径不置 loading，
      // 不拦截 onReachBottom）。此时响应已写入 SWR 缓存，但不得覆盖 items：
      // 否则列表被截断回第 1 页而页码停在 2，下次触底将从第 3 页续拉，第 2 页内容被永久跳过。
      if (reset && this.data.page !== 1) {
        return;
      }
      const newItems: DisplayProperty[] = response.items.map((it) =>
        this.toDisplay(it)
      );
      const merged: DisplayProperty[] = reset
        ? newItems
        : [...this.data.items, ...newItems];
      this.setData({
        items: merged,
        total: response.total,
        noMore: merged.length >= response.total,
      });
    } catch (err) {
      const statusCode = (err as { statusCode?: number } | undefined)?.statusCode;
      if (reset) {
        if (statusCode === 401) {
          // 登录失效：清后台令牌 + 登录失效态（不清 C 端令牌）
          wx.removeStorageSync("access_token");
          wx.removeStorageSync("refresh_token");
          this.setData({ authState: "unauthorized", items: [], error: false });
        } else if (statusCode === 403) {
          // 无权限：不清令牌
          this.setData({ authState: "forbidden", items: [], error: false });
        } else if (!cached) {
          // 无缓存可兜底：整屏错误态；有缓存时静默失败，保留缓存内容不打断浏览
          this.setData({ error: true, items: [] });
        }
      } else {
        wx.showToast({ title: "加载失败，请重试", icon: "none" });
      }
    } finally {
      // 被跳过的静默刷新不得清掉在途翻页请求的 loadingMore（由翻页请求自身的
      // finally 恢复），否则会提前放行 onReachBottom 并发拉取第 3 页造成乱序拼接
      if (!(reset && this.data.page !== 1)) {
        this.setData({ loading: false, loadingMore: false });
      }
    }
  },

  onReachBottom() {
    if (this.data.loading || this.data.loadingMore || this.data.noMore) {
      return;
    }
    if (this.data.authState !== "ok" || this.data.error) {
      return;
    }
    this.setData({ page: this.data.page + 1 });
    this.loadList(false);
  },

  buildViews(
    draftRooms?: number[],
    draftRoomsGte?: boolean,
    draftFloor?: string[]
  ): {
    roomViews: RoomView[];
    floorViews: FloorView[];
  } {
    return {
      roomViews: buildRoomViews(
        draftRooms ?? this.data.draftRooms,
        draftRoomsGte ?? this.data.draftRoomsGte
      ),
      floorViews: buildFloorViews(draftFloor ?? this.data.draftFloor),
    };
  },

  onStatusTabChange(e: WechatMiniprogram.BaseEvent) {
    const tab = e.currentTarget.dataset.tab as TabKey;
    if (!tab || tab === this.data.tab) {
      return;
    }
    this.setData({
      tab,
      items: [],
      page: 1,
      total: 0,
      noMore: false,
      error: false,
      authState: "ok",
    });
    this.loadList(true);
  },

  onFilterChipTap(e: WechatMiniprogram.BaseEvent) {
    const key = e.currentTarget.dataset.key as FilterKey;
    if (this.data.activeFilter === key) {
      this.setData({ activeFilter: "" });
      return;
    }
    // 打开面板：草稿同步为已生效值，并重建视图选中态
    this.setData({
      activeFilter: key,
      draftRooms: [...this.data.rooms],
      draftRoomsGte: this.data.roomsGte,
      draftFloor: [...this.data.floorLevels],
      ...this.buildViews(
        [...this.data.rooms],
        this.data.roomsGte,
        [...this.data.floorLevels]
      ),
    });
  },

  onMaskTap() {
    this.setData({ activeFilter: "" });
  },

  onRoomOptionTap(e: WechatMiniprogram.BaseEvent) {
    const value = Number(e.currentTarget.dataset.value);
    const draftRooms = [...this.data.draftRooms];
    let draftRoomsGte = this.data.draftRoomsGte;
    if (value === 5) {
      draftRoomsGte = !draftRoomsGte;
    } else if (draftRooms.includes(value)) {
      draftRooms.splice(draftRooms.indexOf(value), 1);
    } else {
      draftRooms.push(value);
    }
    this.setData({ draftRooms, draftRoomsGte, ...this.buildViews(draftRooms, draftRoomsGte) });
  },

  onFloorOptionTap(e: WechatMiniprogram.BaseEvent) {
    const value = e.currentTarget.dataset.value as string;
    const draftFloor = [...this.data.draftFloor];
    const idx = draftFloor.indexOf(value);
    if (idx >= 0) {
      draftFloor.splice(idx, 1);
    } else {
      draftFloor.push(value);
    }
    this.setData({ draftFloor, ...this.buildViews(undefined, undefined, draftFloor) });
  },

  onPanelReset() {
    this.setData({
      draftRooms: [],
      draftRoomsGte: false,
      draftFloor: [],
      ...this.buildViews([], false, []),
    });
  },

  onPanelConfirm() {
    const { draftRooms, draftRoomsGte, draftFloor } = this.data;
    this.setData({
      rooms: draftRooms,
      roomsGte: draftRoomsGte,
      floorLevels: draftFloor,
      roomLabel: buildRoomLabel(draftRooms, draftRoomsGte),
      floorLabel: draftFloor.length ? draftFloor.join("、") : "楼层",
      activeFilter: "",
      items: [],
      page: 1,
      total: 0,
      noMore: false,
      error: false,
      authState: "ok",
    });
    this.loadList(true);
  },

  onSortItemTap(e: WechatMiniprogram.BaseEvent) {
    const key = e.currentTarget.dataset.key as string;
    const { sortBy, sortOrder } = this.data;
    let nextBy = sortBy;
    let nextOrder: "asc" | "desc" = sortOrder;
    if (key === sortBy) {
      nextOrder = sortOrder === "desc" ? "asc" : "desc";
    } else {
      nextBy = key;
      nextOrder = "desc";
    }
    const op = SORT_OPTIONS.find((o) => o.key === nextBy);
    this.setData({
      sortBy: nextBy,
      sortOrder: nextOrder,
      sortChosen: true,
      sortLabel: `${op ? op.label : "排序"}${nextOrder === "desc" ? "↓" : "↑"}`,
      activeFilter: "",
      items: [],
      page: 1,
      total: 0,
      noMore: false,
      error: false,
      authState: "ok",
    });
    this.loadList(true);
  },

  onSearchInput(e: WechatMiniprogram.Input) {
    this.setData({ searchValue: e.detail.value });
  },

  onSearchConfirm() {
    const kw = this.data.searchValue.trim();
    this.setData({
      keyword: kw,
      items: [],
      page: 1,
      total: 0,
      noMore: false,
      error: false,
      authState: "ok",
    });
    this.loadList(true);
  },

  onRetry() {
    this.setData({ authState: "ok", error: false });
    this.loadList(true);
  },

  onClearFilters() {
    this.setData({
      keyword: "",
      searchValue: "",
      rooms: [],
      roomsGte: false,
      floorLevels: [],
      sortBy: "timeline",
      sortOrder: "desc",
      sortChosen: false,
      roomLabel: "户型",
      floorLabel: "楼层",
      sortLabel: "排序",
      items: [],
      page: 1,
      total: 0,
      noMore: false,
      error: false,
      authState: "ok",
    });
    this.loadList(true);
  },

  onGoBack() {
    wx.navigateBack();
  },
});