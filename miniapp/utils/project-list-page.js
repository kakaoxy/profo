import { request } from "./request";
import { getAccessToken } from "./token";

/**
 * 「我负责的项目」列表页工厂（viewing/renovation 共用）.
 *
 * 统一主/回退双通道：主通道 GET /projects?status=X 分页拉取；403 回退
 * GET /projects/my-responsible 过滤同状态。401 清令牌切「登录已失效」，
 * 403 切无权限态不清令牌。排序按 created_at 倒序统一处理。
 *
 * 主通道支持分页（page/page_size），响应 PaginatedResponse 返回 total：
 * 首屏拉第 1 页，触底 onReachBottom 追加下一页，按 created_at 倒序合并去重；
 * 回退通道返回全量列表（无分页），一次拉全并置 hasMore=false。
 */
const PAGE_SIZE = 20;

/**
 * 创建「我负责的项目」列表页配置（viewing/renovation 共用）.
 */
export function createProjectListPage(config) {
  return {
    inFlight: false,

    _rawItems: [],

    data: {
      state: "loading",
      items: [],
      page: 1,
      total: 0,
      hasMore: false,
      loadingMore: false,
    },

    getToken() {
      return getAccessToken();
    },

    clearToken() {
      // 401 说明后台会话失效，仅清除后台令牌（access_token/refresh_token）。
      // C 端令牌由独立生命周期管理（/public/* 401 时 request.ts 自动续期），
      // 不在此一并清除，避免破坏仍有效的 C 端登录态；与 viewing/renovation 详情页一致。
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
        this.setData({
          state: "loading",
          items: [],
          page: 1,
          hasMore: false,
          loadingMore: false,
        });
        try {
          // 主通道：持 project:read（admin/operator）分页拉取目标状态项目
          const data = await request({
            url:
              "/projects?status=" +
              config.status +
              "&include_interactions=true&page=1&page_size=" +
              PAGE_SIZE,
            header: { Authorization: "Bearer " + token },
          });
          const items = data.items || [];
          const total = data.total || 0;
          this.applyItems(items, "replace");
          this.setData({ page: 1, total: total, hasMore: items.length < total });
        } catch (err) {
          const statusCode = err && err.statusCode;
          if (statusCode === 401) {
            this.clearToken();
            this.setData({ state: "needLogin", items: [] });
          } else if (statusCode === 403) {
            // 无 project:read 权限，回退业务身份负责的同状态项目
            await this.loadResponsible(token);
          } else {
            this.setData({ state: "error", items: [] });
          }
        }
      } finally {
        this.inFlight = false;
      }
    },

    async loadResponsible(token) {
      try {
        const data = await request({
          url: "/projects/my-responsible",
          header: { Authorization: "Bearer " + token },
        });
        const filtered = (data || []).filter((p) => p.status === config.status);
        this.applyItems(filtered, "replace");
        // 回退通道无分页：一次拉全，置 hasMore=false
        this.setData({ page: 1, total: filtered.length, hasMore: false });
      } catch (err) {
        const statusCode = err && err.statusCode;
        if (statusCode === 401) {
          this.clearToken();
          this.setData({ state: "needLogin", items: [] });
        } else if (statusCode === 403) {
          this.setData({ state: "noPermission", items: [] });
        } else {
          this.setData({ state: "error", items: [] });
        }
      }
    },

    applyItems(projects, mode) {
      if (mode === "replace") {
        this._rawItems = projects;
      } else {
        // 追加下一页：按 id 去重（新值覆盖旧值），保持 created_at 倒序由下方统一排序
        const map = new Map();
        this._rawItems
          .concat(projects)
          .forEach((p) => map.set(p.id, p));
        this._rawItems = Array.from(map.values());
      }
      const items = this._rawItems
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )
        .map((p) => config.toDisplay(p));
      this.setData({
        state: items.length > 0 ? "items" : "empty",
        items: items,
      });
    },

    onItemTap(e) {
      const id = e.currentTarget.dataset.id;
      const name = e.currentTarget.dataset.name;
      wx.navigateTo({
        url:
          config.detailRoute +
          "?id=" +
          encodeURIComponent(id) +
          "&name=" +
          encodeURIComponent(name),
      });
    },

    async onReachBottom() {
      if (
        this.data.state !== "items" ||
        !this.data.hasMore ||
        this.data.loadingMore
      ) {
        return;
      }
      const token = this.getToken();
      if (!token) {
        this.setData({ state: "needLogin" });
        return;
      }
      this.setData({ loadingMore: true });
      const nextPage = this.data.page + 1;
      try {
        const data = await request({
          url:
            "/projects?status=" +
            config.status +
            "&include_interactions=true&page=" +
            nextPage +
            "&page_size=" +
            PAGE_SIZE,
          header: { Authorization: "Bearer " + token },
        });
        const items = data.items || [];
        const total = data.total || 0;
        this.applyItems(items, "append");
        this.setData({
          page: nextPage,
          total: total,
          hasMore: nextPage * PAGE_SIZE < total,
          loadingMore: false,
        });
      } catch (err) {
        const statusCode = err && err.statusCode;
        if (statusCode === 401) {
          this.clearToken();
          this.setData({ state: "needLogin", loadingMore: false });
        } else {
          wx.showToast({ title: "加载失败，请重试", icon: "none" });
          this.setData({ loadingMore: false });
        }
      }
    },

    onRetry() {
      this.loadList();
    },

    onGoLogin() {
      wx.navigateBack({ delta: 1 });
    },
  };
}