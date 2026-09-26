/**
 * 房源钥匙详情（设计稿 C3）.
 *
 * 数据 GET /projects/{id}/keys（/projects 路径走 admin 令牌，request.ts 自动选择）。
 * 管理密码卡：已设置可查看明文（reveal 留痕）；未设置显示录入行（PUT /manager）。
 * 普通密码卡：逐组查看/修改/停用/删除/标记已录入；批量入口收在卡头右上角。
 * 底部唯一实心主操作「分享给经纪人」→ 分享流程第一步。
 */
import { request } from "../../../utils/request";
import {
  extractErrorMessage,
  formatDay,
  formatHM,
  NORMAL_KEY_STATUS_TEXT,
} from "../utils/keys";
import type {
  KeysDetailResponse,
  ManagerKeyResponse,
  NormalKeyItem,
} from "../utils/keys";

const MASK = "••••••";

/** 普通密码行展示结构. */
interface NormalRow {
  id: string;
  status: string;
  statusText: string;
  statusClass: string;
  mask: string;
  revealed: boolean;
  password: string;
  revealTime: string;
  subText: string;
  shareActive: boolean;
  canReveal: boolean;
  canEdit: boolean;
  canDisable: boolean;
  canDelete: boolean;
  canConfirm: boolean;
}

/** 管理密码卡展示结构. */
interface ManagerView {
  set: boolean;
  updatedAtText: string;
  updatedByName: string;
  revealed: boolean;
  password: string;
  revealTime: string;
}

type PageState = "loading" | "error" | "needLogin" | "items";

interface PageData {
  state: PageState;
  /** 是否已成功加载过：控制 onShow 重入时不闪骨架屏（有旧数据先渲染旧数据）. */
  loaded: boolean;
  projectId: string;
  name: string;
  /** 带看注意事项（房源级，实时展示于经纪人分享页中部）. */
  keyNote: string;
  /** 编辑注意事项弹层. */
  noteEditing: { show: boolean; value: string };
  noteSaving: boolean;
  manager: ManagerView;
  managerInput: string;
  managerSaving: boolean;
  /** 修改管理密码弹层（已设置时修改入口）. */
  managerEditing: { show: boolean; value: string };
  managerEditSaving: boolean;
  counts: { active: number; pending: number; disabled: number };
  countsText: string;
  keys: NormalRow[];
  /** 修改密码弹层（简单弹层输入新密码）. */
  editing: { show: boolean; id: string; value: string };
  saving: boolean;
}

interface PageCustom {
  loadDetail(): Promise<void>;
  applyDetail(data: KeysDetailResponse): void;
  /** 编辑注意事项弹层. */
  onNoteEdit(): void;
  onNoteEditInput(e: WechatMiniprogram.Input): void;
  onNoteEditCancel(): void;
  onNoteSave(): void;
  onManagerReveal(): void;
  onManagerInput(e: WechatMiniprogram.Input): void;
  onManagerSave(): void;
  onManagerEdit(): void;
  onManagerEditInput(e: WechatMiniprogram.Input): void;
  onManagerEditCancel(): void;
  onManagerEditSave(): void;
  onRowReveal(e: WechatMiniprogram.BaseEvent): void;
  onRowConfirm(e: WechatMiniprogram.BaseEvent): void;
  onRowEdit(e: WechatMiniprogram.BaseEvent): void;
  onRowDisable(e: WechatMiniprogram.BaseEvent): void;
  onRowDelete(e: WechatMiniprogram.BaseEvent): void;
  onEditInput(e: WechatMiniprogram.Input): void;
  onEditCancel(): void;
  onEditSave(): void;
  onBatchEntry(): void;
  onBatchDeleteTap(): void;
  onShareTap(): void;
  onRetry(): void;
  onGoLogin(): void;
  /** 弹层内容区拦截冒泡用空操作. */
  noop(): void;
}

/** NormalKeyItem → 行展示结构（副文案按状态拼接）. */
function toRow(item: NormalKeyItem): NormalRow {
  const statusText = NORMAL_KEY_STATUS_TEXT[item.status] ?? item.status;
  let subText: string;
  if (item.status === "pending_entry") {
    subText = `#${item.seq} · 系统生成 ${formatDay(item.created_at)} · ${item.created_by_name ?? "—"} · 标记后生效`;
  } else if (item.status === "disabled") {
    subText = `#${item.seq} · 停用 ${formatDay(item.disabled_at)} · ${item.created_by_name ?? "—"}`;
  } else {
    subText = `#${item.seq} · 生效 ${formatDay(item.effective_date)} · ${item.created_by_name ?? "—"} 录入`;
  }
  return {
    id: item.id,
    status: item.status,
    statusText,
    statusClass:
      item.status === "active" ? "chip--active" : item.status === "disabled" ? "chip--mute" : "chip--gray",
    mask: MASK,
    revealed: false,
    password: "",
    revealTime: "",
    subText,
    shareActive: item.share_active,
    canReveal: item.status !== "pending_entry",
    canEdit: item.status === "active",
    canDisable: item.status === "active",
    canDelete: item.status !== "disabled",
    canConfirm: item.status === "pending_entry",
  };
}

function toManagerView(m: ManagerKeyResponse): ManagerView {
  return {
    set: m.set,
    updatedAtText: formatDay(m.updated_at),
    updatedByName: m.updated_by_name ?? "",
    revealed: false,
    password: "",
    revealTime: "",
  };
}

Page<PageData, PageCustom>({
  data: {
    state: "loading",
    loaded: false,
    projectId: "",
    name: "",
    keyNote: "",
    noteEditing: { show: false, value: "" },
    noteSaving: false,
    manager: { set: false, updatedAtText: "", updatedByName: "", revealed: false, password: "", revealTime: "" },
    managerInput: "",
    managerSaving: false,
    managerEditing: { show: false, value: "" },
    managerEditSaving: false,
    counts: { active: 0, pending: 0, disabled: 0 },
    countsText: "",
    keys: [],
    editing: { show: false, id: "", value: "" },
    saving: false,
  },

  onLoad(query: Record<string, string | undefined>) {
    this.setData({
      projectId: query.project_id ?? "",
      name: query.name ? decodeURIComponent(query.name) : "",
    });
  },

  onShow() {
    void this.loadDetail();
  },

  async loadDetail() {
    const { projectId } = this.data;
    if (!projectId) {
      this.setData({ state: "error" });
      return;
    }
    // 首次加载/错误重试才切 loading，返回刷新时保留旧数据避免闪屏
    if (!this.data.loaded) {
      this.setData({ state: "loading" });
    }
    try {
      const data = await request<KeysDetailResponse>({
        url: `/projects/${projectId}/keys`,
      });
      this.applyDetail(data);
    } catch (err) {
      const statusCode = (err as { statusCode?: number } | undefined)?.statusCode;
      if (statusCode === 401) {
        this.setData({ state: "needLogin" });
      } else if (this.data.loaded) {
        // 已有旧数据时静默失败，不打断浏览
        wx.showToast({ title: "刷新失败，请重试", icon: "none" });
      } else {
        this.setData({ state: "error" });
      }
    }
  },

  applyDetail(data: KeysDetailResponse) {
    const counts = data.counts;
    const parts: string[] = [`${counts.active} 有效`];
    if (counts.pending > 0) {
      parts.push(`${counts.pending} 待录入`);
    }
    if (counts.disabled > 0) {
      parts.push(`${counts.disabled} 已停用`);
    }
    this.setData({
      state: "items",
      loaded: true,
      manager: toManagerView(data.manager_key),
      managerInput: "",
      managerEditing: { show: false, value: "" },
      counts,
      countsText: parts.join(" · "),
      keys: (data.normal_keys ?? []).map(toRow),
      keyNote: data.key_note ?? "",
      editing: { show: false, id: "", value: "" },
    });
  },

  /** 编辑注意事项：打开弹层（预填当前备注）. */
  onNoteEdit() {
    this.setData({ noteEditing: { show: true, value: this.data.keyNote } });
  },

  onNoteEditInput(e: WechatMiniprogram.Input) {
    this.setData({ "noteEditing.value": e.detail.value || "" });
  },

  onNoteEditCancel() {
    this.setData({ noteEditing: { show: false, value: "" } });
  },

  /** 弹层保存：PUT /keys/note（空串=清空；响应返回最新详情就地应用）. */
  onNoteSave() {
    if (this.data.noteSaving) {
      return;
    }
    this.setData({ noteSaving: true });
    request<KeysDetailResponse>({
      url: `/projects/${this.data.projectId}/keys/note`,
      method: "PUT",
      data: { note: this.data.noteEditing.value.trim() },
    })
      .then((res) => {
        this.setData({ noteSaving: false, noteEditing: { show: false, value: "" } });
        wx.showToast({ title: "注意事项已保存", icon: "success" });
        this.applyDetail(res);
      })
      .catch((err: unknown) => {
        this.setData({ noteSaving: false });
        const msg = extractErrorMessage(err) || "保存失败，请重试";
        wx.showToast({ title: msg, icon: "none" });
      });
  },

  /** 管理密码查看明文（reveal 留痕）. */
  onManagerReveal() {
    if (this.data.manager.revealed) {
      return;
    }
    request<{ password: string }>({
      url: `/projects/${this.data.projectId}/keys/manager/reveal`,
      method: "POST",
    })
      .then((res) => {
        this.setData({
          "manager.revealed": true,
          "manager.password": res.password,
          "manager.revealTime": formatHM(new Date().toISOString()),
        });
      })
      .catch((err: unknown) => {
        const msg = extractErrorMessage(err) || "查看失败，请重试";
        wx.showToast({ title: msg, icon: "none" });
      });
  },

  onManagerInput(e: WechatMiniprogram.Input) {
    this.setData({ managerInput: e.detail.value || "" });
  },

  /** 未设置时的管理密码录入（PUT /manager）. */
  onManagerSave() {
    const password = this.data.managerInput.trim();
    if (!password || this.data.managerSaving) {
      return;
    }
    this.setData({ managerSaving: true });
    request<KeysDetailResponse>({
      url: `/projects/${this.data.projectId}/keys/manager`,
      method: "PUT",
      data: { password },
    })
      .then(() => {
        this.setData({ managerSaving: false });
        wx.showToast({ title: "管理密码已录入", icon: "success" });
        void this.loadDetail();
      })
      .catch((err: unknown) => {
        this.setData({ managerSaving: false });
        const msg = extractErrorMessage(err) || "保存失败，请重试";
        wx.showToast({ title: msg, icon: "none" });
      });
  },

  /** 已设置时的管理密码修改：打开弹层. */
  onManagerEdit() {
    if (!this.data.manager.set) {
      return;
    }
    this.setData({ managerEditing: { show: true, value: "" } });
  },

  onManagerEditInput(e: WechatMiniprogram.Input) {
    this.setData({ "managerEditing.value": e.detail.value || "" });
  },

  onManagerEditCancel() {
    this.setData({ managerEditing: { show: false, value: "" } });
  },

  /** 弹层保存：PUT /manager 修改管理密码（留痕，可追溯）. */
  onManagerEditSave() {
    const password = this.data.managerEditing.value.trim();
    if (!password || this.data.managerEditSaving) {
      return;
    }
    this.setData({ managerEditSaving: true });
    request<KeysDetailResponse>({
      url: `/projects/${this.data.projectId}/keys/manager`,
      method: "PUT",
      data: { password },
    })
      .then(() => {
        this.setData({ managerEditSaving: false });
        wx.showToast({ title: "管理密码已修改", icon: "success" });
        void this.loadDetail();
      })
      .catch((err: unknown) => {
        this.setData({ managerEditSaving: false });
        const msg = extractErrorMessage(err) || "修改失败，请重试";
        wx.showToast({ title: msg, icon: "none" });
      });
  },

  /** 普通密码查看明文：就地展开 + 记录查看时间角标（reveal 留痕）. */
  onRowReveal(e: WechatMiniprogram.BaseEvent) {
    const index = e.currentTarget.dataset.index as number;
    const row = this.data.keys[index];
    if (!row || row.revealed) {
      return;
    }
    request<{ password: string }>({
      url: `/projects/${this.data.projectId}/keys/normal/${row.id}/reveal`,
      method: "POST",
    })
      .then((res) => {
        this.setData({
          [`keys[${index}].revealed`]: true,
          [`keys[${index}].password`]: res.password,
          [`keys[${index}].revealTime`]: formatHM(new Date().toISOString()),
        });
      })
      .catch((err: unknown) => {
        const msg = extractErrorMessage(err) || "查看失败，请重试";
        wx.showToast({ title: msg, icon: "none" });
      });
  },

  /** 待录入组标记已录入（POST confirm）. */
  onRowConfirm(e: WechatMiniprogram.BaseEvent) {
    const index = e.currentTarget.dataset.index as number;
    const row = this.data.keys[index];
    if (!row || this.data.saving) {
      return;
    }
    this.setData({ saving: true });
    request<KeysDetailResponse>({
      url: `/projects/${this.data.projectId}/keys/normal/${row.id}/confirm`,
      method: "POST",
    })
      .then(() => {
        this.setData({ saving: false });
        wx.showToast({ title: "已标记为已录入", icon: "success" });
        void this.loadDetail();
      })
      .catch((err: unknown) => {
        this.setData({ saving: false });
        const msg = extractErrorMessage(err) || "操作失败，请重试";
        wx.showToast({ title: msg, icon: "none" });
      });
  },

  /** 修改密码：打开简单弹层. */
  onRowEdit(e: WechatMiniprogram.BaseEvent) {
    const index = e.currentTarget.dataset.index as number;
    const row = this.data.keys[index];
    if (!row) {
      return;
    }
    this.setData({ editing: { show: true, id: row.id, value: "" } });
  },

  onEditInput(e: WechatMiniprogram.Input) {
    this.setData({ "editing.value": e.detail.value || "" });
  },

  onEditCancel() {
    this.setData({ editing: { show: false, id: "", value: "" } });
  },

  /** 弹层保存：POST {password}（后端双通道）. */
  onEditSave() {
    const password = this.data.editing.value.trim();
    if (!password || this.data.saving) {
      return;
    }
    this.setData({ saving: true });
    request<KeysDetailResponse>({
      url: `/projects/${this.data.projectId}/keys/normal/${this.data.editing.id}`,
      // 用 POST（后端提供 PATCH/POST 双通道；wx.request 对 PATCH 真机兼容性存疑）
      method: "POST",
      data: { password },
    })
      .then(() => {
        this.setData({ saving: false });
        wx.showToast({ title: "密码已更新", icon: "success" });
        void this.loadDetail();
      })
      .catch((err: unknown) => {
        this.setData({ saving: false });
        const msg = extractErrorMessage(err) || "保存失败，请重试";
        wx.showToast({ title: msg, icon: "none" });
      });
  },

  /** 停用：二次确认后 POST {status:"disabled"}（写日志，可追溯）. */
  onRowDisable(e: WechatMiniprogram.BaseEvent) {
    const index = e.currentTarget.dataset.index as number;
    const row = this.data.keys[index];
    if (!row) {
      return;
    }
    wx.showModal({
      title: "停用该组密码",
      content: "停用后经纪人端立即失效，仅保留查看用于追溯。",
      confirmText: "停用",
      success: (res) => {
        if (!res.confirm) {
          return;
        }
        request<KeysDetailResponse>({
          url: `/projects/${this.data.projectId}/keys/normal/${row.id}`,
          // 用 POST（后端提供 PATCH/POST 双通道；wx.request 对 PATCH 真机兼容性存疑）
          method: "POST",
          data: { status: "disabled" },
        })
          .then(() => {
            wx.showToast({ title: "已停用", icon: "success" });
            void this.loadDetail();
          })
          .catch((err: unknown) => {
            const msg = extractErrorMessage(err) || "操作失败，请重试";
            wx.showToast({ title: msg, icon: "none" });
          });
      },
    });
  },

  /** 删除单组：二次确认后批量删除接口单删（列表移除，仅日志追溯）. */
  onRowDelete(e: WechatMiniprogram.BaseEvent) {
    const index = e.currentTarget.dataset.index as number;
    const row = this.data.keys[index];
    if (!row) {
      return;
    }
    wx.showModal({
      title: "删除该组密码",
      content: row.shareActive
        ? "该组密码仍在分享中，删除后经纪人端将显示“密码已失效”。确认删除？"
        : "删除后将从列表移除且不可恢复，仅操作日志可追溯。",
      confirmText: "删除",
      success: (res) => {
        if (!res.confirm) {
          return;
        }
        request<{ deleted_count: number }>({
          url: `/projects/${this.data.projectId}/keys/normal/batch-delete`,
          method: "POST",
          data: [row.id],
        })
          .then(() => {
            wx.showToast({ title: "已删除", icon: "success" });
            void this.loadDetail();
          })
          .catch((err: unknown) => {
            const msg = extractErrorMessage(err) || "删除失败，请重试";
            wx.showToast({ title: msg, icon: "none" });
          });
      },
    });
  },

  onBatchEntry() {
    wx.navigateTo({
      url: `/pages/keys/batch-entry/index?project_id=${encodeURIComponent(this.data.projectId)}&name=${encodeURIComponent(this.data.name)}`,
    });
  },

  onBatchDeleteTap() {
    wx.navigateTo({
      url: `/pages/keys/batch-delete/index?project_id=${encodeURIComponent(this.data.projectId)}&name=${encodeURIComponent(this.data.name)}`,
    });
  },

  onShareTap() {
    wx.navigateTo({
      url: `/pages/keys/share/properties/index?project_id=${encodeURIComponent(this.data.projectId)}`,
    });
  },

  onRetry() {
    this.setData({ state: "loading" });
    void this.loadDetail();
  },

  onGoLogin() {
    wx.navigateBack({ delta: 1 });
  },

  noop() {
    // 空操作：仅用于弹层内容区 catchtap 阻止冒泡关闭
  },
});
