/**
 * 批量删除（设计稿 C6）.
 *
 * 数据同详情页：GET /projects/{id}/keys；自绘多选勾选（含待录入/已停用组），
 * 每行展示掩码 + 状态 chip + 分享中标记。删除走 POST .../normal/batch-delete
 * （body 裸数组 [id,...]），若所选含分享中的组，二次确认文案追加影响说明。
 */
import { request } from "../../../utils/request";
import { extractErrorMessage, NORMAL_KEY_STATUS_TEXT } from "../utils/keys";
import type { KeysDetailResponse, NormalKeyItem } from "../utils/keys";

const MASK = "••••••";

/** 勾选行展示结构. */
interface DeleteRow {
  id: string;
  mask: string;
  statusText: string;
  statusClass: string;
  shareActive: boolean;
  checked: boolean;
}

interface PageData {
  projectId: string;
  name: string;
  state: "loading" | "error" | "needLogin" | "items";
  rows: DeleteRow[];
  checkedCount: number;
  checkedShareCount: number;
  deleting: boolean;
}

interface PageCustom {
  loadRows(): Promise<void>;
  onToggle(e: WechatMiniprogram.BaseEvent): void;
  onDelete(): void;
  onRetry(): void;
  onGoLogin(): void;
}

/** NormalKeyItem → 勾选行. */
function toRow(item: NormalKeyItem): DeleteRow {
  const statusText = NORMAL_KEY_STATUS_TEXT[item.status] ?? item.status;
  return {
    id: item.id,
    mask: MASK,
    statusText,
    statusClass:
      item.status === "active" ? "chip--active" : item.status === "disabled" ? "chip--mute" : "chip--gray",
    shareActive: item.share_active,
    checked: false,
  };
}

Page<PageData, PageCustom>({
  data: {
    projectId: "",
    name: "",
    state: "loading",
    rows: [],
    checkedCount: 0,
    checkedShareCount: 0,
    deleting: false,
  },

  onLoad(query: Record<string, string | undefined>) {
    this.setData({
      projectId: query.project_id ?? "",
      name: query.name ? decodeURIComponent(query.name) : "",
    });
  },

  onShow() {
    void this.loadRows();
  },

  async loadRows() {
    if (!this.data.projectId) {
      this.setData({ state: "error" });
      return;
    }
    try {
      const data = await request<KeysDetailResponse>({
        url: `/projects/${this.data.projectId}/keys`,
      });
      this.setData({
        state: "items",
        rows: (data.normal_keys ?? []).map(toRow),
        checkedCount: 0,
        checkedShareCount: 0,
      });
    } catch (err) {
      const statusCode = (err as { statusCode?: number } | undefined)?.statusCode;
      if (statusCode === 401) {
        this.setData({ state: "needLogin" });
      } else {
        this.setData({ state: "error" });
      }
    }
  },

  /** 勾选/取消勾选（默认全不选）. */
  onToggle(e: WechatMiniprogram.BaseEvent) {
    const index = e.currentTarget.dataset.index as number;
    const row = this.data.rows[index];
    if (!row) {
      return;
    }
    const checked = !row.checked;
    this.setData({
      [`rows[${index}].checked`]: checked,
      checkedCount: this.data.checkedCount + (checked ? 1 : -1),
      checkedShareCount: this.data.checkedShareCount + (checked && row.shareActive ? 1 : row.shareActive ? -1 : 0),
    });
  },

  /** 删除所选：二次确认（含分享中提示）→ POST batch-delete（body 裸数组）. */
  onDelete() {
    const { checkedCount, checkedShareCount, deleting } = this.data;
    if (checkedCount === 0 || deleting) {
      return;
    }
    let content = "所选密码组将从列表移除且不可恢复，仅操作日志可追溯。请确认密码锁已同步清除。";
    if (checkedShareCount > 0) {
      content = `仍有 ${checkedShareCount} 组在分享中，删除后经纪人端将显示“密码已失效”。${content}`;
    }
    wx.showModal({
      title: `删除 ${checkedCount} 组密码`,
      content,
      confirmText: "删除",
      success: (res) => {
        if (!res.confirm) {
          return;
        }
        const ids = this.data.rows.filter((r) => r.checked).map((r) => r.id);
        this.setData({ deleting: true });
        request<{ deleted_count: number }>({
          url: `/projects/${this.data.projectId}/keys/normal/batch-delete`,
          method: "POST",
          data: ids,
        })
          .then((result) => {
            this.setData({ deleting: false });
            wx.showToast({ title: `已删除 ${result.deleted_count} 组`, icon: "success" });
            setTimeout(() => wx.navigateBack({ delta: 1 }), 600);
          })
          .catch((err: unknown) => {
            this.setData({ deleting: false });
            wx.showToast({ title: extractErrorMessage(err) || "删除失败，请重试", icon: "none" });
          });
      },
    });
  },

  onRetry() {
    this.setData({ state: "loading" });
    void this.loadRows();
  },

  onGoLogin() {
    wx.navigateBack({ delta: 1 });
  },
});
