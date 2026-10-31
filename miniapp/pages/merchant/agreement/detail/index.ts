/**
 * 协议详情（V05）：正文入口、签署入口、盖章扫描件上传与文件查看.
 */
import type { components } from "../../../../types/api-types";
import { uploadFileToServer } from "../../../../utils/image-upload";
import { request } from "../../../../utils/request";
import { resolveAssetUrl } from "../../../../utils/url";

type Agreement = components["schemas"]["AgreementResponse"];
type AgreementScanUploadRequest = components["schemas"]["AgreementScanUploadRequest"];

const STATUS_LABELS: Record<string, string> = {
  not_initiated: "未发起",
  pending_sign: "待签署",
  signed: "已签署",
  expired: "已过期",
  voided: "已作废",
};
const REVIEW_LABELS: Record<string, string> = {
  pending: "待审核",
  approved: "审核通过",
  rejected: "审核驳回",
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function errMessage(err: unknown): string {
  return (err as { body?: { message?: string } }).body?.message || "操作失败，请重试";
}

Page({
  data: {
    state: "loading" as "loading" | "error" | "ok",
    errorText: "",
    agreement: null as Agreement | null,
    statusText: "",
    reviewText: "",
    signerPhoneMasked: "",
    signedAtText: "",
    expireAtText: "",
    createdAtText: "",
    fileDisplayUrl: "",
    scanOpen: false,
    scanSignerName: "",
    scanSignerPhone: "",
    scanFileUrl: "",
    scanFileName: "",
    scanSignedDate: "",
    uploading: false,
    submitting: false,
  },

  onLoad(options: Record<string, string | undefined>) {
    const id = options.id || "";
    if (!id) {
      this.setData({ state: "error", errorText: "缺少协议ID" });
      return;
    }
    (this as unknown as { agreementId: string }).agreementId = id;
    this.load();
  },

  onShow() {
    if (this.data.state === "ok") this.load();
  },

  async load(): Promise<void> {
    this.setData({ state: "loading", errorText: "" });
    try {
      const agreement = await request<Agreement>({
        url: `/public/merchant/agreements/${(this as unknown as { agreementId: string }).agreementId}`,
      });
      this.setData({
        state: "ok",
        agreement,
        statusText: STATUS_LABELS[agreement.status] || agreement.status,
        reviewText: REVIEW_LABELS[agreement.review_status] || agreement.review_status,
        signerPhoneMasked: agreement.signer_phone_masked || "—",
        signedAtText: formatDate(agreement.signed_at),
        expireAtText: formatDate(agreement.expire_at),
        createdAtText: formatDate(agreement.created_at),
        fileDisplayUrl: agreement.file_url ? resolveAssetUrl(agreement.file_url) : "",
      });
    } catch (err) {
      this.setData({ state: "error", errorText: errMessage(err) });
    }
  },

  onRetry() {
    this.load();
  },

  onSign() {
    const id = (this as unknown as { agreementId: string }).agreementId;
    wx.navigateTo({ url: `/pages/merchant/agreement/sign/index?id=${id}` });
  },

  onOpenFile() {
    const url = this.data.fileDisplayUrl;
    if (!url) {
      wx.showToast({ title: "协议文件缺失", icon: "none" });
      return;
    }
    wx.showLoading({ title: "加载文件中", mask: true });
    wx.downloadFile({
      url,
      success: (res) => {
        wx.hideLoading();
        if (res.statusCode >= 200 && res.statusCode < 300) {
          wx.openDocument({
            filePath: res.tempFilePath,
            showMenu: true,
            fail: () => wx.showToast({ title: "无法打开文件", icon: "none" }),
          });
        } else {
          wx.showToast({ title: "文件下载失败", icon: "none" });
        }
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: "文件下载失败", icon: "none" });
      },
    });
  },

  onOpenScan() {
    const agreement = this.data.agreement;
    this.setData({
      scanOpen: true,
      scanSignerName: agreement?.signer_name || "",
      scanSignerPhone: "",
      scanFileUrl: "",
      scanFileName: "",
      scanSignedDate: "",
    });
  },

  onCloseScan() {
    this.setData({ scanOpen: false });
  },

  onScanSignerNameInput(e: WechatMiniprogram.Input) {
    this.setData({ scanSignerName: e.detail.value });
  },

  onScanSignerPhoneInput(e: WechatMiniprogram.Input) {
    this.setData({ scanSignerPhone: e.detail.value });
  },

  onScanSignedDateChange(e: WechatMiniprogram.PickerChange) {
    this.setData({ scanSignedDate: e.detail.value as string });
  },

  onChooseScanFile() {
    wx.chooseMessageFile({
      count: 1,
      type: "file",
      extension: ["pdf", "jpg", "jpeg", "png"],
      success: async (res) => {
        const file = res.tempFiles[0];
        if (!file) return;
        this.setData({ uploading: true });
        wx.showLoading({ title: "上传中", mask: true });
        try {
          const url = await uploadFileToServer(file.path);
          this.setData({ scanFileUrl: url, scanFileName: file.name });
        } catch (err) {
          wx.showToast({ title: errMessage(err), icon: "none" });
        } finally {
          wx.hideLoading();
          this.setData({ uploading: false });
        }
      },
      fail: () => wx.showToast({ title: "选择文件失败", icon: "none" }),
    });
  },

  async onSubmitScan(): Promise<void> {
    const agreement = this.data.agreement;
    if (!agreement) return;
    if (!this.data.scanFileUrl) {
      wx.showToast({ title: "请先上传盖章扫描件", icon: "none" });
      return;
    }
    const signerName = this.data.scanSignerName.trim();
    const signerPhone = this.data.scanSignerPhone.trim();
    if (!signerName || !signerPhone) {
      wx.showToast({ title: "请填写签署人姓名和手机号", icon: "none" });
      return;
    }
    const payload: AgreementScanUploadRequest = {
      file_url: this.data.scanFileUrl,
      signer_name: signerName,
      signer_phone: signerPhone,
      signed_at: this.data.scanSignedDate
        ? new Date(`${this.data.scanSignedDate}T12:00:00+08:00`).toISOString()
        : null,
    };
    this.setData({ submitting: true });
    try {
      await request<Agreement>({
        url: `/public/merchant/agreements/${agreement.id}/scan`,
        method: "POST",
        data: payload,
      });
      this.setData({ scanOpen: false });
      wx.showToast({ title: "已归档为已签署", icon: "success" });
      await this.load();
    } catch (err) {
      wx.showToast({ title: errMessage(err), icon: "none" });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
