/**
 * 批量录入 · 双模式（设计稿 C4 手动 / C5 系统生成，默认系统生成——业务流程=生成后在门锁逐组录入）.
 *
 * 系统生成模式：组数 chip → POST .../normal/generate {count}（响应直接携带明文，生成即揭示，
 * 按序号在门锁上逐组录入）；换一批 → POST .../regenerate {}；
 * 单组「标记已录入」→ POST .../normal/{id}/confirm（隐藏明文）；长按删除单组；
 * 底部「标记为已录入（N 组）」→ POST .../normal/batch-confirm {ids}（仅未标记行）。
 * 手动模式：多组输入（≤20 组），生效日期默认东八区今日可改（非今日才传 effective_date），
 * POST /projects/{id}/keys/normal/batch。
 */
import { request } from "../../../utils/request";
import { extractErrorMessage, todayBeijing, todayBeijingDot } from "../utils/keys";
import type {
  KeysDetailResponse,
  NormalKeyGenerateResponse,
  NormalKeyItem,
} from "../utils/keys";

/** 手动模式初始输入组数. */
const INITIAL_INPUT_ROWS = 5;
/** 手动模式最大组数. */
const MAX_INPUT_ROWS = 20;

/** 手动模式输入行（带稳定 id 供 wx:key 使用）. */
interface InputRow {
  id: number;
  value: string;
}

/** 系统生成结果行（响应直接带明文；confirmed 后隐藏明文）. */
interface GenRow {
  id: string;
  seq: number;
  password: string;
  confirmed: boolean;
}

interface PageData {
  projectId: string;
  name: string;
  mode: "manual" | "generate";
  /* 手动模式 */
  inputs: InputRow[];
  filledCount: number;
  effectiveDate: string;
  todayDot: string;
  dateChanged: boolean;
  saving: boolean;
  /* 系统生成模式 */
  countChips: number[];
  genCount: number;
  genItems: GenRow[];
  /** 未标记行数（wxml 无法调函数，随行数据一并维护）. */
  pendingCount: number;
  genLoaded: boolean;
  genBusy: boolean;
}

interface PageCustom {
  switchMode(e: WechatMiniprogram.BaseEvent): void;
  onInput(e: WechatMiniprogram.Input): void;
  onAddRow(): void;
  onDateChange(e: WechatMiniprogram.PickerChange): void;
  onManualSave(): void;
  onCountChip(e: WechatMiniprogram.BaseEvent): void;
  onGenerate(): void;
  onRegenerate(): void;
  loadGenItems(): Promise<void>;
  applyGenResponse(res: NormalKeyGenerateResponse): void;
  /** 既有待录入组逐组 reveal 拉明文（新组明文随 generate 响应返回，无需 reveal）. */
  revealGenRows(items: NormalKeyItem[]): Promise<void>;
  onRowConfirm(e: WechatMiniprogram.BaseEvent): void;
  onRowDelete(e: WechatMiniprogram.BaseEvent): void;
  onMarkConfirmed(): void;
}

/** 请求出错时提取后端文案，兜底默认提示. */
function toastError(err: unknown, fallback: string): void {
  wx.showToast({ title: extractErrorMessage(err) || fallback, icon: "none" });
}

/** 手动模式输入行 id 自增计数（模块级，页面实例内唯一即可）. */
let inputRowSeq = 0;

Page<PageData, PageCustom>({
  data: {
    projectId: "",
    name: "",
    mode: "generate",
    inputs: [],
    filledCount: 0,
    effectiveDate: "",
    todayDot: "",
    dateChanged: false,
    saving: false,
    countChips: [5, 6, 8, 10],
    genCount: 5,
    genItems: [],
    pendingCount: 0,
    genLoaded: false,
    genBusy: false,
  },

  onLoad(query: Record<string, string | undefined>) {
    this.setData({
      projectId: query.project_id ?? "",
      name: query.name ? decodeURIComponent(query.name) : "",
      effectiveDate: todayBeijing(),
      todayDot: todayBeijingDot(),
      inputs: Array.from({ length: INITIAL_INPUT_ROWS }, () => {
        inputRowSeq += 1;
        return { id: inputRowSeq, value: "" };
      }),
    });
    // 默认即生成模式：拉取既有待录入组（支持直接标记）
    if (this.data.projectId) {
      void this.loadGenItems();
    }
  },

  switchMode(e: WechatMiniprogram.BaseEvent) {
    const mode = e.currentTarget.dataset.mode as PageData["mode"];
    if (mode === this.data.mode) {
      return;
    }
    this.setData({ mode });
    if (mode === "generate" && !this.data.genLoaded && this.data.projectId) {
      // 首次切入生成模式：拉取已有待录入组（支持直接标记）
      void this.loadGenItems();
    }
  },

  onInput(e: WechatMiniprogram.Input) {
    const index = e.currentTarget.dataset.index as number;
    const inputs = this.data.inputs.map((row, i) =>
      i === index ? { ...row, value: e.detail.value || "" } : row,
    );
    this.setData({
      inputs,
      filledCount: inputs.filter((row) => row.value.trim()).length,
    });
  },

  onAddRow() {
    if (this.data.inputs.length >= MAX_INPUT_ROWS) {
      wx.showToast({ title: `最多 ${MAX_INPUT_ROWS} 组`, icon: "none" });
      return;
    }
    inputRowSeq += 1;
    this.setData({ inputs: [...this.data.inputs, { id: inputRowSeq, value: "" }] });
  },

  onDateChange(e: WechatMiniprogram.PickerChange) {
    const value = String(e.detail.value);
    this.setData({ effectiveDate: value, dateChanged: value !== todayBeijing() });
  },

  /** 手动模式保存：收集非空密码，生效日期非今日才传. */
  onManualSave() {
    if (this.data.saving) {
      return;
    }
    const passwords = this.data.inputs.map((row) => row.value.trim()).filter(Boolean);
    if (passwords.length === 0) {
      wx.showToast({ title: "请至少录入一组密码", icon: "none" });
      return;
    }
    this.setData({ saving: true });
    const body: { passwords: string[]; effective_date?: string } = { passwords };
    if (this.data.dateChanged) {
      body.effective_date = this.data.effectiveDate;
    }
    request<KeysDetailResponse>({
      url: `/projects/${this.data.projectId}/keys/normal/batch`,
      method: "POST",
      data: body,
    })
      .then(() => {
        this.setData({ saving: false });
        wx.showToast({ title: `已录入 ${passwords.length} 组`, icon: "success" });
        setTimeout(() => wx.navigateBack({ delta: 1 }), 600);
      })
      .catch((err: unknown) => {
        this.setData({ saving: false });
        toastError(err, "保存失败，请重试");
      });
  },

  onCountChip(e: WechatMiniprogram.BaseEvent) {
    this.setData({ genCount: e.currentTarget.dataset.count as number });
  },

  /** 系统生成 N 组（生成即落库为待录入，响应直接携带明文）. */
  onGenerate() {
    if (this.data.genBusy) {
      return;
    }
    this.setData({ genBusy: true });
    request<NormalKeyGenerateResponse>({
      url: `/projects/${this.data.projectId}/keys/normal/generate`,
      method: "POST",
      data: { count: this.data.genCount },
    })
      .then((res) => this.applyGenResponse(res))
      .catch((err: unknown) => {
        this.setData({ genBusy: false });
        toastError(err, "生成失败，请重试");
      });
  },

  /** 换一批：整批替换未标记的待录入组（不带 count，默认与被替换组数一致）. */
  onRegenerate() {
    if (this.data.genBusy || this.data.pendingCount === 0) {
      return;
    }
    this.setData({ genBusy: true });
    request<NormalKeyGenerateResponse>({
      url: `/projects/${this.data.projectId}/keys/normal/regenerate`,
      method: "POST",
      data: {},
    })
      .then((res) => this.applyGenResponse(res))
      .catch((err: unknown) => {
        this.setData({ genBusy: false });
        toastError(err, "换一批失败，请重试");
      });
  },

  /** 拉取当前待录入组（既有组由 reveal 逐组拉明文，触发查看留痕）. */
  async loadGenItems() {
    try {
      const res = await request<KeysDetailResponse>({
        url: `/projects/${this.data.projectId}/keys`,
      });
      const pending = (res.normal_keys ?? []).filter((k) => k.status === "pending_entry");
      await this.revealGenRows(pending);
    } catch (err) {
      this.setData({ genBusy: false, genLoaded: true });
      toastError(err, "加载失败，请重试");
    }
  },

  /** 从 generate/regenerate 响应取本次生成的待录入组（明文已随响应返回）. */
  applyGenResponse(res: NormalKeyGenerateResponse) {
    const rows: GenRow[] = (res.keys ?? []).map((k) => ({
      id: k.id,
      seq: k.seq,
      password: k.password,
      confirmed: false,
    }));
    this.setData({
      genBusy: false,
      genLoaded: true,
      genItems: rows,
      pendingCount: rows.length,
    });
  },

  /**
   * 逐组 reveal 拉明文（仅用于既有待录入组：后端生成接口响应即含明文，
   * 但此前生成的组需 reveal 查询；reveal 触发查看留痕）.
   */
  async revealGenRows(items: NormalKeyItem[]) {
    const rows: GenRow[] = [];
    for (const item of items) {
      try {
        const revealed = await request<{ password: string }>({
          url: `/projects/${this.data.projectId}/keys/normal/${item.id}/reveal`,
          method: "POST",
        });
        rows.push({ id: item.id, seq: item.seq, password: revealed.password, confirmed: false });
      } catch {
        // 单组 reveal 失败不阻断整批展示（掩码占位不可复制）
        rows.push({ id: item.id, seq: item.seq, password: "••••••", confirmed: false });
      }
    }
    this.setData({ genBusy: false, genLoaded: true, genItems: rows, pendingCount: rows.length });
  },

  /** 单组标记已录入：confirm 后该行隐藏明文（与管理后台一致）. */
  onRowConfirm(e: WechatMiniprogram.BaseEvent) {
    const index = e.currentTarget.dataset.index as number;
    const row = this.data.genItems[index];
    if (!row || row.confirmed || this.data.genBusy) {
      return;
    }
    this.setData({ genBusy: true });
    request<KeysDetailResponse>({
      url: `/projects/${this.data.projectId}/keys/normal/${row.id}/confirm`,
      method: "POST",
    })
      .then(() => {
        this.setData({
          genBusy: false,
          [`genItems[${index}].confirmed`]: true,
          [`genItems[${index}].password`]: "••••••",
          pendingCount: this.data.pendingCount - 1,
        });
        wx.showToast({ title: `第 ${row.seq} 组已录入`, icon: "success" });
      })
      .catch((err: unknown) => {
        this.setData({ genBusy: false });
        toastError(err, "操作失败，请重试");
      });
  },

  /** 长按单组删除（batch-delete 单删该组）. */
  onRowDelete(e: WechatMiniprogram.BaseEvent) {
    const index = e.currentTarget.dataset.index as number;
    const row = this.data.genItems[index];
    if (!row) {
      return;
    }
    wx.showModal({
      title: "删除该组",
      content: `将删除第 ${row.seq} 组密码，仅操作日志可追溯。`,
      confirmText: "删除",
      success: (res) => {
        if (!res.confirm) {
          return;
        }
        request<KeysDetailResponse>({
          url: `/projects/${this.data.projectId}/keys/normal/batch-delete`,
          method: "POST",
          data: [row.id],
        })
          .then(() => {
            const next = this.data.genItems.filter((_, i) => i !== index);
            this.setData({
              genItems: next,
              pendingCount: next.filter((r) => !r.confirmed).length,
            });
            wx.showToast({ title: "已删除", icon: "success" });
          })
          .catch((err: unknown) => toastError(err, "删除失败，请重试"));
      },
    });
  },

  /** 标记为已录入：仅未标记行整批转有效（POST batch-confirm {ids}）. */
  onMarkConfirmed() {
    const ids = this.data.genItems.filter((r) => !r.confirmed).map((r) => r.id);
    if (ids.length === 0 || this.data.genBusy) {
      return;
    }
    this.setData({ genBusy: true });
    request<KeysDetailResponse>({
      url: `/projects/${this.data.projectId}/keys/normal/batch-confirm`,
      method: "POST",
      data: { ids },
    })
      .then(() => {
        this.setData({
          genBusy: false,
          genItems: this.data.genItems.map((r) =>
            r.confirmed ? r : { ...r, confirmed: true, password: "••••••" },
          ),
          pendingCount: 0,
        });
        wx.showToast({ title: `已标记 ${ids.length} 组`, icon: "success" });
        setTimeout(() => wx.navigateBack({ delta: 1 }), 600);
      })
      .catch((err: unknown) => {
        this.setData({ genBusy: false });
        toastError(err, "操作失败，请重试");
      });
  },
});
