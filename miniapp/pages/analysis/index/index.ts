import type { components } from "../../../types/api-types";
import { request } from "../../../utils/request";
import {
  buildTrendChartData,
  buildTrendLegend,
  drawTrendChart,
  granularityFromRange,
} from "../../../utils/trend-chart";
import type { TrendGranularity } from "../../../utils/trend-chart";
import {
  ALL_BUSINESS_CIRCLE,
  ALL_DISTRICT,
  DEFAULT_BUSINESS_CHIP,
  DEFAULT_DIST_MODE,
  DEFAULT_RANGE,
  DEFAULT_STATUS,
  DEFAULT_TREND_DIM,
  DEFAULT_TREND_MODE,
  EMPTY_DIST_TEXT,
  MODE_OPTIONS,
  RANGE_OPTIONS,
  STATUS_OPTIONS,
  TREND_DIM_OPTIONS,
} from "./constants";
import type { FilterKey } from "./constants";
import {
  buildBusinessChipLabel,
  buildDistViews,
  buildKpiViews,
  buildRangeViews,
  buildStatusViews,
  buildTrendTable,
} from "./views";
import type { DistView, KpiView, OptionView, TrendTableRow } from "./views";

type KpiData = components["schemas"]["KpiData"];
type TrendDataPoint = components["schemas"]["TrendDataPoint"];
type PriceDistributionResponse = components["schemas"]["PriceDistributionResponse"];
type DistributionResponse = components["schemas"]["DistributionResponse"];
type DictionaryResponse = components["schemas"]["DictionaryResponse"];

/** 鉴权态. */
type AuthState = "ok" | "unauthorized" | "forbidden";

/** 页面 data. */
interface PageData {
  // 状态
  loading: boolean;
  authState: AuthState;
  error: boolean;
  // 搜索
  searchValue: string;
  communityName: string;
  // 已生效筛选
  range: string;
  status: string;
  district: string;
  businessCircle: string;
  // 筛选 UI
  activeFilter: FilterKey;
  rangeLabel: string;
  statusLabel: string;
  rangeChosen: boolean;
  statusChosen: boolean;
  businessChipLabel: string;
  businessChipSelected: boolean;
  // 面板草稿
  draftRange: string;
  draftStatus: string;
  // 商圈选择器
  districtOptions: string[];
  allBusinessCircles: string[];
  pickerColumns: string[][];
  pickerIndex: number[];
  // 面板选项视图
  rangeViews: OptionView[];
  statusViews: OptionView[];
  trendDimOptions: { value: string; label: string }[];
  modeOptions: { value: string; label: string }[];
  // 原始数据（视图重建源）
  kpi: KpiData | null;
  trend: TrendDataPoint[];
  priceDist: PriceDistributionResponse | null;
  roomsDist: DistributionResponse | null;
  floorDist: DistributionResponse | null;
  // 趋势展示
  trendDim: string;
  trendMode: string;
  trendGranularity: TrendGranularity;
  trendTableRows: TrendTableRow[];
  trendLegend: { label: string; color: string }[];
  // 分布展示
  priceMode: string;
  roomsFloorMode: string;
  priceRows: DistView[];
  priceTotalText: string;
  priceEmpty: boolean;
  roomsRows: DistView[];
  floorRows: DistView[];
  roomsEmpty: boolean;
  floorEmpty: boolean;
  // 整体空态
  emptyAll: boolean;
  emptyDistText: string;
  // KPI 视图
  kpiViews: KpiView[];
}

/** 页面自定义成员（方法 + 实例字段）. */
interface PageCustom {
  searchTimer?: number;
  loadData(): void;
  loadTrend(): void;
  handleLoadError(err: unknown): void;
  buildFilterParams(): Record<string, string>;
  applyDisplays(): void;
  applyTrendViews(): void;
  applyDistViews(): void;
  scheduleTrendDraw(): void;
  drawTrend(): void;
  initPickerOptions(): void;
  loadBusinessCircles(district: string): void;
  applyBusinessFilter(di: number, bi: number, district: string, circle: string): void;
  applySearch(kw: string): void;
  onSearchInput(e: WechatMiniprogram.Input): void;
  onSearchConfirm(): void;
  onFilterChipTap(e: WechatMiniprogram.BaseEvent): void;
  onMaskTap(): void;
  onRangeOptionTap(e: WechatMiniprogram.BaseEvent): void;
  onStatusOptionTap(e: WechatMiniprogram.BaseEvent): void;
  onRangeReset(): void;
  onRangeConfirm(): void;
  onStatusReset(): void;
  onStatusConfirm(): void;
  onPickerColumnChange(e: WechatMiniprogram.CustomEvent<{ column: number; value: number }>): void;
  onPickerChange(e: WechatMiniprogram.PickerChange): void;
  onPickerCancel(): void;
  onTrendDimChange(e: WechatMiniprogram.BaseEvent): void;
  onTrendModeChange(e: WechatMiniprogram.BaseEvent): void;
  onPriceModeChange(e: WechatMiniprogram.BaseEvent): void;
  onRoomsFloorModeChange(e: WechatMiniprogram.BaseEvent): void;
  onRetry(): void;
  onClearFilters(): void;
  onGoBack(): void;
}

/** canvas 节点信息（fields 回调的 node/size 子集）. */
interface CanvasNodeInfo {
  width: number;
  height: number;
  node: WechatMiniprogram.Canvas;
}

// 页面编排留在本文件：data 默认值 + Page 生命周期/事件方法为 Page 结构要求的回调绑定，
// 无法再拆分；纯逻辑已拆至 views.ts（视图构建）与 utils/trend-chart.ts（canvas 绘制），
// 常量在 constants.ts。combined index.ts + constants.ts 略超 500 行，理由见上（不拆）。
Page<PageData, PageCustom>({
  data: {
    loading: false,
    authState: "ok",
    error: false,
    searchValue: "",
    communityName: "",
    range: DEFAULT_RANGE,
    status: DEFAULT_STATUS,
    district: "",
    businessCircle: "",
    activeFilter: "",
    rangeLabel: "近12个月",
    statusLabel: "全部",
    rangeChosen: false,
    statusChosen: false,
    businessChipLabel: DEFAULT_BUSINESS_CHIP,
    businessChipSelected: false,
    draftRange: DEFAULT_RANGE,
    draftStatus: DEFAULT_STATUS,
    districtOptions: [ALL_DISTRICT],
    allBusinessCircles: [ALL_BUSINESS_CIRCLE],
    pickerColumns: [[ALL_DISTRICT], [ALL_BUSINESS_CIRCLE]],
    pickerIndex: [0, 0],
    rangeViews: buildRangeViews(DEFAULT_RANGE),
    statusViews: buildStatusViews(DEFAULT_STATUS),
    trendDimOptions: TREND_DIM_OPTIONS,
    modeOptions: MODE_OPTIONS,
    kpi: null,
    trend: [],
    priceDist: null,
    roomsDist: null,
    floorDist: null,
    trendDim: DEFAULT_TREND_DIM,
    trendMode: DEFAULT_TREND_MODE,
    trendGranularity: "month",
    trendTableRows: [],
    trendLegend: [],
    priceMode: DEFAULT_DIST_MODE,
    roomsFloorMode: DEFAULT_DIST_MODE,
    priceRows: [],
    priceTotalText: "0",
    priceEmpty: false,
    roomsRows: [],
    floorRows: [],
    roomsEmpty: false,
    floorEmpty: false,
    emptyAll: false,
    emptyDistText: EMPTY_DIST_TEXT,
    kpiViews: [],
  },

  onLoad() {
    this.initPickerOptions();
    this.loadData();
  },

  onReady() {
    this.scheduleTrendDraw();
  },

  buildFilterParams(): Record<string, string> {
    const p: Record<string, string> = { range: this.data.range };
    if (this.data.district) p.district = this.data.district;
    if (this.data.businessCircle) p.business_circles = this.data.businessCircle;
    if (this.data.communityName) p.community_name = this.data.communityName;
    if (this.data.status) p.status = this.data.status;
    return p;
  },

  async loadData() {
    this.setData({ loading: true, error: false, authState: "ok" });
    try {
      const common = this.buildFilterParams();
      const [kpi, trend, priceDist, roomsDist, floorDist] = await Promise.all([
        request<KpiData>({ url: "/reports/market/kpi", data: common }),
        request<TrendDataPoint[]>({ url: "/reports/market/trend", data: { ...common, trend_dim: this.data.trendDim } }),
        request<PriceDistributionResponse>({ url: "/reports/market/price-distribution", data: common }),
        request<DistributionResponse>({ url: "/reports/market/rooms-distribution", data: common }),
        request<DistributionResponse>({ url: "/reports/market/floor-distribution", data: common }),
      ]);
      this.setData({ kpi, trend, priceDist, roomsDist, floorDist });
      this.applyDisplays();
    } catch (err) {
      this.handleLoadError(err);
    } finally {
      // loading 置 false 后 canvas 才渲染，需在渲染完成后重绘
      this.setData({ loading: false }, () => {
        if (this.data.trendMode === "chart" && !this.data.emptyAll) {
          this.scheduleTrendDraw();
        }
      });
    }
  },

  async loadTrend() {
    try {
      const trend = await request<TrendDataPoint[]>({
        url: "/reports/market/trend",
        data: { ...this.buildFilterParams(), trend_dim: this.data.trendDim },
      });
      this.setData({ trend });
      this.applyTrendViews();
      if (this.data.trendMode === "chart") {
        this.scheduleTrendDraw();
      }
    } catch (err) {
      this.handleLoadError(err);
    }
  },

  handleLoadError(err: unknown) {
    const statusCode = (err as { statusCode?: number } | undefined)?.statusCode;
    if (statusCode === 401) {
      // 登录失效：清除后台令牌 + 登录失效态
      wx.removeStorageSync("access_token");
      wx.removeStorageSync("refresh_token");
      this.setData({ authState: "unauthorized", error: false });
    } else if (statusCode === 403) {
      // 无权限：不清令牌
      this.setData({ authState: "forbidden", error: false });
    } else {
      this.setData({ error: true, authState: "ok" });
    }
  },

  applyDisplays() {
    const priceDist = this.data.priceDist;
    const emptyAll = !priceDist || priceDist.total === 0;
    this.setData({
      kpiViews: this.data.kpi ? buildKpiViews(this.data.kpi) : [],
      emptyAll,
    });
    this.applyTrendViews();
    this.applyDistViews();
  },

  applyTrendViews() {
    const granularity = granularityFromRange(this.data.range);
    const chartData = buildTrendChartData(this.data.trend, granularity, this.data.trendDim);
    this.setData({
      trendGranularity: granularity,
      trendTableRows: buildTrendTable(this.data.trend, granularity, this.data.trendDim),
      trendLegend: buildTrendLegend(chartData),
    });
  },

  applyDistViews() {
    const price = this.data.priceDist;
    const rooms = this.data.roomsDist;
    const floor = this.data.floorDist;
    const priceView = buildDistViews(price?.buckets ?? [], price?.total ?? 0);
    const roomsView = buildDistViews(rooms?.buckets ?? [], rooms?.total ?? 0);
    const floorView = buildDistViews(floor?.buckets ?? [], floor?.total ?? 0);
    this.setData({
      priceRows: priceView.rows,
      priceTotalText: priceView.totalText,
      priceEmpty: priceView.empty,
      roomsRows: roomsView.rows,
      floorRows: floorView.rows,
      roomsEmpty: roomsView.empty,
      floorEmpty: floorView.empty,
    });
  },

  scheduleTrendDraw() {
    wx.nextTick(() => this.drawTrend());
  },

  drawTrend() {
    const query = wx.createSelectorQuery().in(this);
    query.select("#trendCanvas").fields({ node: true, size: true }).exec((res) => {
      const info = (res && res[0]) as CanvasNodeInfo | undefined;
      if (!info || !info.node || !info.width || !info.height) return;
      const canvas = info.node;
      const ctx = canvas.getContext("2d") as WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D;
      const dpr = (wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : wx.getSystemInfoSync().pixelRatio) || 2;
      canvas.width = info.width * dpr;
      canvas.height = info.height * dpr;
      ctx.scale(dpr, dpr);
      const chartData = buildTrendChartData(this.data.trend, this.data.trendGranularity, this.data.trendDim);
      drawTrendChart(ctx, info.width, info.height, chartData);
    });
  },

  initPickerOptions() {
    Promise.all([
      request<DictionaryResponse>({ url: "/admin/dictionaries", data: { dict_type: "district" } }),
      request<DictionaryResponse>({ url: "/admin/business-circles", data: { limit: 200 } }),
    ])
      .then(([dist, circles]) => {
        const districts = [ALL_DISTRICT, ...dist.items];
        const all = [ALL_BUSINESS_CIRCLE, ...circles.items];
        this.setData({
          districtOptions: districts,
          allBusinessCircles: all,
          pickerColumns: [districts, all],
        });
      })
      .catch(() => {
        // 字典加载失败静默：选择器仅剩占位项，不影响主体数据加载
      });
  },

  loadBusinessCircles(district: string) {
    request<DictionaryResponse>({
      url: "/admin/business-circles",
      data: district === ALL_DISTRICT ? { limit: 200 } : { district, limit: 200 },
    })
      .then((res) => {
        const circles = [ALL_BUSINESS_CIRCLE, ...res.items];
        this.setData({
          allBusinessCircles: circles,
          pickerColumns: [this.data.districtOptions, circles],
        });
      })
      .catch(() => {
        // 拉取失败保持"全部商圈"占位
        this.setData({ pickerColumns: [this.data.districtOptions, [ALL_BUSINESS_CIRCLE]] });
      });
  },

  applyBusinessFilter(di: number, bi: number, district: string, circle: string) {
    this.setData({
      district,
      businessCircle: circle,
      businessChipLabel: buildBusinessChipLabel(district, circle),
      businessChipSelected: Boolean(district || circle),
      pickerIndex: [di, bi],
      emptyAll: false,
      error: false,
      authState: "ok",
    });
    this.loadData();
  },

  onPickerColumnChange(e: WechatMiniprogram.CustomEvent<{ column: number; value: number }>) {
    const { column, value } = e.detail;
    if (column !== 0) return;
    const di = value;
    const district = this.data.districtOptions[di] ?? ALL_DISTRICT;
    // 区域变化 → 第 2 列联动刷新（先重置为"全部商圈"）
    this.setData({
      pickerIndex: [di, 0],
      pickerColumns: [this.data.districtOptions, [ALL_BUSINESS_CIRCLE]],
    });
    this.loadBusinessCircles(district);
  },

  onPickerChange(e: WechatMiniprogram.PickerChange) {
    const value = e.detail.value as number[];
    const di = value[0] ?? 0;
    const bi = value[1] ?? 0;
    const district = this.data.districtOptions[di] ?? ALL_DISTRICT;
    const circles = this.data.pickerColumns[1] ?? [];
    const circle = circles[bi] ?? ALL_BUSINESS_CIRCLE;
    this.applyBusinessFilter(di, bi, district === ALL_DISTRICT ? "" : district, circle === ALL_BUSINESS_CIRCLE ? "" : circle);
  },

  onPickerCancel() {
    // 取消不改动已生效筛选，仅将选择器还原为当前生效值
    const di = this.data.district === "" ? 0 : this.data.districtOptions.indexOf(this.data.district);
    const bi = this.data.businessCircle === "" ? 0 : this.data.pickerColumns[1].indexOf(this.data.businessCircle);
    this.setData({ pickerIndex: [di < 0 ? 0 : di, bi < 0 ? 0 : bi] });
  },

  onFilterChipTap(e: WechatMiniprogram.BaseEvent) {
    const key = e.currentTarget.dataset.key as FilterKey;
    if (!key) return;
    if (this.data.activeFilter === key) {
      this.setData({ activeFilter: "" });
      return;
    }
    this.setData({
      activeFilter: key,
      draftRange: this.data.range,
      draftStatus: this.data.status,
      rangeViews: buildRangeViews(this.data.range),
      statusViews: buildStatusViews(this.data.status),
    });
  },

  onMaskTap() {
    this.setData({ activeFilter: "" });
  },

  onRangeOptionTap(e: WechatMiniprogram.BaseEvent) {
    const value = e.currentTarget.dataset.value as string;
    this.setData({ draftRange: value, rangeViews: buildRangeViews(value) });
  },

  onStatusOptionTap(e: WechatMiniprogram.BaseEvent) {
    const value = e.currentTarget.dataset.value as string;
    this.setData({ draftStatus: value, statusViews: buildStatusViews(value) });
  },

  onRangeReset() {
    this.setData({ draftRange: DEFAULT_RANGE, rangeViews: buildRangeViews(DEFAULT_RANGE) });
  },

  onStatusReset() {
    this.setData({ draftStatus: DEFAULT_STATUS, statusViews: buildStatusViews(DEFAULT_STATUS) });
  },

  onRangeConfirm() {
    const range = this.data.draftRange;
    if (range === this.data.range) {
      this.setData({ activeFilter: "" });
      return;
    }
    const label = RANGE_OPTIONS.find((o) => o.value === range)?.label ?? "近12个月";
    this.setData({
      range,
      rangeLabel: label,
      rangeChosen: range !== DEFAULT_RANGE,
      activeFilter: "",
      emptyAll: false,
      error: false,
      authState: "ok",
    });
    this.loadData();
  },

  onStatusConfirm() {
    const status = this.data.draftStatus;
    if (status === this.data.status) {
      this.setData({ activeFilter: "" });
      return;
    }
    const label = STATUS_OPTIONS.find((o) => o.value === status)?.label ?? "全部";
    this.setData({
      status,
      statusLabel: label,
      statusChosen: status !== DEFAULT_STATUS,
      activeFilter: "",
      emptyAll: false,
      error: false,
      authState: "ok",
    });
    this.loadData();
  },

  onTrendDimChange(e: WechatMiniprogram.BaseEvent) {
    const value = e.currentTarget.dataset.value as string;
    if (value === this.data.trendDim) return;
    this.setData({ trendDim: value });
    this.loadTrend();
  },

  onTrendModeChange(e: WechatMiniprogram.BaseEvent) {
    const value = e.currentTarget.dataset.value as string;
    if (value === this.data.trendMode) return;
    this.setData({ trendMode: value }, () => {
      if (value === "chart") this.scheduleTrendDraw();
    });
  },

  onPriceModeChange(e: WechatMiniprogram.BaseEvent) {
    const value = e.currentTarget.dataset.value as string;
    if (value === this.data.priceMode) return;
    this.setData({ priceMode: value });
  },

  onRoomsFloorModeChange(e: WechatMiniprogram.BaseEvent) {
    const value = e.currentTarget.dataset.value as string;
    if (value === this.data.roomsFloorMode) return;
    this.setData({ roomsFloorMode: value });
  },

  onSearchInput(e: WechatMiniprogram.Input) {
    const value = e.detail.value;
    this.setData({ searchValue: value });
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.applySearch(value);
    }, 500);
  },

  onSearchConfirm() {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.applySearch(this.data.searchValue);
  },

  applySearch(kw: string) {
    const communityName = kw.trim();
    if (communityName === this.data.communityName) return;
    this.setData({
      communityName,
      emptyAll: false,
      error: false,
      authState: "ok",
    });
    this.loadData();
  },

  onRetry() {
    this.setData({ authState: "ok", error: false });
    this.loadData();
  },

  onClearFilters() {
    this.setData({
      communityName: "",
      searchValue: "",
      district: "",
      businessCircle: "",
      status: DEFAULT_STATUS,
      statusLabel: "全部",
      statusChosen: false,
      range: DEFAULT_RANGE,
      rangeLabel: "近12个月",
      rangeChosen: false,
      draftRange: DEFAULT_RANGE,
      draftStatus: DEFAULT_STATUS,
      businessChipLabel: DEFAULT_BUSINESS_CHIP,
      businessChipSelected: false,
      pickerIndex: [0, 0],
      pickerColumns: [this.data.districtOptions, [ALL_BUSINESS_CIRCLE]],
      emptyAll: false,
      error: false,
      authState: "ok",
    });
    this.loadData();
  },

  onGoBack() {
    wx.navigateBack();
  },
});
