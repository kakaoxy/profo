/**
 * 分享给经纪人 · 第二步 · 选密码与有效期（设计稿 C8）.
 *
 * 对每个所选房源并行 GET /projects/{id}/keys（Promise.all），
 * 每套卡内 radio 单选「有效」组（默认上次分享密码的下一条有效组，循环回绕、
 * 跳过不可选行；待录入/已停用置灰不可选，管理密码行仅占位说明、不可分享）。
 * 有效期 chip：1 天（默认）/7/30/自定义（1–365）。
 * 「生成分享」→ POST /keys/shares {items, expires_in_days} → 第三步成功页。
 *
 * 卡头地址来自 properties 页写入的 storage 快照（SHARE_PROPS_STORAGE_KEY，
 * 以本页 query 的 ids 为选择真源，快照仅用于展示；读取后清除避免残留）。
 */
import { request } from "../../../../utils/request";
import {
  expireDotFromNow,
  extractErrorMessage,
  NORMAL_KEY_STATUS_TEXT,
  SHARE_PROPS_STORAGE_KEY,
} from "../../utils/keys";
import type { KeysDetailResponse } from "../../utils/keys";

/** 单套房源内可选中的密码行. */
interface PropKeyRow {
  keyId: string;
  seq: number;
  status: string;
  statusText: string;
  /** 历史分享次数（全部状态合计）. */
  shareCount: number;
  /** 最近分享时间（ISO 串或空，用于标记「上次分享」行）. */
  lastSharedAt: string;
  /** 是否本套房源最近一次分享的密码组. */
  isLastShared: boolean;
  /** 选中态 chip：默认第一组有效组显示「默认 · 当前有效」，其余选中显示「已选择」. */
  chipClass: string;
  chipText: string;
  dimmed: boolean;
  selectable: boolean;
}

/** 单套房源卡. */
interface PropCard {
  projectId: string;
  name: string;
  selectableCount: number;
  rows: PropKeyRow[];
  selectedId: string;
  /** 自动默认选中行：上次分享密码的下一条可选行（无历史回退第一条可选）. */
  defaultId: string;
}

type ExpireChoice = 1 | 7 | 30 | "custom";

interface PageData {
  state: "loading" | "error" | "needLogin" | "empty" | "items";
  props: PropCard[];
  propCount: number;
  /** 1 天 chip 文案（含到期日，如「1 天 · 至 09.25」）. */
  oneDayLabel: string;
  expireChoice: ExpireChoice;
  customDays: string;
  creating: boolean;
}

interface PageCustom {
  loadProps(ids: string[]): Promise<void>;
  onRowTap(e: WechatMiniprogram.BaseEvent): void;
  onExpireChip(e: WechatMiniprogram.BaseEvent): void;
  onCustomInput(e: WechatMiniprogram.Input): void;
  onCreate(): void;
  onRetry(): void;
  onGoLogin(): void;
}

/** 默认有效期（天）. */
const DEFAULT_EXPIRE_DAYS = 1;

/** 单选 chip 文案/样式：选中为 cool（默认组/已选择），未选中有效组为 gray. */
function rowChip(row: PropKeyRow, selected: boolean, isDefault: boolean): { chipClass: string; chipText: string } {
  if (row.status !== "active") {
    return { chipClass: "chip--mute", chipText: `${row.statusText} · 不可选` };
  }
  if (selected) {
    return isDefault
      ? { chipClass: "chip--cool", chipText: "默认 · 当前有效" }
      : { chipClass: "chip--cool", chipText: "已选择" };
  }
  return { chipClass: "chip--gray", chipText: "有效" };
}

/**
 * 计算本套自动默认选中的可选行：上次分享密码（lastSharedAt 最新者）的下一条
 * 可选行（seq 序、循环回绕、跳过待录入/已停用）；无分享历史或该行已不在列表
 * 时回退第一条可选行.
 */
function pickDefaultId(rows: PropKeyRow[]): string {
  if (rows.every((r) => !r.selectable)) {
    return "";
  }
  const withShared = rows.filter((r) => r.lastSharedAt);
  const lastSharedId = withShared.length
    ? withShared.reduce((a, b) => (b.lastSharedAt > a.lastSharedAt ? b : a)).keyId
    : "";
  const lastIdx = rows.findIndex((r) => r.keyId === lastSharedId);
  if (lastIdx >= 0) {
    for (let i = 1; i <= rows.length; i++) {
      const r = rows[(lastIdx + i) % rows.length];
      if (r.selectable) {
        return r.keyId;
      }
    }
  }
  return rows.find((r) => r.selectable)?.keyId ?? "";
}

/** 重建每套卡的行 chip（默认选中 id 或用户选择变化后调用）. */
function refreshChips(card: PropCard): PropCard {
  const { defaultId } = card;
  return {
    ...card,
    rows: card.rows.map((r) => {
      const { chipClass, chipText } = rowChip(r, r.keyId === card.selectedId, r.keyId === defaultId);
      return { ...r, chipClass, chipText };
    }),
  };
}

Page<PageData, PageCustom>({
  data: {
    state: "loading",
    props: [],
    propCount: 0,
    oneDayLabel: `1 天 · 至 ${expireDotFromNow(DEFAULT_EXPIRE_DAYS)}`,
    expireChoice: DEFAULT_EXPIRE_DAYS,
    customDays: "",
    creating: false,
  },

  onLoad(query: Record<string, string | undefined>) {
    const ids = (query.ids ?? "")
      .split(",")
      .map((s) => decodeURIComponent(s.trim()))
      .filter(Boolean);
    if (ids.length === 0) {
      this.setData({ state: "empty" });
      return;
    }
    void this.loadProps(ids);
  },

  /** 并行拉取每套房源的钥匙详情，聚合为单选卡. */
  async loadProps(ids: string[]) {
    // 读取地址快照（properties 页写入），构建 id→地址映射后立即清除
    const nameMap = new Map<string, string>();
    try {
      const raw = wx.getStorageSync(SHARE_PROPS_STORAGE_KEY);
      if (typeof raw === "string" && raw) {
        const parsed = JSON.parse(raw) as { project_id: string; name: string }[];
        parsed.forEach((s) => nameMap.set(s.project_id, s.name));
      }
    } catch {
      // 快照损坏不阻断流程，地址回退「房源」
    }
    wx.removeStorageSync(SHARE_PROPS_STORAGE_KEY);

    try {
      const details = await Promise.all(
        ids.map((id) =>
          request<KeysDetailResponse>({ url: `/projects/${id}/keys` }).then((d) => ({ id, d })),
        ),
      );
      const props: PropCard[] = details.map(({ id, d }) => {
        const rows: PropKeyRow[] = (d.normal_keys ?? []).map((k) => ({
          keyId: k.id,
          seq: k.seq,
          status: k.status,
          statusText: NORMAL_KEY_STATUS_TEXT[k.status] ?? k.status,
          shareCount: k.share_count ?? 0,
          lastSharedAt: k.last_shared_at ?? "",
          isLastShared: false,
          chipClass: "chip--gray",
          chipText: "有效",
          dimmed: k.status !== "active",
          selectable: k.status === "active",
        }));
        // 本套最近一次分享的密码组 →「上次分享」标记
        const withShared = rows.filter((r) => r.lastSharedAt);
        const lastSharedId = withShared.length
          ? withShared.reduce((a, b) => (b.lastSharedAt > a.lastSharedAt ? b : a)).keyId
          : "";
        rows.forEach((r) => {
          r.isLastShared = r.keyId === lastSharedId;
        });
        const defaultId = pickDefaultId(rows);
        const card: PropCard = {
          projectId: id,
          name: nameMap.get(id) || "房源",
          selectableCount: rows.filter((r) => r.selectable).length,
          rows,
          selectedId: defaultId,
          defaultId,
        };
        return refreshChips(card);
      });
      this.setData({
        state: props.length > 0 ? "items" : "empty",
        props,
        propCount: props.length,
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

  /** 单选该套某组有效密码. */
  onRowTap(e: WechatMiniprogram.BaseEvent) {
    const cardIndex = e.currentTarget.dataset.cardIndex as number;
    const rowIndex = e.currentTarget.dataset.rowIndex as number;
    const card = this.data.props[cardIndex];
    const row = card?.rows[rowIndex];
    if (!card || !row || !row.selectable) {
      return;
    }
    const next = this.data.props.map((c, i) =>
      i === cardIndex ? refreshChips({ ...c, selectedId: row.keyId }) : c,
    );
    this.setData({ props: next });
  },

  onExpireChip(e: WechatMiniprogram.BaseEvent) {
    const choice = e.currentTarget.dataset.days as ExpireChoice;
    this.setData({ expireChoice: choice });
  },

  onCustomInput(e: WechatMiniprogram.Input) {
    // 仅允许正整数
    this.setData({ customDays: (e.detail.value || "").replace(/\D/g, "") });
  },

  /** 生成分享：每套一组 → POST /keys/shares → 第三步成功页. */
  onCreate() {
    const { props, expireChoice, customDays, creating } = this.data;
    if (creating) {
      return;
    }
    const noSelection = props.find((p) => !p.selectedId);
    if (noSelection) {
      wx.showToast({ title: "存在无有效密码的房源，请返回调整", icon: "none" });
      return;
    }
    let days: number;
    if (expireChoice === "custom") {
      days = Number(customDays);
      if (!Number.isInteger(days) || days < 1 || days > 365) {
        wx.showToast({ title: "自定义天数需为 1–365", icon: "none" });
        return;
      }
    } else {
      days = expireChoice;
    }
    const items = props.map((p) => ({ project_id: p.projectId, key_id: p.selectedId }));
    this.setData({ creating: true });
    request<{ id: string; token: string; expires_at: string }>({
      url: "/keys/shares",
      method: "POST",
      data: { items, expires_in_days: days },
    })
      .then((res) => {
        this.setData({ creating: false });
        wx.redirectTo({
          url: `/pages/keys/share/success/index?token=${encodeURIComponent(res.token)}&id=${encodeURIComponent(res.id)}&count=${items.length}&expires_at=${encodeURIComponent(res.expires_at)}`,
        });
      })
      .catch((err: unknown) => {
        this.setData({ creating: false });
        wx.showToast({ title: extractErrorMessage(err) || "生成分享失败，请重试", icon: "none" });
      });
  },

  onRetry() {
    this.setData({ state: "loading" });
    // 重试需重建 ids；从当前 props 恢复（onLoad 已解析过）。
    // state 为 error 时 props 为空，无法恢复 ids → 引导返回上一步重新进入。
    if (this.data.props.length > 0) {
      void this.loadProps(this.data.props.map((p) => p.projectId));
    } else {
      wx.navigateBack({ delta: 1 });
    }
  },

  onGoLogin() {
    wx.navigateBack({ delta: 1 });
  },
});
