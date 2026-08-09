import { request } from "./request";
import { getAccessToken } from "./token";

/**
 * 创建「我负责的项目」列表页配置（viewing/renovation 共用）.
 *
 * 统一主/回退双通道：主通道 GET /projects?status=X 拉全量；403 回退
 * GET /projects/my-responsible 过滤同状态。401 清令牌切「登录已失效」，
 * 403 切无权限态不清令牌。排序按 created_at 倒序统一处理。
 */
export function createProjectListPage(config) {
  return {
    data: {
      state: "loading",
      items: [],
    },

    getToken() {
      return getAccessToken();
    },

    clearToken() {
      wx.removeStorageSync("access_token");
      wx.removeStorageSync("refresh_token");
      // 内部员工持双令牌（admin + c_access_token），401 时同步清 C 端令牌，
      // 避免 valuation/list 等 C 端页面残留登录态造成 UI 状态不一致
      wx.removeStorageSync("c_access_token");
      wx.removeStorageSync("c_refresh_token");
    },

    onShow() {
      this.loadList();
    },

    async loadList() {
      const token = this.getToken();
      if (!token) {
        this.setData({ state: "needLogin", items: [] });
        return;
      }
      this.setData({ state: "loading", items: [] });
      try {
        // 主通道：持 project:read（admin/operator）拉取全部目标状态项目
        const data = await request({
          url:
            "/projects?status=" +
            config.status +
            "&include_interactions=true&page=1&page_size=200",
          header: { Authorization: "Bearer " + token },
        });
        this.applyItems(data.items || []);
      } catch (err) {
        const statusCode = err && err.statusCode;
        if (statusCode === 401) {
          this.clearToken();
          this.setData({ state: "needLogin", items: [] });
        } else if (statusCode === 403) {
          // 无 project:read 权限，回退业务身份负责的同状态项目
          this.loadResponsible(token);
        } else {
          this.setData({ state: "error", items: [] });
        }
      }
    },

    async loadResponsible(token) {
      try {
        const data = await request({
          url: "/projects/my-responsible",
          header: { Authorization: "Bearer " + token },
        });
        this.applyItems((data || []).filter((p) => p.status === config.status));
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

    applyItems(projects) {
      const items = projects
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

    onRetry() {
      this.loadList();
    },

    onGoLogin() {
      wx.navigateBack({ delta: 1 });
    },
  };
}
