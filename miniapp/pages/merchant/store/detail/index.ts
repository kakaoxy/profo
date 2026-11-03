/**
 * 门店详情：档案、照片、拜访时间线、合作状态时间线，以及拜访/编辑/状态/邀请入口.
 *
 * 拜访时间线是本页的视觉重心（审查报告 §2 Moments ②）：一条连续竖向轨迹，
 * 最近一次拜访用 Rust 点标「现在」，距离异常单独落在异常色 chip 上。
 */
import type { components } from "../../../../types/api-types";
import type { MerchantPhoto } from "../../../../utils/image-upload";
import { describeRequestError } from "../../../../utils/merchant-errors";
import type { StatusTone } from "../../../../utils/merchant-status";
import { agreementStatusLabel, agreementStatusTone, storeStatusLabel, storeStatusTone } from "../../../../utils/merchant-status";
import { MP_ICONS } from "../../../../utils/mp-icons";
import { request } from "../../../../utils/request";
import { getCAccessToken } from "../../../../utils/token";
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

type PageState = "loading" | "error" | "needLogin" | "ok";

/** 距离超过 500 米由后端判定为异常，前端只负责把它显眼地标出来. */
const DISTANCE_ABNORMAL_M = 500;

interface DisplayAgreement {
  id: string;
  title: string;
  statusText: string;
  statusTone: StatusTone;
  expireText: string;
}

interface DisplayPhoto extends MerchantPhoto {
  displayUrl: string;
}

interface DisplayVisit {
  id: string;
  dateText: string;
  timeText: string;
  employee_name: string;
  contact_name: string;
  contact_phone: string | null;
  resultText: string;
  remark: string | null;
  is_backfill: boolean;
  distanceText: string;
  abnormal: boolean;
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

/** Date → 「YYYY-MM-DD HH:mm」，空值返回空串（由调用方决定兜底文案）. */
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

/** 距离文案统一「米 / 公里」，不裸写 m/km（审查报告 T8）. */
function formatDistance(meters: number | null | undefined): string {
  if (meters === null || meters === undefined) {
    return "";
  }
  if (meters < 1000) {
    return `距离 ${Math.round(meters)} 米`;
  }
  return `距离 ${(meters / 1000).toFixed(1)} 公里`;
}

Page({
  data: {
    state: "loading" as PageState,
    errorText: "",
    store: null as StoreResponse | null,
    storeLabel: "",
    storeTone: "done" as StatusTone,
    lastVisitText: "",
    photos: [] as DisplayPhoto[],
    visits: [] as DisplayVisit[],
    statusLogs: [] as DisplayStatusLog[],
    statusOptions: [] as Option[],
    statusHint: "",
    statusOpen: false,
    statusTarget: "",
    statusReason: "",
    statusSubmitting: false,
    agreements: [] as DisplayAgreement[],
    qrOpen: false,
    qrImage: "",
    qrExpiresText: "",
    icons: {
      pencil: MP_ICONS.pencil,
      tag: MP_ICONS.tag,
      grid: MP_ICONS.grid,
      chevronRight: MP_ICONS.chevronRight,
      arrowRight: MP_ICONS.arrowRight,
    },
  },

  onLoad(options: Record<string, string | undefined>) {
    const storeId = options.store_id || "";
    if (!storeId) {
      this.setData({ state: "error", errorText: "门店入口不完整，请从门店列表重新进入" });
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
    if (!getCAccessToken()) {
      this.setData({ state: "needLogin" });
      return;
    }
    void this.loadAll({ silent: Boolean(self.loadedOnce) });
    self.loadedOnce = true;
  },

  onPullDownRefresh() {
    void this.loadAll({ silent: this.data.state === "ok" }).finally(() => wx.stopPullDownRefresh());
  },

  onGoLogin() {
    wx.navigateTo({ url: "/pages/login/index/index?from=merchant" });
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
        storeLabel: storeStatusLabel(store.review_status, store.cooperation_status_label),
        storeTone: storeStatusTone(store.review_status, store.cooperation_status),
        lastVisitText: formatDate(store.last_visit_at) || "暂无拜访",
        photos: rawPhotos.map((photo) => ({ ...photo, displayUrl: resolveAssetUrl(photo.file_url) })),
        visits: (visits.items || []).map((item) => {
          const formatted = formatDate(item.visited_at);
          return {
            id: item.id,
            dateText: formatted.slice(0, 10),
            timeText: formatted.slice(11),
            employee_name: item.employee_name || "员工",
            contact_name: item.contact_name,
            contact_phone: item.contact_phone,
            resultText: item.result ? visitResultLabels[item.result] || item.result : "未填结果",
            remark: item.remark,
            is_backfill: item.is_backfill,
            distanceText: formatDistance(item.distance_m),
            abnormal: item.distance_m !== null && item.distance_m > DISTANCE_ABNORMAL_M,
          };
        }),
        statusLogs: logs.map((log) => ({
          id: log.id,
          fromLabel: cooperationLabels[log.from_status] || log.from_status,
          toLabel: cooperationLabels[log.to_status] || log.to_status,
          createdText: formatDate(log.created_at),
          reason: log.reason,
        })),
        statusOptions: (statusOptions?.items || []).map((item) => ({ code: item.code, label: item.label })),
        statusHint: statusOptions?.reason || (statusOptions?.items?.length ? "" : "暂无可变更的合作状态"),
        agreements: agreements.items.map((item: Agreement) => ({
          id: item.id,
          title: item.agreement_no || item.id.slice(0, 8),
          statusText: agreementStatusLabel(item.status),
          statusTone: agreementStatusTone(item.status),
          expireText: item.expire_at ? formatDate(item.expire_at).slice(0, 10) : "长期有效",
        })),
      });
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 401) {
        this.setData({ state: "needLogin" });
        return;
      }
      if (silent && this.data.state === "ok") {
        // 静默刷新失败：保留已有内容，只轻提示（避免用户从拜访页返回时整页报错）
        wx.showToast({ title: describeRequestError(err, "刷新失败"), icon: "none" });
        return;
      }
      this.setData({ state: "error", errorText: describeRequestError(err, "门店档案加载失败") });
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
    // REQ-IT7-09：开发/体验阶段按当前运行版本生成小程序码；默认 release 会打开正式版，
    // 正式版尚未发布新落地页时扫码会「没有任何反应」。
    let envVersion = "release";
    try {
      envVersion = wx.getAccountInfoSync().miniProgram.envVersion || "release";
    } catch (err) {
      console.warn("获取小程序版本失败，按正式版生成二维码", err);
    }
    wx.showLoading({ title: "生成中", mask: true });
    try {
      const qr = await request<BrokerQRCode>({
        url: `/public/merchant/stores/${storeId}/broker-qrcode?env_version=${envVersion}`,
        method: "POST",
      });
      this.setData({
        qrOpen: true,
        qrImage: qr.image_base64,
        qrExpiresText: formatDate(qr.expires_at),
      });
    } catch (err) {
      wx.showToast({ title: describeRequestError(err, "二维码生成失败"), icon: "none" });
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
    if (this.data.statusSubmitting) {
      return;
    }
    if (!this.data.statusTarget) {
      wx.showToast({ title: "请选择目标状态", icon: "none" });
      return;
    }
    if (!this.data.statusReason.trim()) {
      wx.showToast({ title: "请填写变更原因", icon: "none" });
      return;
    }
    const storeId = (this as unknown as { storeId: string }).storeId;
    this.setData({ statusSubmitting: true });
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
      wx.showToast({ title: describeRequestError(err, "状态变更失败"), icon: "none" });
    } finally {
      this.setData({ statusSubmitting: false });
    }
  },

  onPreviewPhoto(e: WechatMiniprogram.BaseEvent) {
    const url = e.currentTarget.dataset.url as string;
    if (url) {
      wx.previewImage({ current: url, urls: this.data.photos.map((photo) => photo.displayUrl) });
    }
  },
});
