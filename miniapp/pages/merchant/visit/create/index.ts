/**
 * 已有门店拜访登记 / 补录（V03 M03）.
 *
 * 定位：优先 wx.getLocation(GCJ-02)；拒绝授权不允许提交，弱网/超时可选“定位失败”并填写原因。
 * 距离超过 500 米由后端校验并要求填写异常原因。
 */
import type { components } from "../../../../types/api-types";
import { pickAndUploadPhotos } from "../../../../utils/image-upload";
import type { MerchantPhoto } from "../../../../utils/image-upload";
import { request } from "../../../../utils/request";
import { resolveAssetUrl } from "../../../../utils/url";

type StoreResponse = components["schemas"]["MerchantStoreResponse"];
type VisitResponse = components["schemas"]["MerchantVisitResponse"];
type DictResponse = components["schemas"]["PublicDictListResponse"];
type DictItem = components["schemas"]["PublicDictItemResponse"];

interface DisplayPhoto extends MerchantPhoto {
  displayUrl: string;
}

interface VisitForm {
  contact_name: string;
  contact_phone: string;
  result: string;
  remark: string;
  is_backfill: boolean;
  backfill_reason: string;
  distance_abnormal_reason: string;
}

interface Option {
  code: string;
  label: string;
}

function errMessage(err: unknown): string {
  return (err as { body?: { message?: string } }).body?.message || "操作失败，请重试";
}

function todayStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

Page({
  data: {
    store: null as StoreResponse | null,
    form: {
      contact_name: "",
      contact_phone: "",
      result: "",
      remark: "",
      is_backfill: false,
      backfill_reason: "",
      distance_abnormal_reason: "",
    } as VisitForm,
    resultOptions: [] as Option[],
    photos: [] as DisplayPhoto[],
    lng: null as number | null,
    lat: null as number | null,
    locationOk: false,
    locationFailure: false,
    locationFailureReason: "",
    // AC-V03-007：拒绝授权不允许降级提交；仅弱网/超时可降级并标注类型
    locationDenied: false,
    locationFailureType: "" as "" | "timeout" | "unavailable",
    backfillDate: "",
    backfillTime: "12:00",
    today: todayStr(),
    submitting: false,
    storeId: "",
  },

  onLoad(options: Record<string, string | undefined>) {
    const storeId = options.store_id || "";
    if (!storeId) {
      wx.showToast({ title: "缺少门店ID", icon: "none" });
      return;
    }
    this.setData({ storeId });
    this.loadStore(storeId);
    this.loadResults();
  },

  async loadStore(storeId: string): Promise<void> {
    try {
      const store = await request<StoreResponse>({ url: `/public/merchant/stores/${storeId}` });
      this.setData({
        store,
        "form.contact_name": store.contact_name,
        "form.contact_phone": store.contact_phone,
      });
    } catch (err) {
      wx.showToast({ title: errMessage(err), icon: "none" });
    }
  },

  async loadResults(): Promise<void> {
    try {
      const data = await request<DictResponse>({ url: "/public/dicts/merchant_visit_result", skipAuth: true });
      this.setData({ resultOptions: data.items });
    } catch {
      this.setData({
        resultOptions: [
          { code: "not_met", label: "未见到人" },
          { code: "interested", label: "有意向" },
          { code: "cooperated", label: "已合作" },
          { code: "other", label: "其他" },
        ],
      });
    }
  },

  onInput(e: WechatMiniprogram.Input) {
    const field = e.currentTarget.dataset.field as keyof VisitForm;
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  onSelectResult(e: WechatMiniprogram.BaseEvent) {
    this.setData({ "form.result": e.currentTarget.dataset.code as string });
  },

  onToggleBackfill(e: WechatMiniprogram.SwitchChange) {
    this.setData({ "form.is_backfill": e.detail.value });
  },

  onBackfillDate(e: WechatMiniprogram.PickerChange) {
    this.setData({ backfillDate: String(e.detail.value) });
  },

  onGetLocation() {
    // REQ-M10-005：员工首次使用定位前必须告知用途（最小必要，仅打卡时点采集）
    if (!wx.getStorageSync("merchant_location_notice_ack")) {
      wx.showModal({
        title: "定位用途说明",
        content:
          "拜访定位仅用于工作轨迹复盘，只在打卡时采集一次当前位置，不采集连续轨迹。拒绝授权将无法提交拜访。",
        confirmText: "我知道了",
        cancelText: "暂不使用",
        success: (res) => {
          if (!res.confirm) return;
          wx.setStorageSync("merchant_location_notice_ack", "1");
          this.onGetLocation();
        },
      });
      return;
    }
    wx.getLocation({
      type: "gcj02",
      success: (res) => {
        this.setData({
          lng: res.longitude,
          lat: res.latitude,
          locationOk: true,
          locationFailure: false,
          locationFailureReason: "",
        });
      },
      fail: (res: WechatMiniprogram.GeneralCallbackResult) => {
        const msg = (res.errMsg || "").toLowerCase();
        const denied =
          msg.includes("auth deny") ||
          msg.includes("auth denied") ||
          msg.includes("authorize") ||
          msg.includes("permission");
        if (denied) {
          // 授权被拒绝：锁定降级通道，引导用户去设置页开启
          this.setData({ locationDenied: true, locationFailure: false, locationFailureType: "" });
          wx.showModal({
            title: "定位权限被拒绝",
            content: "拜访打卡必须授权定位，请在设置中开启位置权限后重试。",
            confirmText: "去设置",
            success: (result) => {
              if (result.confirm) {
                wx.openSetting({});
              }
            },
          });
          return;
        }
        // 弱网/超时：允许降级，记录失败类型
        this.setData({
          locationDenied: false,
          locationFailureType: msg.includes("timeout") ? "timeout" : "unavailable",
        });
        wx.showToast({ title: "定位失败，可选择定位失败并填写原因", icon: "none" });
      },
    });
  },

  onLocationFallback() {
    if (this.data.locationDenied) {
      wx.showToast({ title: "定位授权被拒绝，请授权后重试", icon: "none" });
      return;
    }
    this.setData({
      locationFailure: true,
      locationOk: false,
      lng: null,
      lat: null,
      locationFailureType: this.data.locationFailureType || "unavailable",
    });
  },

  onLocationFailureReason(e: WechatMiniprogram.Input) {
    this.setData({ locationFailureReason: e.detail.value });
  },

  async onAddPhoto(): Promise<void> {
    try {
      const picked = await pickAndUploadPhotos(20 - this.data.photos.length, "other");
      const display = picked.map((photo) => ({ ...photo, displayUrl: resolveAssetUrl(photo.file_url) }));
      this.setData({ photos: this.data.photos.concat(display) });
    } catch (err) {
      wx.showToast({ title: errMessage(err), icon: "none" });
    }
  },

  onRemovePhoto(e: WechatMiniprogram.BaseEvent) {
    const index = Number(e.currentTarget.dataset.index);
    this.setData({ photos: this.data.photos.filter((_, i) => i !== index) });
  },

  validate(): string | null {
    const { form, lng, lat, locationFailure, locationFailureReason, locationDenied } = this.data;
    if (!form.contact_name.trim()) {
      return "请填写联系人";
    }
    if (locationDenied) {
      return "定位授权被拒绝，请授权定位后重试";
    }
    if (!lng || !lat) {
      if (!locationFailure || !locationFailureReason.trim()) {
        return "请获取定位；弱网/超时请选择定位失败并填写原因";
      }
    }
    if (form.is_backfill) {
      if (!this.data.backfillDate) {
        return "请选择补录日期";
      }
      if (!form.backfill_reason.trim()) {
        return "请填写补录原因";
      }
      const selected = new Date(`${this.data.backfillDate}T${this.data.backfillTime}:00+08:00`);
      const diff = Date.now() - selected.getTime();
      if (diff > 7 * 24 * 3600 * 1000 || diff < 0) {
        return "仅允许补录 7 天内的拜访";
      }
    }
    return null;
  },

  async onSubmit(): Promise<void> {
    if (this.data.submitting) {
      return;
    }
    const error = this.validate();
    if (error) {
      wx.showToast({ title: error, icon: "none" });
      return;
    }
    const {
      form,
      photos,
      lng,
      lat,
      locationFailure,
      locationFailureReason,
      locationFailureType,
      backfillDate,
      backfillTime,
      storeId,
      store,
    } = this.data;
    const payload: components["schemas"]["MerchantVisitCreate"] = {
      store_id: storeId,
      contact_name: form.contact_name.trim(),
      contact_phone: form.contact_phone.trim() || null,
      result: form.result || null,
      remark: form.remark || null,
      is_backfill: form.is_backfill,
      backfill_reason: form.is_backfill ? form.backfill_reason.trim() : null,
      lng,
      lat,
      address: store?.address || null,
      distance_abnormal_reason: form.distance_abnormal_reason || null,
      location_status: locationFailure ? "degraded" : "normal",
      location_failure_reason: locationFailure ? locationFailureReason.trim() : null,
      location_failure_type: locationFailure ? locationFailureType || "unavailable" : null,
      photos: photos.map(({ displayUrl: _displayUrl, ...photo }) => photo),
    };
    if (form.is_backfill) {
      payload.visited_at = `${backfillDate}T${backfillTime}:00+08:00`;
    }
    this.setData({ submitting: true });
    try {
      await request<VisitResponse>({ url: "/public/merchant/visits", method: "POST", data: payload });
      wx.showToast({ title: "拜访已提交", icon: "success" });
      setTimeout(() => wx.navigateBack(), 800);
    } catch (err) {
      wx.showToast({ title: errMessage(err), icon: "none" });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
