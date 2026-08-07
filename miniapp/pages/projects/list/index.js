import { request } from "../../../utils/request";

/** 每页数量. */
const PAGE_SIZE = 10;

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
  },
  onLoad() {
    this.loadList(true);
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
      error: false,
      noMore: false,
    });
    this.loadList(true);
  },
  toDisplay(item, tab) {
    const community = item.community_name || "";
    const layout = item.layout;
    if (tab === "sold") {
      return {
        id: item.id,
        title: item.title,
        desc: community + " · " + layout,
        total_price: item.total_price,
        cover_thumbnail_url: item.cover_thumbnail_url,
        cover_image: item.cover_image,
        tags: [],
        badgeText: "过往案例",
        badgeClass: "badge-fog",
      };
    }
    // on_sale / renovating / all 共用描述格式
    const desc = community + " · " + layout + " · " + item.orientation + " · " + item.floor_info;
    let badgeText = "";
    let badgeClass = "";
    if (tab === "on_sale") {
      badgeText = "在售";
      badgeClass = "badge-apricot";
    } else if (tab === "renovating") {
      badgeText = "装修中";
      badgeClass = "badge-sky";
    } else {
      // all：按 project_status 映射
      const status = item.project_status;
      if (status === "在售") {
        badgeText = "在售";
        badgeClass = "badge-apricot";
      } else if (status === "在途") {
        badgeText = "装修中";
        badgeClass = "badge-sky";
      } else if (status === "已售") {
        badgeText = "过往案例";
        badgeClass = "badge-fog";
      }
    }
    return {
      id: item.id,
      title: item.title,
      desc,
      total_price: item.total_price,
      cover_thumbnail_url: item.cover_thumbnail_url,
      cover_image: item.cover_image,
      tags: item.tags,
      badgeText,
      badgeClass,
    };
  },
  async loadList(reset = false) {
    const tab = this.data.tab;
    const pageSize = this.data.pageSize;
    const page = reset ? 1 : this.data.page;
    if (reset) {
      this.setData({ loading: true, error: false, noMore: false });
    } else {
      this.setData({ loadingMore: true });
    }
    try {
      let response;
      if (tab === "sold") {
        response = await request({
          url: "/public/projects/sold",
          data: { page, page_size: pageSize },
        });
      } else {
        response = await request({
          url: "/public/projects",
          data: { page, page_size: pageSize },
        });
      }
      let rawItems = response.items;
      let total = response.total;
      if (tab === "renovating") {
        // ⚠️ TODO 后端暂无 project_status 筛选参数，客户端按在途过滤；分页场景下结果不精确，待后端补筛选参数
        // ⚠️ TODO 此 tab 分页不精确：客户端过滤会破坏分页计数，total 用过滤后长度
        const filtered = rawItems.filter((it) => it.project_status === "在途");
        rawItems = filtered;
        total = filtered.length;
      }
      const newItems = rawItems.map((it) => this.toDisplay(it, tab));
      const merged = reset ? newItems : [...this.data.items, ...newItems];
      this.setData({
        items: merged,
        total,
        noMore: merged.length >= total,
      });
    } catch {
      if (reset) {
        this.setData({ error: true, items: [] });
      }
    } finally {
      this.setData({ loading: false, loadingMore: false });
    }
  },
  onReachBottom() {
    // 限流防抖：加载中或无更多直接 return
    if (this.data.loading || this.data.loadingMore) {
      return;
    }
    if (this.data.noMore) {
      return;
    }
    this.setData({ page: this.data.page + 1 });
    this.loadList(false);
  },
  onItemTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: "/pages/projects/detail/index?id=" + id });
  },
  onSearchTap() {
    wx.showToast({ title: "功能开发中", icon: "none" });
  },
  onFilterTap() {
    wx.showToast({ title: "功能开发中", icon: "none" });
  },
  onRetry() {
    this.loadList(true);
  },
});
