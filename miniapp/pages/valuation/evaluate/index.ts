/**
 * 「评估工作台」列表页（员工侧）.
 *
 * 单请求双段队列（/public/leads/pending-assessment）：
 * - 「待评估」组：分页列表（created_at 倒序），搜索仅过滤本段，触底仅追加本段；
 * - 「已处理」参考组：本人经手线索（不限时间窗，audit_time 倒序，服务端截取最近 50 条，total 为全量计数），
 *   随 reset 刷新，可点击进入只读详情（含跟进记录）。
 * 分页范式严格套用 pages/valuation/list（epoch 竞态守卫 / 触底三重拦截 / 翻页回滚 /
 * 索引路径局部 setData / 403 引导空态）。
 * 视觉遵循 Steep 设计体系（eval-auth-hifi.html 屏B）一比一还原。
 */
import type { components } from "../../../types/api-types";
import { request } from "../../../utils/request";
import { getAccessToken, getCAccessToken } from "../../../utils/token";
import { resolveImageUrl } from "../../../utils/url";
import { formatDate } from "../../../utils/valuation-display";

type QueueItem = components["schemas"]["PendingAssessmentQueueItem"];
type HandledItem = components["schemas"]["HandledItem"];
type QueueResponse = components["schemas"]["PendingAssessmentQueueResponse"];

/** 每页数量. */
const PAGE_SIZE = 10;

/** 已处理卡标签/动作芯片语义（对齐设计稿 ACT_META：已授权绿 / 已看房绿 / 已驳回灰 / 他司成交 rust）. */
const HANDLED_STATUS_META: Record<
  string,
  { tagText: string; tagClass: string; actionText: string; actionClass: string }
> = {
  pending_visit: { tagText: "已授权", tagClass: "green", actionText: "已授权 · 待看房", actionClass: "ap" },
  visited: { tagText: "已看房", tagClass: "green", actionText: "已看房 · 可调整评估价", actionClass: "ap" },
  rejected: { tagText: "已驳回", tagClass: "gray", actionText: "已驳回", actionClass: "rj" },
  lost_to_competitor: {
    tagText: "他司成交",
    tagClass: "rust",
    actionText: "他司已成交 · 线索关闭",
    actionClass: "lost",
  },
};

/** 可再次评估（调整评估价）的状态集合，对齐 admin CurrentEvalPriceSection 口径. */
const ADJUSTABLE_STATUSES: string[] = ["pending_visit", "visited"];

/** 待评估卡片展示结构（设计稿 lcard 三段：top / mid / foot）. */
interface PendingCard {
  id: string;
  name: string;
  /** 参数行一：户型 · 面积 · 楼层. */
  l1: string;
  /** 参数行二：区域 · 朝向. */
  l2: string;
  priceValue: string;
  priceUnit: string;
  image: string;
  timeText: string;
  sourceText: string;
  sourceClass: string;
}

/** 已处理卡片展示结构（与待评估卡同构 + 状态标签 / 动作芯片）. */
interface HandledCard {
  id: string;
  name: string;
  tagText: string;
  tagClass: string;
  l1: string;
  l2: string;
  priceLabel: string;
  priceValue: string;
  priceUnit: string;
  priceOk: boolean;
  image: string;
  timeText: string;
  sourceText: string;
  sourceClass: string;
  actionText: string;
  actionClass: string;
}

/** 页面 data. */
interface PageData {
  search: string;
  pendingItems: PendingCard[];
  page: number;
  pageSize: number;
  pendingTotal: number;
  /** 今日（Asia/Shanghai 自然日）新增待评估数. */
  pendingToday: number;
  handledItems: HandledCard[];
  handledTotal: number;
  loading: boolean;
  loadingMore: boolean;
  error: boolean;
  noMore: boolean;
  /** 未登录（无任何令牌）. */
  needLogin: boolean;
  /** 403（无 admin/operator 角色）：隐藏入口，不发起后续调用. */
  forbidden: boolean;
}

/** 页面自定义方法（含非响应式实例字段）. */
interface PageCustom {
  /** 请求时代戳：reset 加载使旧代在途请求失效（竞态守卫） */
  _epoch: number;
  /** 原始待评估队列项索引（id → 队列项），供跳转授权页时经 EventChannel 传递全景数据 */
  _rawById: Record<string, QueueItem>;
  /** 原始已处理项索引（id → 已处理项），供跳转只读详情时经 EventChannel 传递全景数据 */
  _handledById: Record<string, HandledItem>;
  loadList(reset?: boolean, silent?: boolean): void;
  toPendingCard(item: QueueItem): PendingCard;
  toHandledCard(item: HandledItem): HandledCard;
  onSearchInput(e: WechatMiniprogram.Input): void;
  onSearchConfirm(): void;
  onClearSearch(): void;
  onItemTap(e: WechatMiniprogram.BaseEvent): void;
  onHandledTap(e: WechatMiniprogram.BaseEvent): void;
  onGoLogin(): void;
  onRetry(): void;
}

/** 参数行一/二拼接：空段过滤，全空回退「—」. */
function attrsLine(parts: (string | null | undefined)[]): string {
  const joined = parts.filter(Boolean).join(" · ");
  return joined || "—";
}

/** 业主报价展示：有值「520」+「万」单位，缺失「—」无单位. */
function priceParts(price: number | null | undefined): { value: string; unit: string } {
  return price != null ? { value: `${price}`, unit: "万" } : { value: "—", unit: "" };
}

/** 来源展示：客户分享 / 员工直录（对齐设计稿 srcchip 文案）. */
function sourceParts(source: QueueItem["source"] | HandledItem["source"]): { text: string; cls: string } {
  return source === "customer_share" ? { text: "客户分享", cls: "share" } : { text: "员工直录", cls: "direct" };
}

/** 是否持有任意令牌（C 端或后台），决定是否发起请求. */
function hasAnyToken(): boolean {
  return Boolean(getCAccessToken() || getAccessToken());
}

Page<PageData, PageCustom>({
  data: {
    search: "",
    pendingItems: [],
    page: 1,
    pageSize: PAGE_SIZE,
    pendingTotal: 0,
    pendingToday: 0,
    handledItems: [],
    handledTotal: 0,
    loading: false,
    loadingMore: false,
    error: false,
    noMore: false,
    needLogin: false,
    forbidden: false,
  },

  _epoch: 0,

  _rawById: {},

  _handledById: {},

  toPendingCard(item: QueueItem): PendingCard {
    const src = sourceParts(item.source);
    const price = priceParts(item.expected_price);
    return {
      id: item.id,
      name: item.community_name,
      l1: attrsLine([item.layout, item.area != null ? `${item.area}㎡` : "", item.floor_info]),
      l2: attrsLine([item.district, item.orientation]),
      priceValue: price.value,
      priceUnit: price.unit,
      image: item.images && item.images.length > 0 ? resolveImageUrl(item.images[0], { width: 240 }) : "",
      timeText: formatDate(item.created_at, true),
      sourceText: src.text,
      sourceClass: src.cls,
    };
  },

  toHandledCard(item: HandledItem): HandledCard {
    const meta = HANDLED_STATUS_META[item.status] ?? {
      tagText: item.status_display,
      tagClass: "gray",
      actionText: item.status_display,
      actionClass: "rj",
    };
    const src = sourceParts(item.source);
    // 已授权/已看房卡展示授权价（绿色）；reject/lost 不涉及评估价，报价显示「—」
    const approved = ADJUSTABLE_STATUSES.indexOf(item.status) >= 0;
    const price = approved
      ? priceParts(item.eval_price)
      : { value: "—", unit: "" };
    return {
      id: item.id,
      name: item.community_name,
      tagText: meta.tagText,
      tagClass: meta.tagClass,
      l1: attrsLine([item.layout, item.area != null ? `${item.area}㎡` : "", item.floor_info]),
      l2: attrsLine([item.district, item.orientation]),
      priceLabel: approved ? "授权价" : "业主报价",
      priceValue: price.value,
      priceUnit: price.unit,
      priceOk: approved && item.eval_price != null,
      image: item.images && item.images.length > 0 ? resolveImageUrl(item.images[0], { width: 240 }) : "",
      timeText: formatDate(item.audit_time, true),
      sourceText: src.text,
      sourceClass: src.cls,
      actionText: meta.actionText,
      actionClass: meta.actionClass,
    };
  },

  onShow() {
    if (!hasAnyToken()) {
      this.setData({ needLogin: true, loading: false, loadingMore: false });
      return;
    }
    if (this.data.pendingItems.length === 0) {
      this.loadList(true, false);
    } else {
      // 已有数据：静默刷新（授权操作 navigateBack 返回时触发，同步双段）
      this.loadList(true, true);
    }
  },

  async loadList(reset = false, silent = false) {
    if (!hasAnyToken()) {
      this.setData({ needLogin: true, loading: false, loadingMore: false });
      return;
    }
    if (reset) {
      // epoch 守卫：静默刷新/下拉刷新/搜索使旧代在途请求失效
      this._epoch += 1;
    }
    const myEpoch = this._epoch;
    if (reset) {
      this.setData({
        error: false,
        noMore: false,
        needLogin: false,
        forbidden: false,
        ...(silent ? {} : { loading: true }),
      });
    } else {
      this.setData({ loadingMore: true });
    }
    try {
      const page = reset ? 1 : this.data.page;
      const search = this.data.search.trim();
      const data = await request<QueueResponse>({
        url: "/public/leads/pending-assessment",
        data: {
          page,
          page_size: this.data.pageSize,
          ...(search ? { search } : {}),
        },
      });
      if (myEpoch !== this._epoch) {
        return; // 过期代整体丢弃
      }
      if (reset) {
        // 重建原始项索引，供 onItemTap/onHandledTap 传递全景数据
        this._rawById = {};
        this._handledById = {};
        data.items_pending.forEach((it) => {
          this._rawById[it.id] = it;
        });
        data.items_handled.forEach((it) => {
          this._handledById[it.id] = it;
        });
        this.setData({
          pendingItems: data.items_pending.map((it) => this.toPendingCard(it)),
          pendingTotal: data.pending_total,
          pendingToday: data.pending_today,
          handledItems: data.items_handled.map((it) => this.toHandledCard(it)),
          handledTotal: data.handled_total,
          page,
          noMore: data.items_pending.length >= data.pending_total,
        });
      } else {
        // 翻页仅追加待评估段：索引路径局部 setData，payload 不随累计页数增长
        const newItems = data.items_pending.map((it) => this.toPendingCard(it));
        data.items_pending.forEach((it) => {
          this._rawById[it.id] = it;
        });
        const patch: Record<string, unknown> = {
          pendingTotal: data.pending_total,
          pendingToday: data.pending_today,
          page,
          noMore: this.data.pendingItems.length + newItems.length >= data.pending_total,
        };
        const base = this.data.pendingItems.length;
        newItems.forEach((it, i) => {
          patch[`pendingItems[${base + i}]`] = it;
        });
        this.setData(patch);
      }
    } catch (err) {
      if (myEpoch !== this._epoch) {
        return; // 过期请求不弹 toast、不切状态、不回滚页码
      }
      const statusCode = (err as { statusCode?: number } | undefined)?.statusCode;
      if (statusCode === 403) {
        // 无 admin/operator 角色：隐藏入口不发起后续调用
        this.setData({ forbidden: true, pendingItems: [], handledItems: [] });
      } else if (statusCode === 401) {
        this.setData({ needLogin: true, pendingItems: [], handledItems: [] });
      } else if (reset) {
        if (!silent) {
          this.setData({ error: true, pendingItems: [] });
        }
      } else {
        // 翻页失败：回滚页码并重置 noMore，避免下次触底被拦截跳过本页
        this.setData({ page: Math.max(1, this.data.page - 1), noMore: false });
        wx.showToast({ title: "加载失败，请重试", icon: "none" });
      }
    } finally {
      if (myEpoch === this._epoch) {
        this.setData({ loading: false, loadingMore: false });
      }
    }
  },

  onReachBottom() {
    // 触底三重拦截：加载中 / 无更多 / 已加载满
    if (this.data.loading || this.data.loadingMore || this.data.noMore) {
      return;
    }
    if (this.data.pendingItems.length >= this.data.pendingTotal) {
      return;
    }
    this.setData({ page: this.data.page + 1 });
    this.loadList(false);
  },

  async onPullDownRefresh() {
    // 下拉刷新重取双段；等 loadList 结束再停止动画
    await this.loadList(true, true);
    wx.stopPullDownRefresh();
  },

  onSearchInput(e: WechatMiniprogram.Input) {
    this.setData({ search: e.detail.value || "" });
  },

  onSearchConfirm() {
    // 搜索仅作用于待评估段（服务端过滤），已处理段随响应整体刷新
    this.loadList(true);
  },

  onClearSearch() {
    if (!this.data.search) {
      return;
    }
    this.setData({ search: "" });
    this.loadList(true);
  },

  onItemTap(e: WechatMiniprogram.BaseEvent) {
    const id = e.currentTarget.dataset.id as string;
    const raw = this._rawById[id];
    if (!raw) {
      return;
    }
    wx.navigateTo({
      url: `/pages/valuation/authorize/index?id=${id}`,
      success: (res) => {
        // 经 EventChannel 传递原始队列项全景数据（授权页数据源，不新增详情端点）
        res.eventChannel.emit("leadDetail", raw);
      },
    });
  },

  /** 已处理卡点击：进入只读详情（mode=view，含跟进记录）. */
  onHandledTap(e: WechatMiniprogram.BaseEvent) {
    const id = e.currentTarget.dataset.id as string;
    const raw = this._handledById[id];
    if (!raw) {
      return;
    }
    wx.navigateTo({
      url: `/pages/valuation/authorize/index?id=${id}&mode=view`,
      success: (res) => {
        res.eventChannel.emit("leadDetail", raw);
      },
    });
  },

  onGoLogin() {
    wx.navigateTo({ url: "/pages/test-login/index/index" });
  },

  onRetry() {
    this.loadList(true);
  },
});
