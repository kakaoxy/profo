/**
 * 分享给经纪人 · 第一步 · 选择房源（设计稿 C7）.
 *
 * GET /keys/properties（C 端令牌），自绘多选默认全不选；
 * 从详情页进入时按 project_id 预选该房源。无有效普通密码的房源置灰不可选。
 * 下一步把所选房源 id 与地址快照写入 storage（share/keys 页用于展示卡头地址），跳第二步。
 */
import { request } from "../../../../utils/request";
import { PROJECT_STATUS_TEXT, SHARE_PROPS_STORAGE_KEY } from "../../utils/keys";
import type { KeysPropertiesResponse } from "../../utils/keys";
import { getCAccessToken } from "../../../../utils/token";

/** 快照条目（跨页传递地址用，不作为选择真源——真源是 share/keys 页 query 的 ids）. */
interface SharePropSnapshot {
  project_id: string;
  name: string;
}

interface DisplayItem {
  projectId: string;
  address: string;
  metaText: string;
  activeCount: number;
  selectable: boolean;
  checked: boolean;
}

interface PageData {
  state: "loading" | "error" | "needLogin" | "empty" | "items";
  items: DisplayItem[];
  selectedCount: number;
}

interface PageCustom {
  /** 详情页进入时预选的房源 id（onLoad 写入）. */
  preselectId: string;
  loadList(): Promise<void>;
  onToggle(e: WechatMiniprogram.BaseEvent): void;
  onNext(): void;
  onRetry(): void;
  onGoLogin(): void;
}

Page<PageData, PageCustom>({
  preselectId: "",

  data: {
    state: "loading",
    items: [],
    selectedCount: 0,
  },

  onLoad(query: Record<string, string | undefined>) {
    this.preselectId = query.project_id ?? "";
  },

  onShow() {
    void this.loadList();
  },

  async loadList() {
    const token = getCAccessToken();
    if (!token) {
      this.setData({ state: "needLogin", items: [] });
      return;
    }
    try {
      const data = await request<KeysPropertiesResponse>({
        url: "/keys/properties",
      });
      const items: DisplayItem[] = (data.items ?? []).map((p) => ({
        projectId: p.project_id,
        address: p.address || p.community_name || "未命名房源",
        metaText: p.status ? PROJECT_STATUS_TEXT[p.status] ?? p.status : "",
        activeCount: p.normal_active_count,
        selectable: p.normal_active_count > 0,
        checked: p.project_id === this.preselectId,
      }));
      this.setData({
        state: items.length > 0 ? "items" : "empty",
        items,
        selectedCount: items.filter((i) => i.checked).length,
      });
    } catch (err) {
      const statusCode = (err as { statusCode?: number } | undefined)?.statusCode;
      if (statusCode === 401) {
        this.setData({ state: "needLogin", items: [] });
      } else {
        this.setData({ state: "error", items: [] });
      }
    }
  },

  onToggle(e: WechatMiniprogram.BaseEvent) {
    const index = e.currentTarget.dataset.index as number;
    const item = this.data.items[index];
    if (!item || !item.selectable) {
      return;
    }
    const checked = !item.checked;
    this.setData({
      [`items[${index}].checked`]: checked,
      selectedCount: this.data.selectedCount + (checked ? 1 : -1),
    });
  },

  /** 下一步：写地址快照 → share/keys?ids=a,b,c（ids 为选择真源）. */
  onNext() {
    const selected = this.data.items.filter((i) => i.checked);
    if (selected.length === 0) {
      return;
    }
    const snapshot: SharePropSnapshot[] = selected.map((i) => ({
      project_id: i.projectId,
      name: i.address,
    }));
    wx.setStorageSync(SHARE_PROPS_STORAGE_KEY, JSON.stringify(snapshot));
    wx.navigateTo({
      url: `/pages/keys/share/keys/index?ids=${selected.map((i) => encodeURIComponent(i.projectId)).join(",")}`,
    });
  },

  onRetry() {
    this.setData({ state: "loading" });
    void this.loadList();
  },

  onGoLogin() {
    wx.navigateBack({ delta: 1 });
  },
});
