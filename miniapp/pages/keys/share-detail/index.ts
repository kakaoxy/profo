/**
 * 分享详情（设计稿 C11）.
 *
 * GET /keys/shares/{id}（C 端令牌）。头部：状态 chip + 创建时间 + 有效期至 +
 * 延长有效期（ActionSheet 1/7/30 天 → POST extend）+ 回收分享（二次确认 → POST revoke）。
 * 逐房源列表：查看状态（已于 HH:mm 查看 + 查看人 / 未查看 / 密码已失效）。
 * 查看记录时间线：按 time 倒序，动作文案中文映射。
 */
import { request } from "../../../utils/request";
import {
  extractErrorMessage,
  formatDay,
  formatHM,
  formatStamp,
  shareStatusOf,
  TIMELINE_ACTION_TEXT,
} from "../utils/keys";
import type {
  KeyShareDetailItem,
  KeyShareDetailResponse,
  KeyShareTimelineItem,
} from "../utils/keys";

/** 逐房源查看状态行. */
interface DetailItem {
  keyId: string;
  address: string;
  /** 状态 chip 文案/样式：已查看（cool）/ 未查看（gray）/ 密码已失效（warn）. */
  statusLabel: string;
  statusClass: string;
  subText: string;
  projectId: string;
  projectName: string;
  /** 已查看行的带看录入入口显隐. */
  viewed: boolean;
}

/** 时间线行. */
interface TimelineRow {
  title: string;
  meta: string;
}

interface PageData {
  state: "loading" | "error" | "needLogin" | "items";
  shareId: string;
  /** 分享令牌（预览经纪人页跳转用）. */
  token: string;
  status: "active" | "expired" | "revoked";
  statusLabel: string;
  statusClass: string;
  createdText: string;
  expiresText: string;
  /** 是否可操作（延长/回收）：已回收隐藏操作. */
  canAct: boolean;
  items: DetailItem[];
  viewedCount: number;
  timeline: TimelineRow[];
  extending: boolean;
  revoking: boolean;
}

interface PageCustom {
  loadDetail(): Promise<void>;
  applyDetail(data: KeyShareDetailResponse): void;
  onExtend(): void;
  onRevoke(): void;
  /** 预览经纪人页：带 token 跳转经纪人访客分享页. */
  onPreview(): void;
  onViewingEntry(e: WechatMiniprogram.BaseEvent): void;
  onRetry(): void;
  onGoLogin(): void;
}

/** 延长有效期 ActionSheet 可选天数. */
const EXTEND_DAYS = [1, 7, 30];

/** 逐房源条目 → 展示行. */
function toItem(item: KeyShareDetailItem): DetailItem {
  const viewers = (item.viewer_names ?? []).filter(Boolean).join("、");
  const base = {
    keyId: item.key_id,
    address: item.address || item.project_name,
    projectId: item.project_id,
    projectName: item.project_name,
  };
  if (item.key_deleted) {
    return {
      ...base,
      statusLabel: "密码已失效",
      statusClass: "chip--warn",
      subText: "该密码组已被删除或已停用，经纪人端将显示失效",
      viewed: false,
    };
  }
  if (item.viewed) {
    return {
      ...base,
      statusLabel: "已查看",
      statusClass: "chip--cool",
      subText: `已于 ${formatHM(item.last_viewed_at)} 查看${viewers ? ` · ${viewers}` : ""}`,
      viewed: true,
    };
  }
  return {
    ...base,
    statusLabel: "未查看",
    statusClass: "chip--gray",
    subText: "经纪人尚未查看该房源密码",
    viewed: false,
  };
}

/** 时间线条目 → 展示行（time 倒序，动作中文映射，project_name 有则拼入标题）. */
function toTimelineRow(t: KeyShareTimelineItem): TimelineRow {
  const actionText = TIMELINE_ACTION_TEXT[t.action] ?? t.action;
  const actor = t.actor_name || "";
  return {
    title: [actor, actionText].filter(Boolean).join(" ") + (t.project_name ? `「${t.project_name}」` : ""),
    meta: formatStamp(t.time),
  };
}

Page<PageData, PageCustom>({
  data: {
    state: "loading",
    shareId: "",
    token: "",
    status: "active",
    statusLabel: "进行中",
    statusClass: "chip--active",
    createdText: "",
    expiresText: "",
    canAct: true,
    items: [],
    viewedCount: 0,
    timeline: [],
    extending: false,
    revoking: false,
  },

  onLoad(query: Record<string, string | undefined>) {
    this.setData({ shareId: query.id ?? "" });
  },

  onShow() {
    void this.loadDetail();
  },

  async loadDetail() {
    if (!this.data.shareId) {
      this.setData({ state: "error" });
      return;
    }
    try {
      const data = await request<KeyShareDetailResponse>({
        url: `/keys/shares/${this.data.shareId}`,
      });
      this.applyDetail(data);
    } catch (err) {
      const statusCode = (err as { statusCode?: number } | undefined)?.statusCode;
      if (statusCode === 401) {
        this.setData({ state: "needLogin" });
      } else {
        this.setData({ state: "error" });
      }
    }
  },

  applyDetail(data: KeyShareDetailResponse) {
    const status = shareStatusOf(data.status, data.is_expired);
    const items = (data.items ?? []).map(toItem);
    const timeline = [...(data.timeline ?? [])]
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .map(toTimelineRow);
    let statusLabel = "进行中";
    let statusClass = "chip--active";
    if (status === "revoked") {
      statusLabel = "已回收";
      statusClass = "chip--mute";
    } else if (status === "expired") {
      statusLabel = "已过期";
      statusClass = "chip--gray";
    }
    this.setData({
      state: "items",
      status,
      statusLabel,
      statusClass,
      token: data.token ?? "",
      createdText: formatDay(data.created_at),
      expiresText: formatDay(data.expires_at),
      canAct: status !== "revoked",
      items,
      viewedCount: items.filter((i) => i.statusLabel === "已查看").length,
      timeline,
    });
  },

  /** 预览经纪人页：带 token 跳转经纪人访客分享页（所见即经纪人所见，含失效/过期态）. */
  onPreview() {
    const token = this.data.token;
    if (!token) {
      return;
    }
    wx.navigateTo({
      url: `/pages/key-share/index?token=${encodeURIComponent(token)}`,
    });
  },

  /** 延长有效期：ActionSheet 选 1/7/30 天 → POST extend {expires_in_days}. */
  onExtend() {
    if (!this.data.canAct || this.data.extending) {
      return;
    }
    wx.showActionSheet({
      itemList: EXTEND_DAYS.map((d) => `延长 ${d} 天`),
      success: (res) => {
        const days = EXTEND_DAYS[res.tapIndex];
        if (!days) {
          return;
        }
        this.setData({ extending: true });
        request<{ expires_at: string }>({
          url: `/keys/shares/${this.data.shareId}/extend`,
          method: "POST",
          data: { expires_in_days: days },
        })
          .then(() => {
            this.setData({ extending: false });
            wx.showToast({ title: `已延长 ${days} 天`, icon: "success" });
            void this.loadDetail();
          })
          .catch((err: unknown) => {
            this.setData({ extending: false });
            const statusCode = (err as { statusCode?: number } | undefined)?.statusCode;
            if (statusCode === 401) {
              // 令牌失效且自动刷新未成功：切登录态引导重登（与 loadDetail 同口径）
              this.setData({ state: "needLogin" });
              return;
            }
            wx.showToast({ title: extractErrorMessage(err) || "延长失败，请重试", icon: "none" });
          });
      },
    });
  },

  /** 回收分享：二次确认 → POST revoke（硬失效，经纪人页立即不可查看）. */
  onRevoke() {
    if (!this.data.canAct || this.data.revoking) {
      return;
    }
    wx.showModal({
      title: "回收分享",
      content: "回收后经纪人页立即失效并提示「分享已回收」；已产生的查看记录保留，仅分享人可见。",
      confirmText: "回收",
      success: (res) => {
        if (!res.confirm) {
          return;
        }
        this.setData({ revoking: true });
        request<Record<string, unknown>>({
          url: `/keys/shares/${this.data.shareId}/revoke`,
          method: "POST",
        })
          .then(() => {
            this.setData({ revoking: false });
            wx.showToast({ title: "已回收分享", icon: "success" });
            void this.loadDetail();
          })
          .catch((err: unknown) => {
            this.setData({ revoking: false });
            const statusCode = (err as { statusCode?: number } | undefined)?.statusCode;
            if (statusCode === 401) {
              // 令牌失效且自动刷新未成功：切登录态引导重登（与 loadDetail 同口径）
              this.setData({ state: "needLogin" });
              return;
            }
            wx.showToast({ title: extractErrorMessage(err) || "回收失败，请重试", icon: "none" });
          });
      },
    });
  },

  /** 带看录入：跳转对应项目带看详情页，add=1 触发自动弹出新增记录弹框. */
  onViewingEntry(e: WechatMiniprogram.BaseEvent) {
    const ds = e.currentTarget.dataset;
    const projectId = (ds.projectId as string) || "";
    if (!projectId) {
      return;
    }
    const name = encodeURIComponent((ds.projectName as string) || "");
    wx.navigateTo({
      url: `/pages/viewing/detail/index/index?id=${projectId}&name=${name}&add=1`,
    });
  },

  onRetry() {
    this.setData({ state: "loading" });
    void this.loadDetail();
  },

  onGoLogin() {
    wx.navigateBack({ delta: 1 });
  },
});
