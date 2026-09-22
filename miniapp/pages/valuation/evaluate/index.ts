/**
 * 「评估工作台」列表页（员工侧）.
 *
 * 双接口并行加载（reset 时 Promise.all，防分组瀑布）：
 * - 「待评估」段（/public/leads/pending-assessment）：分页列表（created_at 倒序）；
 * - 「已处理」段（/public/leads/handled-assessment）：本人经手线索全量分页
 *   （时效四层排序：即将过期→跟进中→已过期→终态，组内 created_at 降序，
 *   handled_total 为过滤后全量计数），可点击进入只读详情（含跟进记录）；
 * - 搜索小区名称对两段同时生效（search 随 reset 带给两个接口）；
 * - 触底加载按「已处理优先、待评估兜底」分派（已处理组物理位于页面底部）。
 * 分页范式严格套用 pages/valuation/list（epoch 竞态守卫 / 触底三重拦截 / 翻页回滚 /
 * 索引路径局部 setData / 403 引导空态）。
 * 滚动位置保持：从详情页（跟进/授权）navigateBack 返回时 onShow 走「保量刷新」
 * （按各自已加载页数并行重拉双段，内容量不塌缩），完成后按跳转前记录的线索 id
 * 精准回位（pageScrollTo selector），未命中再回退恢复 scrollTop；下拉/搜索/重试
 * 仍走 reset 式 loadList(true) 回顶重置。
 * 【不拆分说明】本文件 > 500 行：页面为双段长列表（触底分派 + 保量刷新 + 回位共用同一份
 * 状态与映射函数），拆分会割裂 epoch 竞态守卫与索引重建逻辑，故保持单文件（长列表页豁免）。
 * 视觉遵循 Steep 设计体系（eval-auth-hifi.html 屏B）一比一还原。
 */
import type { components } from "../../../types/api-types";
import { request } from "../../../utils/request";
import { getAccessToken, getCAccessToken } from "../../../utils/token";
import { resolveImageUrl } from "../../../utils/url";
import { formatDate } from "../../../utils/valuation-display";
import {
  cardTimeLabel,
  FRESHNESS_LABELS,
  freshnessLevel,
  isFreshnessWindow,
} from "../../../utils/valuation-freshness";

type QueueItem = components["schemas"]["PendingAssessmentQueueItem"];
type HandledItem = components["schemas"]["HandledItem"];
type QueueResponse = components["schemas"]["PendingAssessmentQueueResponse"];
type HandledResponse = components["schemas"]["HandledAssessmentQueueResponse"];

/** 每页数量. */
const PAGE_SIZE = 10;

/** 已处理卡右上状态标签语义（对齐设计稿：已授权绿 / 已看房绿 / 已驳回灰 / 他司成交 rust / 已签约 ink）. */
const HANDLED_STATUS_META: Record<string, { tagText: string; tagClass: string }> = {
  pending_visit: { tagText: "已授权", tagClass: "green" },
  visited: { tagText: "已看房", tagClass: "green" },
  signed: { tagText: "已签约", tagClass: "ink" },
  rejected: { tagText: "已驳回", tagClass: "gray" },
  lost_to_competitor: { tagText: "他司成交", tagClass: "rust" },
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

/** 已处理卡片展示结构（与待评估卡同构 + 状态标签 / 时效标签）. */
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
  /** 时效标签文案（「跟进中」等）；终态与其余状态为空串（右下角留空）. */
  freshText: string;
  /** 时效样式档（ok/soon/over）；空串不渲染. */
  freshClass: string;
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
  /** 已处理段当前页码（独立于待评估段分页）. */
  handledPage: number;
  /** 已处理段翻页进行中. */
  handledLoadingMore: boolean;
  /** 已处理段已加载满全量. */
  handledNoMore: boolean;
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
  /** 滚动位置跟踪：onPageScroll 持续记录，保量刷新后 selector 未命中时 scrollTop 兜底恢复用 */
  _lastScrollTop: number;
  /** 跳转详情前记录的线索 id：保量刷新完成后精准回位到该卡，消费后即清空 */
  _returnFocusId: string;
  /** 保量刷新进行中：拦截触底翻页，避免与整体替换 setData 竞态 */
  _refreshing: boolean;
  loadList(reset?: boolean, silent?: boolean): void;
  loadHandledMore(): Promise<void>;
  /** 返回场景保量刷新：按各自已加载页数并行重拉双段并精准回位（不重置到第 1 页） */
  refreshKeepingDepth(): Promise<void>;
  /** 刷新完成后回位：优先定位刚操作的线索卡，未命中则恢复记录的滚动位置 */
  restoreReturnFocus(): void;
  /** 主动刷新（下拉/搜索/重试）前清空回位锚点：用户预期回顶重置 */
  clearReturnAnchor(): void;
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
    handledPage: 1,
    handledLoadingMore: false,
    handledNoMore: false,
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

  _lastScrollTop: 0,

  _returnFocusId: "",

  _refreshing: false,

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
    const meta = HANDLED_STATUS_META[item.status] ?? { tagText: item.status_display, tagClass: "gray" };
    const src = sourceParts(item.source);
    // 已授权/已看房卡展示授权价（绿色）；reject/lost 不涉及评估价，报价显示「—」
    const approved = ADJUSTABLE_STATUSES.indexOf(item.status) >= 0;
    const price = approved
      ? priceParts(item.eval_price)
      : { value: "—", unit: "" };
    // 左槽时间与右下角时效标签同源：基准 = last_follow_up_at ?? audit_time
    // （已处理段 audit_time 恒非空且无 created_at 字段，终态回退天然可用）
    const timeLabel = cardTimeLabel({
      status: item.status,
      lastFollowUpAt: item.last_follow_up_at,
      auditTime: item.audit_time,
    });
    // 时效三态仅出现在跟进窗口（pending_visit/visited）；终态与其余状态右下角留空
    const fresh = isFreshnessWindow(item.status)
      ? freshnessLevel(item.last_follow_up_at || item.audit_time)
      : null;
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
      timeText: `${timeLabel.prefix} ${timeLabel.text}`,
      sourceText: src.text,
      sourceClass: src.cls,
      freshText: fresh ? FRESHNESS_LABELS[fresh] : "",
      freshClass: fresh ?? "",
    };
  },

  onShow() {
    if (!hasAnyToken()) {
      this.setData({ needLogin: true, loading: false, loadingMore: false });
      return;
    }
    if (this.data.pendingItems.length === 0 && this.data.handledItems.length === 0) {
      this.loadList(true, false);
    } else {
      // 已有数据（详情页 navigateBack 返回）：保量刷新并回位，
      // 避免重置到第 1 页导致内容塌缩、滚动位置丢失
      this.refreshKeepingDepth();
    }
  },

  onPageScroll(e: { scrollTop: number }) {
    this._lastScrollTop = e.scrollTop;
  },

  async loadList(reset = false, silent = false) {
    if (!hasAnyToken()) {
      this.setData({ needLogin: true, loading: false, loadingMore: false, handledLoadingMore: false });
      return;
    }
    if (reset) {
      // epoch 守卫：静默刷新/下拉刷新/搜索使旧代在途请求失效
      this._epoch += 1;
    }
    const myEpoch = this._epoch;
    if (reset) {
      // handledLoadingMore 必须在此释放：在途的 loadHandledMore 会因 epoch 失配直接 return
      // 且跳过其 finally，若不主动复位该标记将永久拦截 onReachBottom（双段均无法翻页）
      this.setData({
        error: false,
        noMore: false,
        needLogin: false,
        forbidden: false,
        handledLoadingMore: false,
        ...(silent ? {} : { loading: true }),
      });
    } else {
      this.setData({ loadingMore: true });
    }
    try {
      const page = reset ? 1 : this.data.page;
      const search = this.data.search.trim();
      const searchParams = search ? { search } : {};
      if (reset) {
        // reset：双接口并行拉取（待评估第 1 页 + 已处理第 1 页），search 对两段同时生效
        const [data, handledData] = await Promise.all([
          request<QueueResponse>({
            url: "/public/leads/pending-assessment",
            data: { page: 1, page_size: this.data.pageSize, ...searchParams },
          }),
          request<HandledResponse>({
            url: "/public/leads/handled-assessment",
            data: { page: 1, page_size: this.data.pageSize, ...searchParams },
          }),
        ]);
        if (myEpoch !== this._epoch) {
          return; // 过期代整体丢弃
        }
        // 重建原始项索引，供 onItemTap/onHandledTap 传递全景数据
        this._rawById = {};
        this._handledById = {};
        data.items_pending.forEach((it) => {
          this._rawById[it.id] = it;
        });
        handledData.items.forEach((it) => {
          this._handledById[it.id] = it;
        });
        this.setData({
          pendingItems: data.items_pending.map((it) => this.toPendingCard(it)),
          pendingTotal: data.pending_total,
          pendingToday: data.pending_today,
          handledItems: handledData.items.map((it) => this.toHandledCard(it)),
          handledTotal: handledData.handled_total,
          handledPage: 1,
          handledNoMore: handledData.items.length >= handledData.handled_total,
          page: 1,
          noMore: data.items_pending.length >= data.pending_total,
        });
      } else {
        // 待评估段翻页：索引路径局部 setData，payload 不随累计页数增长
        const data = await request<QueueResponse>({
          url: "/public/leads/pending-assessment",
          data: { page, page_size: this.data.pageSize, ...searchParams },
        });
        if (myEpoch !== this._epoch) {
          return; // 过期代整体丢弃
        }
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

  /** 已处理段触底翻页（范式与待评估段一致：三重拦截 / epoch 守卫 / 索引路径追加 / 失败回滚）. */
  async loadHandledMore() {
    if (
      !hasAnyToken() ||
      this.data.handledLoadingMore ||
      this.data.handledNoMore ||
      this.data.handledItems.length >= this.data.handledTotal
    ) {
      return;
    }
    const myEpoch = this._epoch;
    const page = this.data.handledPage + 1;
    this.setData({ handledLoadingMore: true, handledPage: page });
    try {
      const search = this.data.search.trim();
      const data = await request<HandledResponse>({
        url: "/public/leads/handled-assessment",
        data: {
          page,
          page_size: this.data.pageSize,
          ...(search ? { search } : {}),
        },
      });
      if (myEpoch !== this._epoch) {
        return; // 过期代整体丢弃
      }
      const newItems = data.items.map((it) => this.toHandledCard(it));
      data.items.forEach((it) => {
        this._handledById[it.id] = it;
      });
      const patch: Record<string, unknown> = {
        handledTotal: data.handled_total,
        handledNoMore: this.data.handledItems.length + newItems.length >= data.handled_total,
      };
      const base = this.data.handledItems.length;
      newItems.forEach((it, i) => {
        patch[`handledItems[${base + i}]`] = it;
      });
      this.setData(patch);
    } catch (err) {
      if (myEpoch !== this._epoch) {
        return; // 过期请求不弹 toast、不切状态、不回滚页码
      }
      // 翻页失败：回滚页码并重置 noMore，避免下次触底被拦截跳过本页
      this.setData({ handledPage: Math.max(1, this.data.handledPage - 1), handledNoMore: false });
      wx.showToast({ title: "加载失败，请重试", icon: "none" });
    } finally {
      if (myEpoch === this._epoch) {
        this.setData({ handledLoadingMore: false });
      }
    }
  },

  /**
   * 返回场景保量刷新：按各自已加载页数并行重拉双段（page=1..N，页序拼接 + id 去重，
   * 吸收期间新增/流转导致的页边界条目平移），整体替换后内容量与刷新前一致（不塌缩），
   * 原生滚动位置得以保留；完成后按 _returnFocusId 精准回位。
   * 失败时保留旧数据（数据可能略旧但不跳顶），仅 toast 提示。
   * ⚠️ 与主动刷新语义不同：下拉/搜索/重试仍走 loadList(true) 回顶重置。
   */
  async refreshKeepingDepth() {
    if (!hasAnyToken()) {
      this.setData({ needLogin: true, loading: false, loadingMore: false, handledLoadingMore: false });
      return;
    }
    this._refreshing = true;
    this._epoch += 1;
    const myEpoch = this._epoch;
    const search = this.data.search.trim();
    const searchParams = search ? { search } : {};
    // 按已加载数折算页数（ceil），比 data.page 更贴近实际行数（noMore 后两者一致）
    const pendingPages = Math.max(1, Math.ceil(this.data.pendingItems.length / PAGE_SIZE));
    const handledPages = Math.max(1, Math.ceil(this.data.handledItems.length / PAGE_SIZE));
    try {
      const [pendingPagesData, handledPagesData] = await Promise.all([
        Promise.all(
          Array.from({ length: pendingPages }, (_, i) =>
            request<QueueResponse>({
              url: "/public/leads/pending-assessment",
              data: { page: i + 1, page_size: PAGE_SIZE, ...searchParams },
            }),
          ),
        ),
        Promise.all(
          Array.from({ length: handledPages }, (_, i) =>
            request<HandledResponse>({
              url: "/public/leads/handled-assessment",
              data: { page: i + 1, page_size: PAGE_SIZE, ...searchParams },
            }),
          ),
        ),
      ]);
      if (myEpoch !== this._epoch) {
        return; // 过期代整体丢弃
      }
      const rawPending: QueueItem[] = [];
      const seenPending = new Set<string>();
      pendingPagesData.forEach((d) => {
        d.items_pending.forEach((it) => {
          if (!seenPending.has(it.id)) {
            seenPending.add(it.id);
            rawPending.push(it);
          }
        });
      });
      const rawHandled: HandledItem[] = [];
      const seenHandled = new Set<string>();
      handledPagesData.forEach((d) => {
        d.items.forEach((it) => {
          if (!seenHandled.has(it.id)) {
            seenHandled.add(it.id);
            rawHandled.push(it);
          }
        });
      });
      // 重建原始项索引，供 onItemTap/onHandledTap 传递全景数据
      this._rawById = {};
      this._handledById = {};
      rawPending.forEach((it) => {
        this._rawById[it.id] = it;
      });
      rawHandled.forEach((it) => {
        this._handledById[it.id] = it;
      });
      const pendingTotal = pendingPagesData[0].pending_total;
      const pendingToday = pendingPagesData[0].pending_today;
      const handledTotal = handledPagesData[0].handled_total;
      this.setData(
        {
          pendingItems: rawPending.map((it) => this.toPendingCard(it)),
          pendingTotal,
          pendingToday,
          // 页码收敛为实际加载页数（期间总数变少时按返回条数折算）
          page: Math.max(1, Math.ceil(rawPending.length / PAGE_SIZE)),
          noMore: rawPending.length >= pendingTotal,
          handledItems: rawHandled.map((it) => this.toHandledCard(it)),
          handledTotal,
          handledPage: Math.max(1, Math.ceil(rawHandled.length / PAGE_SIZE)),
          handledNoMore: rawHandled.length >= handledTotal,
        },
        () => {
          this.restoreReturnFocus();
        },
      );
    } catch (err) {
      if (myEpoch !== this._epoch) {
        return; // 过期请求不弹 toast、不切状态
      }
      const statusCode = (err as { statusCode?: number } | undefined)?.statusCode;
      if (statusCode === 403) {
        // 无 admin/operator 角色：隐藏入口不发起后续调用
        this.setData({ forbidden: true, pendingItems: [], handledItems: [] });
      } else if (statusCode === 401) {
        this.setData({ needLogin: true, pendingItems: [], handledItems: [] });
      } else {
        // 保量刷新失败：保留旧数据不塌缩、不跳顶，仅提示数据可能未更新
        wx.showToast({ title: "刷新失败，数据可能未更新", icon: "none" });
      }
    } finally {
      if (myEpoch === this._epoch) {
        this._refreshing = false;
      }
    }
  },

  /** 刷新完成后回位：优先精准定位到跳转前记录的卡片，未命中则恢复记录的滚动位置. */
  restoreReturnFocus() {
    // 刷新期间用户可能已再次点卡进入详情：pageScrollTo 只作用于栈顶页，须跳过本次回位
    // （保留 _returnFocusId 由二次跳转覆盖，返回后的下一轮刷新按最新锚点回位）
    const pages = getCurrentPages();
    if (pages[pages.length - 1] !== this) {
      return;
    }
    const focusId = this._returnFocusId;
    this._returnFocusId = "";
    if (focusId) {
      const exists =
        this.data.pendingItems.some((it) => it.id === focusId) ||
        this.data.handledItems.some((it) => it.id === focusId);
      if (exists) {
        wx.pageScrollTo({ selector: `[data-id="${focusId}"]`, duration: 0 });
        return;
      }
    }
    if (this._lastScrollTop > 0) {
      wx.pageScrollTo({ scrollTop: this._lastScrollTop, duration: 0 });
    }
  },

  /** 主动刷新（下拉/搜索/重试）前清空回位锚点：用户预期回顶重置，无需恢复位置. */
  clearReturnAnchor() {
    this._returnFocusId = "";
    this._lastScrollTop = 0;
  },

  onReachBottom() {
    // 三重拦截：任一段加载中不重复触发（保量刷新期间一并拦截）
    if (this._refreshing || this.data.loading || this.data.loadingMore || this.data.handledLoadingMore) {
      return;
    }
    // 已处理组物理位于页面底部，触底优先加载已处理段
    if (this.data.handledItems.length < this.data.handledTotal) {
      this.loadHandledMore();
      return;
    }
    // 已处理已加载满：兜底加载待评估段（三重拦截：无更多 / 已加载满）
    if (this.data.noMore || this.data.pendingItems.length >= this.data.pendingTotal) {
      return;
    }
    this.setData({ page: this.data.page + 1 });
    this.loadList(false);
  },

  async onPullDownRefresh() {
    // 下拉刷新重取双段；等 loadList 结束再停止动画
    this.clearReturnAnchor();
    await this.loadList(true, true);
    wx.stopPullDownRefresh();
  },

  onSearchInput(e: WechatMiniprogram.Input) {
    this.setData({ search: e.detail.value || "" });
  },

  onSearchConfirm() {
    // 搜索小区名称：search 随 reset 同时作用于待评估与已处理两段（服务端过滤）
    this.clearReturnAnchor();
    this.loadList(true);
  },

  onClearSearch() {
    if (!this.data.search) {
      return;
    }
    this.setData({ search: "" });
    this.clearReturnAnchor();
    this.loadList(true);
  },

  onItemTap(e: WechatMiniprogram.BaseEvent) {
    const id = e.currentTarget.dataset.id as string;
    const raw = this._rawById[id];
    if (!raw) {
      return;
    }
    // 记录回位锚点：返回后保量刷新完成时精准定位到本卡
    this._returnFocusId = id;
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
    // 记录回位锚点：跟进/调整评估价提交返回后精准定位到本卡
    this._returnFocusId = id;
    wx.navigateTo({
      url: `/pages/valuation/authorize/index?id=${id}&mode=view`,
      success: (res) => {
        res.eventChannel.emit("leadDetail", raw);
      },
    });
  },

  onGoLogin() {
    // 统一走正式登录页；from=valuation 让登录成功后 navigateBack 返回本页（onShow 自动刷新）
    wx.navigateTo({ url: "/pages/login/index/index?from=valuation" });
  },

  onRetry() {
    this.clearReturnAnchor();
    this.loadList(true);
  },
});
