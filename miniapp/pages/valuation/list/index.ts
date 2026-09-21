/**
 * 「我的评估」列表页.
 *
 * 具备 C 端身份的内部员工（后端按其 customer 身份签发 aud=c 令牌）可正常访问 C 端
 * /public/leads/mine 查看自己的评估；仅当请求返回 401（admin 令牌受众不匹配）或 403
 * （无 C 端身份）时，才展示内部限定态，而非误判为「登录已失效」清空有效登录态。
 * 卡片骨架与令牌（lcard/stag/fresh）与评估工作台 evaluate 同源：状态标签走
 * statusTagClass 令牌类（不消费后端 status_color 饱和色），时效标签复用
 * utils/valuation-freshness 纯函数（仅 pending_visit/visited 出现）。
 * 滚动位置保持：从详情页（跟进登记）navigateBack 返回时 onShow 走「保量刷新」
 * （按已加载页数并行重拉、页序拼接 + id 去重，内容量不塌缩），完成后按跳转前
 * 记录的线索 id 精准回位（pageScrollTo selector），未命中再回退恢复 scrollTop；
 * 下拉刷新/重试仍走 reset 式 loadList(true) 回顶重置。
 */
import type { components } from "../../../types/api-types";
import { request } from "../../../utils/request";
import { getAccessToken, getCAccessToken } from "../../../utils/token";
import { resolveImageUrl } from "../../../utils/url";
import { statusTagClass } from "../../../utils/valuation-display";
import {
  cardTimeLabel,
  FRESHNESS_LABELS,
  freshnessLevel,
  isFreshnessWindow,
} from "../../../utils/valuation-freshness";
import { fetchValuationSubscribeTemplate, requestValuationPriceSubscribe } from "../../../utils/valuation-notify";

type LeadItem = components["schemas"]["PublicLeadListItem"];

/** 每页数量. */
const PAGE_SIZE = 10;

/** 列表卡展示结构（与 evaluate 的 lcard 三段同构：top / mid / foot）. */
interface DisplayItem {
  id: string;
  name: string;
  tagText: string;
  tagClass: string;
  image: string;
  /** 参数行一：户型 · 面积 · 楼层. */
  l1: string;
  /** 参数行二：区域 · 朝向. */
  l2: string;
  priceLabel: string;
  priceValue: string;
  priceUnit: string;
  priceOk: boolean;
  timeText: string;
  /** 时效标签文案（「跟进中」等）；非跟进窗口为空串（右下角留空）. */
  freshText: string;
  /** 时效样式档（ok/soon/over）；空串不渲染. */
  freshClass: string;
}

/** 页面 data. */
interface PageData {
  items: DisplayItem[];
  page: number;
  pageSize: number;
  total: number;
  loading: boolean;
  loadingMore: boolean;
  error: boolean;
  noMore: boolean;
  /** 未登录（无 access_token）. */
  needLogin: boolean;
  /** 无 C 端身份（admin 令牌受众不匹配 / 403）时展示内部限定态，而非登录失效. */
  internalOnly: boolean;
  /** 「授权价提醒」授权入口可见（后端已下发订阅模板 ID）. */
  notifyBanner: boolean;
}

/** 页面自定义方法（含非响应式实例字段）. */
interface PageCustom {
  /** 请求时代戳：每次 reset 加载（onShow 刷新/下拉刷新/重试）+1，用于丢弃晚到的旧代响应（竞态守卫） */
  _epoch: number;
  /** 滚动位置跟踪：onPageScroll 持续记录，保量刷新后 selector 未命中时 scrollTop 兜底恢复用 */
  _lastScrollTop: number;
  /** 跳转详情前记录的线索 id：保量刷新完成后精准回位到该卡，消费后即清空 */
  _returnFocusId: string;
  /** 保量刷新进行中：拦截触底翻页，避免与整体替换 setData 竞态 */
  _refreshing: boolean;
  /** 「授权价提醒」订阅模板 ID（后端未配置/取数失败为 null，入口隐藏）. */
  subscribeTemplateId: string | null;
  getToken(): string;
  loadList(reset?: boolean, silent?: boolean): void;
  /** 返回场景保量刷新：按已加载页数并行重拉并精准回位（不重置到第 1 页） */
  refreshKeepingDepth(): Promise<void>;
  /** 刷新完成后回位：优先定位刚操作的线索卡，未命中则恢复记录的滚动位置 */
  restoreReturnFocus(): void;
  /** 主动刷新（下拉/重试）前清空回位锚点：用户预期回顶重置 */
  clearReturnAnchor(): void;
  toDisplay(item: LeadItem): DisplayItem;
  clearToken(): void;
  onItemTap(e: WechatMiniprogram.BaseEvent): void;
  onGoLogin(): void;
  onGoValuation(): void;
  onRetry(): void;
  onSubscribeTap(): void;
}

Page<PageData, PageCustom>({
  data: {
    items: [],
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
    loading: false,
    loadingMore: false,
    error: false,
    noMore: false,
    needLogin: false,
    internalOnly: false,
    notifyBanner: false,
  },

  _epoch: 0,

  _lastScrollTop: 0,

  _returnFocusId: "",

  _refreshing: false,

  subscribeTemplateId: null,

  onLoad() {
    // 预取「授权价提醒」订阅模板 ID（静默失败置 null，授权入口隐藏）
    fetchValuationSubscribeTemplate().then((templateId) => {
      this.subscribeTemplateId = templateId;
      this.setData({ notifyBanner: !!templateId });
    });
  },

  getToken() {
    return getAccessToken();
  },

  clearToken() {
    wx.removeStorageSync("access_token");
    wx.removeStorageSync("refresh_token");
    wx.removeStorageSync("c_access_token");
    wx.removeStorageSync("c_refresh_token");
  },

  toDisplay(item: LeadItem): DisplayItem {
    // 参数行拼接：空段过滤，全空回退「—」（与 evaluate 的 attrsLine 同口径）
    const l1 = [item.layout, item.area != null ? `${item.area}㎡` : "", item.floor_info].filter(Boolean).join(" · ");
    const l2 = [item.district, item.orientation].filter(Boolean).join(" · ");
    // 价格栈：评估价（绿）；未出价回退业主报价（墨）
    const evaluated = item.eval_price != null;
    const priceValue = evaluated
      ? `${item.eval_price}`
      : item.expected_price != null
        ? `${item.expected_price}`
        : "—";
    // 左槽时间与右侧时效标签同源（同一份纯函数、同一套出现窗口）
    const timeLabel = cardTimeLabel({
      status: item.status,
      lastFollowUpAt: item.last_follow_up_at,
      auditTime: item.audit_time,
      createdAt: item.created_at,
    });
    const fresh = isFreshnessWindow(item.status)
      ? freshnessLevel(item.last_follow_up_at || item.audit_time)
      : null;
    return {
      id: item.id,
      name: item.community_name,
      tagText: item.status_display,
      tagClass: statusTagClass(item.status),
      image:
        item.image_thumbnails && item.image_thumbnails.length > 0
          ? resolveImageUrl(item.image_thumbnails[0], { width: 240 })
          : "",
      l1: l1 || "—",
      l2,
      priceLabel: evaluated ? "评估价" : "业主报价",
      priceValue,
      priceUnit: priceValue === "—" ? "" : "万",
      priceOk: evaluated,
      timeText: `${timeLabel.prefix} ${timeLabel.text}`,
      freshText: fresh ? FRESHNESS_LABELS[fresh] : "",
      freshClass: fresh ?? "",
    };
  },

  onShow() {
    const cToken = getCAccessToken();
    const adminToken = this.getToken();
    if (!cToken && !adminToken) {
      this.setData({ needLogin: true, loading: false, loadingMore: false });
      return;
    }
    if (this.data.items.length === 0) {
      // 首次进入 / 空态：骨架屏加载
      this.loadList(true, false);
    } else {
      // 已有数据（详情页 navigateBack 返回）：保量刷新并回位，
      // 避免重置到第 1 页导致内容塌缩、滚动位置丢失；
      // 用于从「估价提交」/「详情」页返回时，能展示最新状态。
      this.refreshKeepingDepth();
    }
  },

  onPageScroll(e: { scrollTop: number }) {
    this._lastScrollTop = e.scrollTop;
  },

  /**
   * 返回场景保量刷新：按已加载页数并行重拉（page=1..N，页序拼接 + id 去重，
   * 吸收期间新增/流转导致的页边界条目平移），整体替换后内容量与刷新前一致
   * （不塌缩），原生滚动位置得以保留；完成后按 _returnFocusId 精准回位。
   * 失败时保留旧数据（数据可能略旧但不跳顶），仅 toast 提示。
   * ⚠️ 与主动刷新语义不同：下拉刷新/重试仍走 loadList(true) 回顶重置。
   */
  async refreshKeepingDepth() {
    const cToken = getCAccessToken();
    const adminToken = this.getToken();
    if (!cToken && !adminToken) {
      this.setData({ needLogin: true, loading: false, loadingMore: false });
      return;
    }
    this._refreshing = true;
    this._epoch += 1;
    const myEpoch = this._epoch;
    // 按已加载数折算页数（ceil），比 data.page 更贴近实际行数（noMore 后两者一致）
    const pages = Math.max(1, Math.ceil(this.data.items.length / PAGE_SIZE));
    try {
      const pagesData = await Promise.all(
        Array.from({ length: pages }, (_, i) =>
          request<components["schemas"]["PublicLeadListResponse"]>({
            url: "/public/leads/mine",
            data: { page: i + 1, page_size: PAGE_SIZE },
            // 不传 header，request.ts 按 /public/* 自动注入 c_access_token
          }),
        ),
      );
      if (myEpoch !== this._epoch) {
        return; // 过期代整体丢弃
      }
      // 页序拼接 + id 去重（期间新增/流转会使相邻页边界条目重复）
      const rawItems: LeadItem[] = [];
      const seen = new Set<string>();
      pagesData.forEach((d) => {
        d.items.forEach((it) => {
          if (!seen.has(it.id)) {
            seen.add(it.id);
            rawItems.push(it);
          }
        });
      });
      const total = pagesData[0].total;
      this.setData(
        {
          items: rawItems.map((it) => this.toDisplay(it)),
          total,
          // 页码收敛为实际加载页数（期间总数变少时按返回条数折算）
          page: Math.max(1, Math.ceil(rawItems.length / PAGE_SIZE)),
          noMore: rawItems.length >= total,
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
      // 401（受众不匹配/令牌失效）或 403（无 C 端身份）时与 loadList 同口径：
      // 有 admin 令牌 → 内部限定态；无 admin 令牌 → 清 token 切「登录已失效」态
      if (statusCode === 401 || statusCode === 403) {
        if (adminToken) {
          this.setData({ internalOnly: true, items: [], total: 0 });
        } else {
          this.clearToken();
          this.setData({ needLogin: true, items: [], total: 0 });
        }
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
      const exists = this.data.items.some((it) => it.id === focusId);
      if (exists) {
        wx.pageScrollTo({ selector: `[data-id="${focusId}"]`, duration: 0 });
        return;
      }
    }
    if (this._lastScrollTop > 0) {
      wx.pageScrollTo({ scrollTop: this._lastScrollTop, duration: 0 });
    }
  },

  /** 主动刷新（下拉/重试）前清空回位锚点：用户预期回顶重置，无需恢复位置. */
  clearReturnAnchor() {
    this._returnFocusId = "";
    this._lastScrollTop = 0;
  },

  async loadList(reset = false, silent = false) {
    const cToken = getCAccessToken();
    const adminToken = this.getToken();
    if (!cToken && !adminToken) {
      this.setData({ needLogin: true, loading: false, loadingMore: false });
      return;
    }
    if (reset) {
      // epoch 守卫：onShow 静默刷新/下拉刷新/重试使旧代在途请求失效（竞态丢弃）
      this._epoch += 1;
    }
    const myEpoch = this._epoch;
    if (reset) {
      // silent 时不置 loading（保留当前列表，避免骨架屏闪烁）
      this.setData({
        error: false,
        noMore: false,
        needLogin: false,
        internalOnly: false,
        ...(silent ? {} : { loading: true }),
      });
    } else {
      this.setData({ loadingMore: true });
    }
    try {
      // reset 时强制 page=1
      const page = reset ? 1 : this.data.page;
      const data = await request<components["schemas"]["PublicLeadListResponse"]>({
        url: "/public/leads/mine",
        data: { page, page_size: this.data.pageSize },
        // 不传 header，request.ts 按 /public/* 自动注入 c_access_token
      });
      if (myEpoch !== this._epoch) {
        // 请求已过期（期间发生了新的 reset 加载），整体丢弃，不触碰当前状态
        return;
      }
      const newItems = data.items.map((it) => this.toDisplay(it));
      if (reset) {
        this.setData({
          items: newItems,
          total: data.total,
          page,
          noMore: newItems.length >= data.total,
        });
      } else {
        // 翻页追加：索引路径局部 setData，payload 不随累计页数增长（P-05）
        const patch: Record<string, unknown> = {
          total: data.total,
          page,
          noMore: this.data.items.length + newItems.length >= data.total,
        };
        const base = this.data.items.length;
        newItems.forEach((it, i) => {
          patch[`items[${base + i}]`] = it;
        });
        this.setData(patch);
      }
    } catch (err) {
      if (myEpoch !== this._epoch) {
        // 过期请求的失败不清 token、不切内部限定态、不回滚页码、不弹 toast
        return;
      }
      const statusCode = (err as { statusCode?: number } | undefined)?.statusCode;
      // /public/leads/mine 要求 C 端令牌（aud=c）；401（受众不匹配/令牌失效）或 403（无 C 端身份）时：
      // - 有 admin 令牌但 C 端令牌缺失/失效（内部员工）→ 展示内部限定态，保留有效后台登录态；
      // - 无 admin 令牌（纯 C 端用户，令牌失效）→ 清 token 并切「登录已失效」态。
      if (statusCode === 401 || statusCode === 403) {
        if (adminToken) {
          this.setData({ internalOnly: true, items: [], total: 0 });
        } else {
          this.clearToken();
          this.setData({ needLogin: true, items: [], total: 0 });
        }
      } else if (reset) {
        // silent 时保留旧数据，避免返回刷新失败时误清列表
        if (!silent) {
          this.setData({ error: true, items: [] });
        }
      } else {
        // 翻页失败：回滚页码并重置 noMore，避免下次触底被 noMore 拦截跳过本页（弱网下不丢数据）
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
    // 限流防抖：加载中（含保量刷新）或无更多直接 return
    if (this._refreshing || this.data.loading || this.data.loadingMore || this.data.noMore) {
      return;
    }
    if (this.data.items.length >= this.data.total) {
      return;
    }
    this.setData({ page: this.data.page + 1 });
    this.loadList(false);
  },

  async onPullDownRefresh() {
    // loadList 异步，需等其结束（含无 token 提前返回 / catch）后再停止下拉刷新，
    // 否则刷新动画会在请求完成前提前消失；silent 避免与下拉动画叠加骨架屏闪烁
    this.clearReturnAnchor();
    await this.loadList(true, true);
    wx.stopPullDownRefresh();
  },

  onItemTap(e: WechatMiniprogram.BaseEvent) {
    const id = e.currentTarget.dataset.id as string;
    // 记录回位锚点：返回后保量刷新完成时精准定位到本卡
    this._returnFocusId = id;
    wx.navigateTo({ url: `/pages/valuation/detail/index?id=${id}` });
  },

  onGoLogin() {
    // 统一走正式登录页；from=valuation 让登录成功后 navigateBack 返回本页（onShow 自动刷新）
    wx.navigateTo({ url: "/pages/login/index/index?from=valuation" });
  },

  onGoValuation() {
    // submit 页为 tabBar 页，必须用 switchTab 跳转（navigateTo 会报错）
    wx.switchTab({ url: "/pages/valuation/submit/index" });
  },

  onRetry() {
    this.clearReturnAnchor();
    this.loadList(true);
  },

  /**
   * 「授权价提醒」授权入口：发起一次性订阅授权（积累推送额度）.
   * ⚠️ wx.requestSubscribeMessage 必须在 tap 手势回调内同步调用；
   * 用户允许/拒绝均静默（授权结果反馈由 utils 内 toast/modal 承担）.
   */
  onSubscribeTap() {
    requestValuationPriceSubscribe(this.subscribeTemplateId);
  },
});
