/**
 * 门店详情：档案、照片、拜访时间线、合作状态时间线，以及拜访/编辑/状态/照片入口.
 */
import type { components } from "../../../../types/api-types";
import { pickAndUploadPhotos } from "../../../../utils/image-upload";
import type { MerchantPhoto } from "../../../../utils/image-upload";
import { request } from "../../../../utils/request";
import { resolveAssetUrl } from "../../../../utils/url";

type StoreResponse = components["schemas"]["MerchantStoreResponse"];
type VisitList = components["schemas"]["MerchantVisitListResponse"];
type StatusLog = components["schemas"]["MerchantStoreStatusLogResponse"];
type DictResponse = components["schemas"]["PublicDictListResponse"];
type DictItem = components["schemas"]["PublicDictItemResponse"];

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
    rawPhotos: [] as MerchantPhoto[],
    photos: [] as DisplayPhoto[],
    visits: [] as DisplayVisit[],
    statusLogs: [] as DisplayStatusLog[],
    statusOptions: [] as Option[],
    statusOpen: false,
    statusTarget: "",
    statusReason: "",
    visitResultLabels: {} as Record<string, string>,
    cooperationLabels: {} as Record<string, string>,
  },

  onLoad(options: Record<string, string | undefined>) {
    const storeId = options.store_id || "";
    if (!storeId) {
      this.setData({ state: "error", errorText: "缺少门店ID" });
      return;
    }
    (this as unknown as { storeId: string }).storeId = storeId;
    this.loadAll();
  },

  onPullDownRefresh() {
    this.loadAll().finally(() => wx.stopPullDownRefresh());
  },

  async loadAll(): Promise<void> {
    this.setData({ state: "loading" });
    try {
      const storeId = (this as unknown as { storeId: string }).storeId;
      const [store, visits, logs, cooperationDict, resultDict] = await Promise.all([
        request<StoreResponse>({ url: `/public/merchant/stores/${storeId}` }),
        request<VisitList>({ url: `/public/merchant/stores/${storeId}/visits`, data: { page: 1, page_size: 50 } }),
        request<StatusLog[]>({ url: `/public/merchant/stores/${storeId}/status-logs` }),
        request<DictResponse>({ url: "/public/dicts/merchant_cooperation_status", skipAuth: true }),
        request<DictResponse>({ url: "/public/dicts/merchant_visit_result", skipAuth: true }),
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
        rawPhotos,
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
        statusOptions: cooperationDict.items.filter((item: DictItem) => item.code !== store.cooperation_status),
      });
    } catch (err) {
      this.setData({ state: "error", errorText: errMessage(err) });
    }
  },

  onRetry() {
    this.loadAll();
  },

  onVisit() {
    const storeId = (this as unknown as { storeId: string }).storeId;
    wx.navigateTo({ url: `/pages/merchant/visit/create/index?store_id=${storeId}` });
  },

  onEdit() {
    const storeId = (this as unknown as { storeId: string }).storeId;
    wx.navigateTo({ url: `/pages/merchant/store/create/index?mode=edit&store_id=${storeId}` });
  },

  onChangeStatus() {
    const options = this.data.statusOptions;
    this.setData({
      statusOpen: true,
      statusTarget: options.length ? options[0].code : "",
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
      this.loadAll();
    } catch (err) {
      wx.showToast({ title: errMessage(err), icon: "none" });
    }
  },

  async onAddPhotos(): Promise<void> {
    try {
      const picked = await pickAndUploadPhotos(20 - this.data.rawPhotos.length, "other");
      if (!picked.length) {
        return;
      }
      const photos = this.data.rawPhotos.concat(picked);
      const storeId = (this as unknown as { storeId: string }).storeId;
      await request<StoreResponse>({
        url: `/public/merchant/stores/${storeId}/photos`,
        method: "PUT",
        data: { photos },
      });
      wx.showToast({ title: "已补录", icon: "success" });
      this.loadAll();
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
