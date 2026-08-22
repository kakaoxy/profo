/**
 * ① 项目列表页（profile 页「项目记账」内部入口的落地页）.
 *
 * 面向项目记账的项目选择：全状态项目分页列表 + 小区名搜索。
 * 仅内部员工（admin 令牌）可访问：
 * - GET /projects?keyword=&contract_sort=true&page=&page_size=20 分页拉取，触底 onReachBottom 追加去重；
 * - 401（令牌失效）→ 清后台令牌切「登录已失效」；403（无 project:read）→ 无权限态不清令牌；
 * - 不复用 createProjectListPage 工厂（其绑定 status 过滤 + my-responsible 回退通道，
 *   本页需全状态 + community_name 搜索，独立实现更简单清晰）。
 */
import type { components } from "../../../../types/api-types";
import { request } from "../../../../utils/request";
import { getAccessToken } from "../../../../utils/token";

type ProjectResponse = components["schemas"]["ProjectResponse"];

/** 项目状态 → 展示中文 + 状态色（对齐后台 status-colors 语义）. */
const STATUS_DISPLAY: Record<string, { label: string; color: string }> = {
  signing: { label: "在签", color: "#b98a2e" },
  renovating: { label: "装修中", color: "#f97316" },
  selling: { label: "在售", color: "#005daa" },
  sold: { label: "已售", color: "#64748b" },
  ended: { label: "已下架", color: "#78716c" },
  deleted: { label: "已删除", color: "#a3a6af" },
};

/** 业务模式展示文案：agent→代理美化 / wholesale→收购美化 / 其他→不显示. */
const BUSINESS_FORM_TEXT: Record<string, string> = {
  agent: "代理美化",
  wholesale: "收购美化",
};

/** 每页条数（与 project-list-page 一致）. */
const PAGE_SIZE = 20;

/** 状态筛选选项（全部需传空值）. */
const STATUS_FILTERS: { label: string; value: string }[] = [
  { label: "全部", value: "" },
  { label: "签约", value: "signing" },
  { label: "装修", value: "renovating" },
  { label: "在售", value: "selling" },
  { label: "已售", value: "sold" },
  { label: "已下架", value: "ended" },
];

/** 列表页状态机. */
type ListState = "loading" | "items" | "empty" | "error" | "needLogin" | "noPermission";

/** 列表项展示结构. */
interface DisplayItem {
  id: string;
  name: string;
  communityName: string;
  statusText: string;
  statusColor: string;
  /** 原始业务模式值（agent/wholesale/空），透传给详情/记账页用于科目 mode 过滤. */
  businessForm: string;
  businessFormText: string;
  showBusinessForm: boolean;
}

/** 页面 data. */
interface PageData {
  state: ListState;
  items: DisplayItem[];
  page: number;
  total: number;
  hasMore: boolean;
  loadingMore: boolean;
  keyword: string;
  statusFilter: string;
  statusFilters: { label: string; value: string }[];
}

/** 页面自定义方法. */
interface PageCustom {
  inFlight: boolean;
  _rawItems: ProjectResponse[];
  getToken(): string;
  clearToken(): void;
  onShow(): void;
  loadList(): void;
  applyItems(projects: ProjectResponse[], mode: "replace" | "append"): void;
  onReachBottom(): void;
  onSearchInput(e: WechatMiniprogram.Input): void;
  onSearchConfirm(): void;
  onFilterTap(e: WechatMiniprogram.BaseEvent): void;
  onItemTap(e: WechatMiniprogram.BaseEvent): void;
  onRetry(): void;
  onGoLogin(): void;
}

Page<PageData, PageCustom>({
  inFlight: false,
  _rawItems: [],

  data: {
    state: "loading",
    items: [],
    page: 1,
    total: 0,
    hasMore: false,
    loadingMore: false,
    keyword: "",
    statusFilter: "",
    statusFilters: STATUS_FILTERS,
  },

  getToken() {
    return getAccessToken();
  },

  clearToken() {
    // 401 仅清后台令牌，C 端令牌由独立生命周期管理，避免破坏仍有效的 C 端登录态
    wx.removeStorageSync("access_token");
    wx.removeStorageSync("refresh_token");
  },

  onShow() {
    this.loadList();
  },

  async loadList() {
    if (this.inFlight) {
      return;
    }
    this.inFlight = true;
    try {
      const token = this.getToken();
      if (!token) {
        this.setData({ state: "needLogin", items: [] });
        return;
      }
      this.setData({ state: "loading", items: [], page: 1, hasMore: false, loadingMore: false });
      const keyword = this.data.keyword.trim();
      const params = ["page=1", `page_size=${PAGE_SIZE}`, "contract_sort=true"];
      if (keyword) {
        params.push(`keyword=${encodeURIComponent(keyword)}`);
      }
      if (this.data.statusFilter) {
        params.push(`status=${this.data.statusFilter}`);
      }
      try {
        const data = await request<{
          items: ProjectResponse[];
          total: number;
          page: number;
          page_size: number;
        }>({
          url: `/projects?${params.join("&")}`,
          header: { Authorization: `Bearer ${token}` },
        });
        const items = data.items ?? [];
        const total = data.total ?? 0;
        this.applyItems(items, "replace");
        this.setData({ page: 1, total, hasMore: items.length < total });
      } catch (err) {
        const statusCode = (err as { statusCode?: number } | undefined)?.statusCode;
        if (statusCode === 401) {
          this.clearToken();
          this.setData({ state: "needLogin", items: [] });
        } else if (statusCode === 403) {
          this.setData({ state: "noPermission", items: [] });
        } else {
          this.setData({ state: "error", items: [] });
        }
      }
    } finally {
      this.inFlight = false;
    }
  },

  applyItems(projects: ProjectResponse[], mode: "replace" | "append") {
    if (mode === "replace") {
      this._rawItems = projects;
    } else {
      // 触底追加下一页：按 id 去重（新值覆盖旧值）
      const map = new Map<string, ProjectResponse>();
      [...this._rawItems, ...projects].forEach((p) => map.set(p.id, p));
      this._rawItems = [...map.values()];
    }
    // 服务器端已按合同编号降序返回，触底追加按返回顺序合并；同 id 时新页数据覆盖旧页
    const items = this._rawItems
      .map((p) => {
        const status = p.status ?? "signing";
        const statusCfg = STATUS_DISPLAY[status] ?? { label: status, color: "#a3a6af" };
        const form = p.business_form ?? "";
        const formText = form ? (BUSINESS_FORM_TEXT[form] ?? "") : "";
        return {
          id: p.id,
          name: p.name ?? "未命名项目",
          communityName: p.community_name ?? "",
          statusText: statusCfg.label,
          statusColor: statusCfg.color,
          businessForm: form,
          businessFormText: formText,
          showBusinessForm: !!formText,
        };
      });
    this.setData({ state: items.length > 0 ? "items" : "empty", items });
  },

  async onReachBottom() {
    if (this.data.state !== "items" || !this.data.hasMore || this.data.loadingMore) {
      return;
    }
    const token = this.getToken();
    if (!token) {
      this.setData({ state: "needLogin" });
      return;
    }
    this.setData({ loadingMore: true });
    const nextPage = this.data.page + 1;
    const keyword = this.data.keyword.trim();
    const params = [`page=${nextPage}`, `page_size=${PAGE_SIZE}`, "contract_sort=true"];
    if (keyword) {
      params.push(`keyword=${encodeURIComponent(keyword)}`);
    }
    if (this.data.statusFilter) {
      params.push(`status=${this.data.statusFilter}`);
    }
    try {
      const data = await request<{
        items: ProjectResponse[];
        total: number;
        page: number;
        page_size: number;
      }>({
        url: `/projects?${params.join("&")}`,
        header: { Authorization: `Bearer ${token}` },
      });
      const items = data.items ?? [];
      const total = data.total ?? 0;
      this.applyItems(items, "append");
      this.setData({ page: nextPage, total, hasMore: nextPage * PAGE_SIZE < total, loadingMore: false });
    } catch (err) {
      const statusCode = (err as { statusCode?: number } | undefined)?.statusCode;
      if (statusCode === 401) {
        this.clearToken();
        this.setData({ state: "needLogin", loadingMore: false });
      } else {
        wx.showToast({ title: "加载失败，请重试", icon: "none" });
        this.setData({ loadingMore: false });
      }
    }
  },

  onSearchInput(e: WechatMiniprogram.Input) {
    this.setData({ keyword: (e.detail.value || "").trim() });
  },

  /** 搜索框 confirm：携带 keyword（小区/合同编号）重查；关键词为空则恢复全量. */
  onSearchConfirm() {
    this.loadList();
  },

  /** 状态筛选点击：切换 statusFilter 并重置分页重查. */
  onFilterTap(e: WechatMiniprogram.BaseEvent) {
    const value = (e.currentTarget.dataset.value as string) || "";
    if (value === this.data.statusFilter) {
      return;
    }
    this.setData({ statusFilter: value });
    this.loadList();
  },

  onItemTap(e: WechatMiniprogram.BaseEvent) {
    const id = e.currentTarget.dataset.id as string;
    const name = e.currentTarget.dataset.name as string;
    const communityName = e.currentTarget.dataset.community as string;
    const businessForm = (e.currentTarget.dataset.form as string) || "";
    wx.navigateTo({
      url:
        `/pages/ledger/detail/index/index?` +
        `id=${encodeURIComponent(id)}&name=${encodeURIComponent(name)}` +
        `&community_name=${encodeURIComponent(communityName)}&business_form=${encodeURIComponent(businessForm)}`,
    });
  },

  onRetry() {
    this.loadList();
  },

  onGoLogin() {
    wx.navigateBack({ delta: 1 });
  },
});