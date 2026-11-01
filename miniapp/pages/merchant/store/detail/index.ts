/**
 * 门店详情：档案、照片、拜访时间线、合作状态时间线，以及拜访/编辑/状态/照片入口.
 */
import type { components } from "../../../../types/api-types";
import type { MerchantPhoto } from "../../../../utils/image-upload";
import { request } from "../../../../utils/request";
import { resolveAssetUrl } from "../../../../utils/url";

type StoreResponse = components["schemas"]["MerchantStoreResponse"];
type VisitList = components["schemas"]["MerchantVisitListResponse"];
type StatusLog = components["schemas"]["MerchantStoreStatusLogResponse"];
type StatusOptions = components["schemas"]["MerchantStoreStatusOptionsResponse"];
type DictResponse = components["schemas"]["PublicDictListResponse"];
type DictItem = components["schemas"]["PublicDictItemResponse"];
type AgreementListResponse = components["schemas"]["AgreementListResponse"];
type Agreement = components["schemas"]["AgreementResponse"];
type BrokerQRCode = components["schemas"]["BrokerQRCodeResponse"];

/**
 * REQ-IT6-02：动作区图标使用内联 SVG（base64 data URI）而不是图标字体/远程图片，
 * 避免国内网络下拉取 iconfont/CDN 失败导致按钮变成空白方块。
 */
const ACTION_ICONS = {
  visit: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMTcxOTFjIiBzdHJva2Utd2lkdGg9IjEuNiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMTIgMjFjNC00LjIgNi03LjYgNi0xMC40QTYgNiAwIDAgMCA2IDEwLjZDNiAxMy40IDggMTYuOCAxMiAyMXoiLz48cGF0aCBkPSJNOS40IDEwLjRsMS45IDEuOSAzLjMtMy40Ii8+PC9zdmc+",
  edit: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMTcxOTFjIiBzdHJva2Utd2lkdGg9IjEuNiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNNC41IDE5LjVoNEwxOSA5YTIuMTIgMi4xMiAwIDAgMC0zLTNMNS41IDE2djMuNXoiLz48cGF0aCBkPSJNMTQuOCA2LjJsMy41IDMuNSIvPjwvc3ZnPg==",
  status: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMTcxOTFjIiBzdHJva2Utd2lkdGg9IjEuNiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMTEuNiAzLjVINUExLjUgMS41IDAgMCAwIDMuNSA1djYuNmw4LjkgOSA4LjEtOC4xLTktOXoiLz48Y2lyY2xlIGN4PSI4IiBjeT0iOCIgcj0iMS4yIi8+PC9zdmc+",
  agreement: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMTcxOTFjIiBzdHJva2Utd2lkdGg9IjEuNiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNNi41IDMuNWg3TDE4IDh2MTIuNUg2LjV6Ii8+PHBhdGggZD0iTTEzIDMuNVY4aDUiLz48cGF0aCBkPSJNOS4yIDEyLjVoNiIvPjxwYXRoIGQ9Ik05LjIgMTYuMmg2Ii8+PC9zdmc+",
  commission: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMTcxOTFjIiBzdHJva2Utd2lkdGg9IjEuNiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNNC41IDguMkEyLjIgMi4yIDAgMCAxIDYuNyA2SDE5djMuMiIvPjxwYXRoIGQ9Ik00LjUgOC4ydjkuMUExLjcgMS43IDAgMCAwIDYuMiAxOUgxOVY5LjJINi43Ii8+PHBhdGggZD0iTTE2IDEzLjdoMi4yIi8+PC9zdmc+",
  invite: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMTcxOTFjIiBzdHJva2Utd2lkdGg9IjEuNiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cmVjdCB4PSI0IiB5PSI0IiB3aWR0aD0iNiIgaGVpZ2h0PSI2IiByeD0iMS4yIi8+PHJlY3QgeD0iMTQiIHk9IjQiIHdpZHRoPSI2IiBoZWlnaHQ9IjYiIHJ4PSIxLjIiLz48cmVjdCB4PSI0IiB5PSIxNCIgd2lkdGg9IjYiIGhlaWdodD0iNiIgcng9IjEuMiIvPjxwYXRoIGQ9Ik0xNCAxNGgyLjZ2Mi42SDE0eiIvPjxwYXRoIGQ9Ik0xNy42IDE3LjZIMjBWMjBoLTIuNHoiLz48cGF0aCBkPSJNMTQgMjBoMi40Ii8+PC9zdmc+",
};

const AGREEMENT_STATUS_LABELS: Record<string, string> = {
  not_initiated: "未发起",
  pending_sign: "待签署",
  signed: "已签署",
  expired: "已过期",
  voided: "已作废",
};

interface DisplayAgreement {
  id: string;
  title: string;
  statusText: string;
  expireText: string;
}

interface DisplayPhoto extends MerchantPhoto {
  displayUrl: string;
}

interface DisplayVisit {
  id: string;
  visitedText: string;
  employee_name: string;
  contact_name: string;
  contact_phone: string | null;
  resultText: string;
  remark: string | null;
  is_backfill: boolean;
  distance_m: number | null;
}

interface DisplayStatusLog {
  id: string;
  fromLabel: string;
  toLabel: string;
  createdText: string;
  reason: string;
}

interface Option {
  code: string;
  label: string;
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function errMessage(err: unknown): string {
  return (err as { body?: { message?: string } }).body?.message || "加载失败，请重试";
}

Page({
  data: {
    state: "loading" as "loading" | "error" | "ok",
    errorText: "",
    store: null as StoreResponse | null,
    lastVisitText: "",
    photos: [] as DisplayPhoto[],
    visits: [] as DisplayVisit[],
    statusLogs: [] as DisplayStatusLog[],
    statusOptions: [] as Option[],
    statusHint: "",
    statusOpen: false,
    statusTarget: "",
    statusReason: "",
    visitResultLabels: {} as Record<string, string>,
    cooperationLabels: {} as Record<string, string>,
    agreements: [] as DisplayAgreement[],
    qrOpen: false,
    qrImage: "",
    qrExpiresText: "",
    actionIcons: ACTION_ICONS,
  },

  onLoad(options: Record<string, string | undefined>) {
    const storeId = options.store_id || "";
    if (!storeId) {
      this.setData({ state: "error", errorText: "缺少门店ID" });
      return;
    }
    (this as unknown as { storeId: string }).storeId = storeId;
    (this as unknown as { loadedOnce: boolean }).loadedOnce = false;
  },

  /**
   * REQ-IT4-04：每次页面重新可见（如从拜访登记页返回）都刷新档案与时间线，
   * 首次进入由 onLoad 之后紧跟的 onShow 完成加载；后续改为静默刷新，避免整页闪「加载中」。
   */
  onShow() {
    const self = this as unknown as { storeId?: string; loadedOnce?: boolean };
    if (!self.storeId) {
      return;
    }
    void this.loadAll({ silent: Boolean(self.loadedOnce) });
    self.loadedOnce = true;
  },

  onPullDownRefresh() {
    void this.loadAll({ silent: this.data.state === "ok" }).finally(() => wx.stopPullDownRefresh());
  },

  /** @param options.silent 静默刷新：不清空已有内容，失败只提示不整页报错 */
  async loadAll(options: { silent?: boolean } = {}): Promise<void> {
    const silent = options.silent === true;
    if (!silent) {
      this.setData({ state: "loading" });
    }
    try {
      const storeId = (this as unknown as { storeId: string }).storeId;
      const [store, visits, logs, cooperationDict, resultDict, agreements, statusOptions] = await Promise.all([
        request<StoreResponse>({ url: `/public/merchant/stores/${storeId}` }),
        request<VisitList>({ url: `/public/merchant/stores/${storeId}/visits`, data: { page: 1, page_size: 50 } }),
        request<StatusLog[]>({ url: `/public/merchant/stores/${storeId}/status-logs` }),
        request<DictResponse>({ url: "/public/dicts/merchant_cooperation_status", skipAuth: true }),
        request<DictResponse>({ url: "/public/dicts/merchant_visit_result", skipAuth: true }),
        request<AgreementListResponse>({
          url: "/public/merchant/agreements",
          data: { page: 1, page_size: 20, store_id: storeId },
        }).catch(() => ({ items: [], total: 0, page: 1, page_size: 20 })),
        // REQ-IT4-05：可选目标状态由后端按角色/协议/当前状态裁决，前端不再复制权限规则
        request<StatusOptions>({ url: `/public/merchant/stores/${storeId}/status-options` }).catch(() => null),
      ]);
      const cooperationLabels: Record<string, string> = {};
      cooperationDict.items.forEach((item: DictItem) => {
        cooperationLabels[item.code] = item.label;
      });
      const visitResultLabels: Record<string, string> = {};
      resultDict.items.forEach((item: DictItem) => {
        visitResultLabels[item.code] = item.label;
      });
      const rawPhotos = store.photos || [];
      this.setData({
        state: "ok",
        store,
        lastVisitText: formatDate(store.last_visit_at) || "暂无拜访",
        photos: rawPhotos.map((photo) => ({ ...photo, displayUrl: resolveAssetUrl(photo.file_url) })),
        visits: (visits.items || []).map((item) => ({
          id: item.id,
          visitedText: formatDate(item.visited_at),
          employee_name: item.employee_name || "员工",
          contact_name: item.contact_name,
          contact_phone: item.contact_phone,
          resultText: item.result ? visitResultLabels[item.result] || item.result : "未填写",
          remark: item.remark,
          is_backfill: item.is_backfill,
          distance_m: item.distance_m,
        })),
        statusLogs: logs.map((log) => ({
          id: log.id,
          fromLabel: cooperationLabels[log.from_status] || log.from_status,
          toLabel: cooperationLabels[log.to_status] || log.to_status,
          createdText: formatDate(log.created_at),
          reason: log.reason,
        })),
        cooperationLabels,
        visitResultLabels,
        statusOptions: (statusOptions?.items || []).map((item) => ({ code: item.code, label: item.label })),
        statusHint: statusOptions?.reason || (statusOptions?.items?.length ? "" : "暂无可变更的合作状态"),
        agreements: agreements.items.map((item: Agreement) => ({
          id: item.id,
          title: item.agreement_no || item.id.slice(0, 8),
          statusText: AGREEMENT_STATUS_LABELS[item.status] || item.status,
          expireText: item.expire_at ? formatDate(item.expire_at).slice(0, 10) : "—",
        })),
      });
    } catch (err) {
      if (silent && this.data.state === "ok") {
        // 静默刷新失败：保留已有内容，只轻提示（避免用户从拜访页返回时整页报错）
        wx.showToast({ title: errMessage(err), icon: "none" });
        return;
      }
      this.setData({ state: "error", errorText: errMessage(err) });
    }
  },

  onRetry() {
    void this.loadAll();
  },

  onVisit() {
    const storeId = (this as unknown as { storeId: string }).storeId;
    wx.navigateTo({ url: `/pages/merchant/visit/create/index?store_id=${storeId}` });
  },

  onEdit() {
    const storeId = (this as unknown as { storeId: string }).storeId;
    wx.navigateTo({ url: `/pages/merchant/store/create/index?mode=edit&store_id=${storeId}` });
  },

  /** REQ-IT6-02：佣金结算为下一期功能，先提供入口并说明，避免员工以为功能缺失 */
  onCommission() {
    wx.showToast({ title: "佣金结算功能下一期开发", icon: "none" });
  },

  onOpenAgreements() {
    const storeId = (this as unknown as { storeId: string }).storeId;
    wx.navigateTo({ url: `/pages/merchant/agreement/list/index?store_id=${storeId}` });
  },

  onCreateAgreement() {
    const storeId = (this as unknown as { storeId: string }).storeId;
    wx.navigateTo({ url: `/pages/merchant/agreement/create/index?store_id=${storeId}` });
  },

  onAgreementTap(e: WechatMiniprogram.BaseEvent) {
    const id = e.currentTarget.dataset.id as string;
    wx.navigateTo({ url: `/pages/merchant/agreement/detail/index?id=${id}` });
  },

  async onInviteBroker(): Promise<void> {
    const storeId = (this as unknown as { storeId: string }).storeId;
    wx.showLoading({ title: "生成中", mask: true });
    try {
      const qr = await request<BrokerQRCode>({
        url: `/public/merchant/stores/${storeId}/broker-qrcode`,
        method: "POST",
      });
      this.setData({
        qrOpen: true,
        qrImage: qr.image_base64,
        qrExpiresText: formatDate(qr.expires_at),
      });
    } catch (err) {
      wx.showToast({ title: errMessage(err), icon: "none" });
    } finally {
      wx.hideLoading();
    }
  },

  onCloseQr() {
    this.setData({ qrOpen: false });
  },

  onSaveQr() {
    if (!this.data.qrImage) return;
    try {
      const path = `${wx.env.USER_DATA_PATH}/merchant-broker-qr-${Date.now()}.png`;
      wx.getFileSystemManager().writeFileSync(path, this.data.qrImage, "base64");
      wx.saveImageToPhotosAlbum({
        filePath: path,
        success: () => wx.showToast({ title: "已保存到相册", icon: "success" }),
        fail: () => wx.showToast({ title: "保存失败，请授权相册权限", icon: "none" }),
      });
    } catch {
      wx.showToast({ title: "保存失败", icon: "none" });
    }
  },

  onChangeStatus() {
    const options = this.data.statusOptions;
    if (!options.length) {
      wx.showToast({ title: this.data.statusHint || "暂无可变更的合作状态", icon: "none" });
      return;
    }
    this.setData({
      statusOpen: true,
      statusTarget: options[0].code,
      statusReason: "",
    });
  },

  onCloseStatus() {
    this.setData({ statusOpen: false });
  },

  onSelectStatus(e: WechatMiniprogram.BaseEvent) {
    this.setData({ statusTarget: e.currentTarget.dataset.code as string });
  },

  onStatusReason(e: WechatMiniprogram.Input) {
    this.setData({ statusReason: e.detail.value });
  },

  async onSubmitStatus(): Promise<void> {
    if (!this.data.statusTarget) {
      wx.showToast({ title: "请选择目标状态", icon: "none" });
      return;
    }
    if (!this.data.statusReason.trim()) {
      wx.showToast({ title: "请填写变更原因", icon: "none" });
      return;
    }
    const storeId = (this as unknown as { storeId: string }).storeId;
    try {
      await request<StoreResponse>({
        url: `/public/merchant/stores/${storeId}/status`,
        method: "POST",
        data: { target_status: this.data.statusTarget, reason: this.data.statusReason.trim() },
      });
      this.setData({ statusOpen: false });
      wx.showToast({ title: "已变更", icon: "success" });
      void this.loadAll({ silent: true });
    } catch (err) {
      wx.showToast({ title: errMessage(err), icon: "none" });
    }
  },

  onPreviewPhoto(e: WechatMiniprogram.BaseEvent) {
    const url = e.currentTarget.dataset.url as string;
    if (url) {
      wx.previewImage({ current: url, urls: this.data.photos.map((photo) => photo.displayUrl) });
    }
  },
});
