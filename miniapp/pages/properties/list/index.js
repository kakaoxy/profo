// 与 index.ts 逻辑完全一致（去掉类型注解），改动需同步两侧
import { request } from "../../../utils/request";
import { getFloorPlan } from "../../../utils/floor-plan";

/** 每页数量. */
const PAGE_SIZE = 20;

/** 小区名搜索防抖间隔（ms），避免逐字请求列表. */
const COMMUNITY_DEBOUNCE = 400;

const ROOM_OPTIONS = [
  { value: 1, label: "1室" },
  { value: 2, label: "2室" },
  { value: 3, label: "3室" },
  { value: 4, label: "4室" },
  { value: 5, label: "5室+" },
];

const FLOOR_OPTIONS = [
  { value: "低楼层", label: "低楼层" },
  { value: "中楼层", label: "中楼层" },
  { value: "高楼层", label: "高楼层" },
];

const SORT_OPTIONS = [
  { key: "timeline", label: "成交时间" },
  { key: "total_price", label: "总价" },
  { key: "unit_price", label: "单价" },
  { key: "build_area", label: "面积" },
];

/** 千分位格式化. */
function formatThousand(n) {
  if (!Number.isFinite(n)) {
    return "0";
  }
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** 日期格式化为 yyyy/mm/dd（后端返回 ISO 日期，取前 10 位）. */
function formatDate(d) {
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
function buildRoomLabel(rooms, roomsGte) {
  const parts = rooms.map((r) => r + "室");
  if (roomsGte) {
    parts.push("5室+");
  }
  return parts.length ? parts.join("、") : "户型";
}

/** 户型面板视图（value=5 的选中取决于 draftRoomsGte）. */
function buildRoomViews(draftRooms, draftRoomsGte) {
  return ROOM_OPTIONS.map((o) => ({
    value: o.value,
    label: o.label,
    selected: o.value === 5 ? draftRoomsGte : draftRooms.indexOf(o.value) >= 0,
  }));
}

/** 楼层面板视图. */
function buildFloorViews(draftFloor) {
  return FLOOR_OPTIONS.map((o) => ({
    value: o.value,
    label: o.label,
    selected: draftFloor.indexOf(o.value) >= 0,
  }));
}

/** 商圈面板视图. */
function buildBusinessViews(options, draftBusiness) {
  return options.map((name) => ({ name, selected: draftBusiness.indexOf(name) >= 0 }));
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
    authState: "ok",
    communityName: "",
    rooms: [],
    roomsGte: false,
    floorLevels: [],
    businessCircles: [],
    sortBy: "timeline",
    sortOrder: "desc",
    sortChosen: false,
    activeFilter: "",
    roomLabel: "户型",
    floorLabel: "楼层",
    businessLabel: "商圈",
    sortLabel: "排序",
    draftRooms: [],
    draftRoomsGte: false,
    draftFloor: [],
    draftBusiness: [],
    roomOptions: ROOM_OPTIONS,
    floorOptions: FLOOR_OPTIONS,
    businessOptions: [],
    sortOptions: SORT_OPTIONS,
    roomViews: buildRoomViews([], false),
    floorViews: buildFloorViews([]),
    businessViews: buildBusinessViews([], []),
    dictLoading: false,
  },

  onLoad() {
    this.communityTimer = null;
    // 首屏并行：房源列表 + 商圈字典（无依赖请求并行拉取）
    this.loadDictionaries();
    this.loadList(true);
  },

  onUnload() {
    if (this.communityTimer !== null) {
      clearTimeout(this.communityTimer);
      this.communityTimer = null;
    }
  },

  toDisplay(p) {
    const isOnSale = p.status === "在售";
    const date = formatDate(p.sold_date || p.listed_date);
    const locParts = [];
    if (p.district) {
      locParts.push(p.district);
    }
    if (p.business_circle) {
      locParts.push(p.business_circle);
    }
    if (date) {
      locParts.push(date);
    }
    return {
      id: p.id,
      communityName: p.community_name || "",
      statusText: isOnSale ? "在售" : "成交",
      statusClass: isOnSale ? "on-sale" : "sold",
      meta: p.rooms + "室" + p.baths + "卫 · " + p.orientation + " · " + p.floor_display + " · " + p.build_area + "㎡",
      totalPrice: p.total_price,
      unitPriceText: formatThousand(p.unit_price) + "元/㎡",
      loc: locParts.join(" · "),
      thumb: getFloorPlan(p.data_source, p.picture_links) || "",
    };
  },

  buildQueryParams() {
    const params = {
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
    if (this.data.communityName) {
      params.community_name = this.data.communityName;
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
    if (this.data.businessCircles.length > 0) {
      params.business_circles = this.data.businessCircles.join(",");
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
      const data = this.buildQueryParams();
      if (reset) {
        data.page = 1;
      }
      const response = await request({
        url: "/properties",
        data,
      });
      const newItems = response.items.map((it) => this.toDisplay(it));
      const merged = reset ? newItems : [...this.data.items, ...newItems];
      this.setData({
        items: merged,
        total: response.total,
        noMore: merged.length >= response.total,
      });
    } catch (err) {
      const statusCode = err && err.statusCode;
      if (reset) {
        if (statusCode === 401) {
          // 登录失效：清后台令牌 + 登录失效态（不清 C 端令牌）
          wx.removeStorageSync("access_token");
          wx.removeStorageSync("refresh_token");
          this.setData({ authState: "unauthorized", items: [], error: false });
        } else if (statusCode === 403) {
          // 无权限：不清令牌
          this.setData({ authState: "forbidden", items: [], error: false });
        } else {
          this.setData({ error: true, items: [] });
        }
      } else {
        wx.showToast({ title: "加载失败，请重试", icon: "none" });
      }
    } finally {
      this.setData({ loading: false, loadingMore: false });
    }
  },

  async loadDictionaries() {
    this.setData({ dictLoading: true });
    try {
      const res = await request({
        url: "/admin/dictionaries",
        data: { dict_type: "business_circle" },
      });
      this.setData({ businessOptions: res.items || [] });
    } catch {
      // 字典加载失败不阻塞列表，静默保留空选项
    } finally {
      this.setData({ dictLoading: false });
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

  buildViews(draftRooms, draftRoomsGte, draftFloor, draftBusiness) {
    return {
      roomViews: buildRoomViews(
        draftRooms ?? this.data.draftRooms,
        draftRoomsGte ?? this.data.draftRoomsGte
      ),
      floorViews: buildFloorViews(draftFloor ?? this.data.draftFloor),
      businessViews: buildBusinessViews(
        this.data.businessOptions,
        draftBusiness ?? this.data.draftBusiness
      ),
    };
  },

  onStatusTabChange(e) {
    const tab = e.currentTarget.dataset.tab;
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

  onFilterChipTap(e) {
    const key = e.currentTarget.dataset.key;
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
      draftBusiness: [...this.data.businessCircles],
      ...this.buildViews(
        [...this.data.rooms],
        this.data.roomsGte,
        [...this.data.floorLevels],
        [...this.data.businessCircles]
      ),
    });
  },

  onMaskTap() {
    this.setData({ activeFilter: "" });
  },

  onRoomOptionTap(e) {
    const value = Number(e.currentTarget.dataset.value);
    const draftRooms = [...this.data.draftRooms];
    let draftRoomsGte = this.data.draftRoomsGte;
    if (value === 5) {
      draftRoomsGte = !draftRoomsGte;
    } else if (draftRooms.indexOf(value) >= 0) {
      draftRooms.splice(draftRooms.indexOf(value), 1);
    } else {
      draftRooms.push(value);
    }
    this.setData({ draftRooms, draftRoomsGte, ...this.buildViews(draftRooms, draftRoomsGte) });
  },

  onFloorOptionTap(e) {
    const value = e.currentTarget.dataset.value;
    const draftFloor = [...this.data.draftFloor];
    const idx = draftFloor.indexOf(value);
    if (idx >= 0) {
      draftFloor.splice(idx, 1);
    } else {
      draftFloor.push(value);
    }
    this.setData({ draftFloor, ...this.buildViews(undefined, undefined, draftFloor) });
  },

  onBusinessOptionTap(e) {
    const value = e.currentTarget.dataset.value;
    const draftBusiness = [...this.data.draftBusiness];
    const idx = draftBusiness.indexOf(value);
    if (idx >= 0) {
      draftBusiness.splice(idx, 1);
    } else {
      draftBusiness.push(value);
    }
    this.setData({
      draftBusiness,
      ...this.buildViews(undefined, undefined, undefined, draftBusiness),
    });
  },

  onPanelReset() {
    this.setData({
      draftRooms: [],
      draftRoomsGte: false,
      draftFloor: [],
      draftBusiness: [],
      ...this.buildViews([], false, [], []),
    });
  },

  onPanelConfirm() {
    const { draftRooms, draftRoomsGte, draftFloor, draftBusiness } = this.data;
    this.setData({
      rooms: draftRooms,
      roomsGte: draftRoomsGte,
      floorLevels: draftFloor,
      businessCircles: draftBusiness,
      roomLabel: buildRoomLabel(draftRooms, draftRoomsGte),
      floorLabel: draftFloor.length ? draftFloor.join("、") : "楼层",
      businessLabel: draftBusiness.length ? draftBusiness.join("、") : "商圈",
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

  onSortItemTap(e) {
    const key = e.currentTarget.dataset.key;
    const { sortBy, sortOrder } = this.data;
    let nextBy = sortBy;
    let nextOrder = sortOrder;
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
      sortLabel: (op ? op.label : "排序") + (nextOrder === "desc" ? "↓" : "↑"),
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

  onCommunityChange(e) {
    const value = (e.detail.value) || "";
    if (this.communityTimer !== null) {
      clearTimeout(this.communityTimer);
      this.communityTimer = null;
    }
    if (!value.trim()) {
      // 空关键词：立即恢复全量
      this.setData({
        communityName: "",
        items: [],
        page: 1,
        total: 0,
        noMore: false,
        error: false,
        authState: "ok",
      });
      this.loadList(true);
      return;
    }
    // 输入防抖：停顿后再拉取，避免逐字请求列表
    this.communityTimer = setTimeout(() => {
      this.communityTimer = null;
      this.setData({
        communityName: value.trim(),
        items: [],
        page: 1,
        total: 0,
        noMore: false,
        error: false,
        authState: "ok",
      });
      this.loadList(true);
    }, COMMUNITY_DEBOUNCE);
  },

  onCommunitySelect(e) {
    if (this.communityTimer !== null) {
      clearTimeout(this.communityTimer);
      this.communityTimer = null;
    }
    const name = ((e.detail && e.detail.name) || "").trim();
    this.setData({
      communityName: name,
      items: [],
      page: 1,
      total: 0,
      noMore: false,
      error: false,
      authState: "ok",
    });
    this.loadList(true);
  },

  onCommunityClear() {
    if (this.communityTimer !== null) {
      clearTimeout(this.communityTimer);
      this.communityTimer = null;
    }
    this.setData({
      communityName: "",
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
      communityName: "",
      rooms: [],
      roomsGte: false,
      floorLevels: [],
      businessCircles: [],
      sortBy: "timeline",
      sortOrder: "desc",
      sortChosen: false,
      roomLabel: "户型",
      floorLabel: "楼层",
      businessLabel: "商圈",
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