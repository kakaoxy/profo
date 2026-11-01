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
    shareReady: false,
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
    supplementOpen: false,
    supplementFileUrl: "",
    supplementFileName: "",
    supplementRemark: "",
    supplementUploading: false,
    supplementSaving: false,
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
        shareReady: agreement.status === "pending_sign" && Boolean(agreement.sign_code),
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

  /**
   * 分享给商户签署（REQ-IT5-03）：链接携带协议 ID 与签署分享码。
   * 商户用微信登录后打开即进入核对页，签署完成后员工侧看到已签署。
   */
  onShareAppMessage() {
    const agreement = this.data.agreement;
    if (!agreement) {
      return { title: "合作协议待签署", path: "/pages/merchant/home/index" };
    }
    const title = `请核对并签署《${agreement.template_name || "合作协议"}》`;
    if (!agreement.sign_code) {
      return { title, path: "/pages/merchant/home/index" };
    }
    return {
      title,
      path: `/pages/merchant/agreement/merchant-sign/index?id=${agreement.id}&code=${agreement.sign_code}`,
    };
  },

  onCopySignLink() {
    const agreement = this.data.agreement;
    if (!agreement || !agreement.sign_code) {
      wx.showToast({ title: "签署链接尚未生成，请稍后重试", icon: "none" });
      return;
    }
    const path = `/pages/merchant/agreement/merchant-sign/index?id=${agreement.id}&code=${agreement.sign_code}`;
    wx.setClipboardData({
      data: path,
      success: () => wx.showToast({ title: "签署路径已复制", icon: "success" }),
    });
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

  onOpenSupplement() {
    this.setData({
      supplementOpen: true,
      supplementFileUrl: "",
      supplementFileName: "",
      supplementRemark: "",
    });
  },

  onCloseSupplement() {
    this.setData({ supplementOpen: false });
  },

  onSupplementRemarkInput(e: WechatMiniprogram.Input) {
    this.setData({ supplementRemark: e.detail.value });
  },

  onChooseSupplementFile() {
    wx.chooseMessageFile({
      count: 1,
      type: "file",
      extension: ["pdf", "jpg", "jpeg", "png"],
      success: async (res) => {
        const file = res.tempFiles[0];
        if (!file) return;
        this.setData({ supplementUploading: true });
        wx.showLoading({ title: "上传中", mask: true });
        try {
          const url = await uploadFileToServer(file.path);
          this.setData({ supplementFileUrl: url, supplementFileName: file.name });
        } catch (err) {
          wx.showToast({ title: errMessage(err), icon: "none" });
        } finally {
          wx.hideLoading();
          this.setData({ supplementUploading: false });
        }
      },
      fail: () => wx.showToast({ title: "选择文件失败", icon: "none" }),
    });
  },

  async onSubmitSupplement(): Promise<void> {
    const agreement = this.data.agreement;
    if (!agreement) return;
    if (!this.data.supplementFileUrl) {
      wx.showToast({ title: "请先上传补充协议文件", icon: "none" });
      return;
    }
    this.setData({ supplementSaving: true });
    try {
      await request<Agreement>({
        url: `/public/merchant/agreements/${agreement.id}/supplement`,
        method: "POST",
        data: {
          file_url: this.data.supplementFileUrl,
          remark: this.data.supplementRemark.trim() || undefined,
        },
      });
      this.setData({ supplementOpen: false });
      wx.showToast({ title: "补充协议已创建", icon: "success" });
      await this.load();
    } catch (err) {
      wx.showToast({ title: errMessage(err), icon: "none" });
    } finally {
      this.setData({ supplementSaving: false });
    }
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
