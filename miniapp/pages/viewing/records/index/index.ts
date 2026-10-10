/**
 * 带看记录明细页（设计稿 docs/2026-10-10 ARTBOARD 03：hero 卡底「带看记录」链接落地页）.
 *
 * GET /projects/sales-records 按时间降序（record_date 降序、同日 created_at 降序）
 * 呈现当前用户可见范围的全部销售记录明细；顶栏类型筛选 chips（全部/带看/出价/面谈）
 * 兼作图例，切换走服务端 record_type 过滤并重拉第 1 页；触底加载下一页。
 * 每条一句话「{操作人} 为 {项目名} 添加一条{类型}记录」，出价记录附金额行；
 * 渠道（related_agent）真源字段暂缺，括注整体省略。
 * 状态机（loading/error/needLogin/noPermission/empty/items）对齐列表页范本；
 * 401 清令牌切「登录已失效」，403 切无权限态不清令牌。
 */
import type { components } from "../../../../types/api-types";
import { request } from "../../../../utils/request";
import { pad2 } from "../../../../utils/format";
import { getAccessToken } from "../../../../utils/token";

type SalesRecordFlowItem = components["schemas"]["SalesRecordFlowItem"];
type RecordType = components["schemas"]["RecordType"];

/** 类型筛选值（"all" 仅前端语义，请求时不传 record_type）. */
type TypeFilter = "all" | RecordType;

/** 类型筛选 chip 定义（顺序即顶栏顺序）. */
const TYPE_FILTERS: { key: TypeFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "viewing", label: "带看" },
  { key: "offer", label: "出价" },
  { key: "negotiation", label: "面谈" },
];

/** record_type → chip 文案. */
const TYPE_LABEL: Record<RecordType, string> = {
  viewing: "带看",
  offer: "出价",
  negotiation: "面谈",
};

/** record_type → chip 样式类（复用既有 chip 色板：带看 Sky / 出价 Apricot / 面谈 Gray）. */
const TYPE_CHIP_CLASS: Record<RecordType, string> = {
  viewing: "rec-chip--viewing",
  offer: "rec-chip--offer",
  negotiation: "rec-chip--nego",
};

/** 每页条数（后端上限 100）. */
const PAGE_SIZE = 20;

/** 明细行展示结构（一句话正文/金额行/日期在 TS 侧拼好，wxml 只做渲染）. */
interface RecordItem {
  id: string;
  typeLabel: string;
  chipClass: string;
  /** YYYY-MM-DD（本地时区）；非法时间兜底「—」（对齐列表页 formatDay 口径）. */
  dateText: string;
  /** 正文：{操作人} 为 {项目名} 添加一条{类型}记录（人名缺失兜底「—」）. */
  text: string;
  /** 出价金额行「出价金额：N万」；仅有效价出价记录有值，带看/面谈恒空. */
  priceText: string;
}

type PageState = "loading" | "error" | "needLogin" | "noPermission" | "empty" | "items";

interface PageData {
  state: PageState;
  filters: { key: TypeFilter; label: string }[];
  activeFilter: TypeFilter;
  items: RecordItem[];
  page: number;
  total: number;
  hasMore: boolean;
  loadingMore: boolean;
}

interface PageCustom {
  clearToken(): void;
  /** 实例级请求序号（非 data）：并发响应只采纳最新一次，防筛选快速切换/触底与切筛并发时旧响应覆盖新列表. */
  _flowSeq: number;
  loadRecords(): void;
  applyResponse(data: components["schemas"]["SalesRecordFlowResponse"], mode: "replace" | "append"): void;
  toItem(r: SalesRecordFlowItem): RecordItem;
  onFilterTap(e: WechatMiniprogram.BaseEvent): void;
  onRetry(): void;
  onGoBack(): void;
}

/** record_date → YYYY-MM-DD（本地时区）；非法时间兜底「—」. */
function formatDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return "—";
  }
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 出价金额行：仅正数价格渲染「出价金额：N万」（对齐最高出价口径：非法/非正价不出行）. */
function priceTextOf(price: string | number | null | undefined): string {
  const n = Number(price);
  if (!Number.isFinite(n) || n <= 0) {
    return "";
  }
  return `出价金额：${n}万`;
}

Page<PageData, PageCustom>({
  _flowSeq: 0,

  data: {
    state: "loading",
    filters: TYPE_FILTERS.map((f) => ({ ...f })),
    activeFilter: "all",
    items: [],
    page: 1,
    total: 0,
    hasMore: false,
    loadingMore: false,
  },

  clearToken() {
    // 401 说明后台会话失效，仅清除后台令牌（对齐列表页 clearToken 口径）
    wx.removeStorageSync("access_token");
    wx.removeStorageSync("refresh_token");
  },

  onShow() {
    this.loadRecords();
  },

  /** 拉取明细流（服务端按类型过滤 + 时间降序分页；切换类型重拉第 1 页）. */
  loadRecords() {
    const token = getAccessToken();
    if (!token) {
      this.setData({ state: "needLogin", items: [] });
      return;
    }
    // 请求序号守卫：筛选快速切换（onFilterTap）/返回重进（onShow）并发时，
    // 后到的旧响应直接丢弃，避免旧类型列表覆盖新筛选结果
    const seq = ++this._flowSeq;
    this.setData({ state: "loading", page: 1, hasMore: false, loadingMore: false });
    const type = this.data.activeFilter;
    const query = type === "all" ? "" : `&record_type=${type}`;
    request<components["schemas"]["SalesRecordFlowResponse"]>({
      url: `/projects/sales-records?page=1&page_size=${PAGE_SIZE}${query}`,
      header: { Authorization: `Bearer ${token}` },
    })
      .then((data) => {
        if (seq !== this._flowSeq) {
          return; // 已有更新的请求发出，丢弃过期响应
        }
        this.applyResponse(data, "replace");
      })
      .catch((err) => {
        if (seq !== this._flowSeq) {
          return; // 过期响应的失败同样不触碰状态机（新请求已接管 loading 态）
        }
        const statusCode = (err as { statusCode?: number } | undefined)?.statusCode;
        if (statusCode === 401) {
          this.clearToken();
          this.setData({ state: "needLogin", items: [] });
        } else if (statusCode === 403) {
          this.setData({ state: "noPermission", items: [] });
        } else {
          this.setData({ state: "error", items: [] });
        }
      });
  },

  applyResponse(data, mode) {
    const items = (data.items ?? []).map((r) => this.toItem(r));
    const total = data.total ?? 0;
    if (mode === "replace") {
      const page = data.page ?? 1;
      this.setData({
        state: total > 0 ? "items" : "empty",
        items,
        page,
        total,
        hasMore: page * (data.page_size ?? PAGE_SIZE) < total,
      });
      return;
    }
    // 触底追加：按 id 去重防御页间重复，尾部索引路径局部 setData
    const known = new Set(this.data.items.map((it) => it.id));
    const fresh = items.filter((it) => !known.has(it.id));
    const patch: Record<string, unknown> = {};
    const base = this.data.items.length;
    fresh.forEach((it, i) => {
      patch[`items[${base + i}]`] = it;
    });
    const page = data.page ?? this.data.page + 1;
    patch.page = page;
    patch.total = total;
    patch.hasMore = page * (data.page_size ?? PAGE_SIZE) < total;
    patch.loadingMore = false;
    this.setData(patch);
  },

  /** SalesRecordFlowItem → 明细行展示结构（一句话正文后端拼好前缀字段，此处拼展示文案）. */
  toItem(r: SalesRecordFlowItem): RecordItem {
    const operator = r.operator_name || "—";
    const typeLabel = TYPE_LABEL[r.record_type] ?? r.record_type;
    return {
      id: r.id,
      typeLabel,
      chipClass: TYPE_CHIP_CLASS[r.record_type] ?? "rec-chip--nego",
      dateText: formatDay(r.record_date),
      text: `${operator} 为 ${r.project_name} 添加一条${typeLabel}记录`,
      priceText: r.record_type === "offer" ? priceTextOf(r.price) : "",
    };
  },

  /** 切换类型筛选：仅重置分页游标，由 loadRecords 以新 record_type 重拉. */
  onFilterTap(e) {
    const key = e.currentTarget.dataset.key as TypeFilter;
    if (key === this.data.activeFilter) {
      return;
    }
    this.setData({ activeFilter: key });
    this.loadRecords();
  },

  /** 触底加载下一页（同类型续传；hasMore/loadingMore 双闸防抖）. */
  onReachBottom() {
    if (this.data.state !== "items" || !this.data.hasMore || this.data.loadingMore) {
      return;
    }
    const token = getAccessToken();
    if (!token) {
      this.setData({ state: "needLogin" });
      return;
    }
    this.setData({ loadingMore: true });
    const type = this.data.activeFilter;
    const query = type === "all" ? "" : `&record_type=${type}`;
    const nextPage = this.data.page + 1;
    // 守卫基准取发起时序号：触底与切筛并发时，切筛会自增序号令旧分页响应作废
    const seq = this._flowSeq;
    request<components["schemas"]["SalesRecordFlowResponse"]>({
      url: `/projects/sales-records?page=${nextPage}&page_size=${PAGE_SIZE}${query}`,
      header: { Authorization: `Bearer ${token}` },
    })
      .then((data) => {
        if (seq !== this._flowSeq) {
          return; // 触底期间用户已切筛选，旧类型下一页不 append 进新列表
        }
        this.applyResponse(data, "append");
      })
      .catch((err) => {
        if (seq !== this._flowSeq) {
          return;
        }
        const statusCode = (err as { statusCode?: number } | undefined)?.statusCode;
        if (statusCode === 401) {
          this.clearToken();
          this.setData({ state: "needLogin", loadingMore: false });
        } else {
          wx.showToast({ title: "加载失败，请重试", icon: "none" });
          this.setData({ loadingMore: false });
        }
      });
  },

  onRetry() {
    this.loadRecords();
  },

  onGoBack() {
    wx.navigateBack({ delta: 1 });
  },
});
