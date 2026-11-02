/**
 * 协议详情（V05）：正文入口、签署入口、盖章扫描件上传与文件查看.
 */
import type { components } from "../../../../types/api-types";
import { uploadFileToServer } from "../../../../utils/image-upload";
import { describeRequestError } from "../../../../utils/merchant-errors";
import { agreementStatusLabel, agreementStatusTone } from "../../../../utils/merchant-status";
import type { StatusTone } from "../../../../utils/merchant-status";
import { MP_ICONS } from "../../../../utils/mp-icons";
import { request } from "../../../../utils/request";
import { getCAccessToken } from "../../../../utils/token";
import { resolveAssetUrl } from "../../../../utils/url";

type Agreement = components["schemas"]["AgreementResponse"];
type AgreementScanUploadRequest = components["schemas"]["AgreementScanUploadRequest"];
type FootAction = "" | "sign" | "file";

interface DetailHolder {
  agreementId: string;
}

const HOLDER = (ctx: unknown): DetailHolder => ctx as DetailHolder;

/** 完整时间格式 YYYY-MM-DD HH:mm；空值或非法值回落「—」。 */
function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 主操作唯一：待签署 → 去签署；否则有协议文件 → 查看协议文件；都没有则不渲染底栏。 */
function resolveFootAction(status: string, hasFile: boolean): FootAction {
  if (status === "pending_sign") return "sign";
  if (hasFile) return "file";
  return "";
}

function footLabelOf(action: FootAction): string {
  if (action === "sign") return "去签署";
  if (action === "file") return "查看协议文件";
  return "";
}

/**
 * 选择一个 PDF/图片附件并上传。两处弹层（盖章扫描件、补充协议）共用。
 * onDone 只在拿到服务器地址后调用。
 */
function chooseAndUpload(
  fallback: string,
  onBusy: (busy: boolean) => void,
  onDone: (url: string, name: string) => void,
): void {
  wx.chooseMessageFile({
    count: 1,
    type: "file",
    extension: ["pdf", "jpg", "jpeg", "png"],
    success: async (res) => {
      const file = res.tempFiles[0];
      if (!file) return;
      onBusy(true);
      wx.showLoading({ title: "上传中", mask: true });
      try {
        const url = await uploadFileToServer(file.path);
        onDone(url, file.name);
      } catch (err) {
        wx.showToast({ title: describeRequestError(err, fallback), icon: "none" });
      } finally {
        wx.hideLoading();
        onBusy(false);
      }
    },
    fail: () => wx.showToast({ title: "选择文件失败", icon: "none" }),
  });
}

Page({
  data: {
    state: "loading" as "loading" | "error" | "needLogin" | "ok",
    errorText: "",
    agreement: null as Agreement | null,
    statusLabel: "",
    statusTone: "done" as StatusTone,
    signerText: "—",
    signedAtText: "—",
    expireAtText: "—",
    createdAtText: "—",
    fileDisplayUrl: "",
    shareReady: false,
    fileAsLink: false,
    canScan: false,
    canSupplement: false,
    footAction: "" as FootAction,
    footLabel: "",
    openingFile: false,
    icons: { chevronDown: MP_ICONS.chevronDown },
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
      this.setData({ state: "error", errorText: "缺少协议 ID，请返回列表重试" });
      return;
    }
    HOLDER(this).agreementId = id;
    void this.load();
  },

  /** 从登录页返回时自恢复：needLogin 且已拿到 token 就重新拉取（D5）。 */
  onShow() {
    if (!HOLDER(this).agreementId) return;
    if (this.data.state === "needLogin") {
      if (getCAccessToken()) void this.load();
      return;
    }
    if (this.data.state === "ok") void this.load();
  },

  async load(): Promise<void> {
    if (!getCAccessToken()) {
      this.setData({ state: "needLogin", errorText: "" });
      return;
    }
    const id = HOLDER(this).agreementId;
    if (!id) return;
    this.setData({ state: "loading", errorText: "" });
    try {
      const agreement = await request<Agreement>({ url: `/public/merchant/agreements/${id}` });
      const status = agreement.status;
      const fileDisplayUrl = agreement.file_url ? resolveAssetUrl(agreement.file_url) : "";
      const footAction = resolveFootAction(status, Boolean(fileDisplayUrl));
      const signerText = [agreement.signer_name, agreement.signer_phone_masked]
        .filter(Boolean)
        .join(" · ");
      this.setData({
        state: "ok",
        agreement,
        statusLabel: agreementStatusLabel(status),
        statusTone: agreementStatusTone(status),
        signerText: signerText || "—",
        signedAtText: formatDateTime(agreement.signed_at),
        expireAtText: formatDateTime(agreement.expire_at),
        createdAtText: formatDateTime(agreement.created_at),
        shareReady: status === "pending_sign" && Boolean(agreement.sign_code),
        fileAsLink: Boolean(fileDisplayUrl) && footAction !== "file",
        canScan: status !== "voided" && status !== "expired" && status !== "signed",
        canSupplement: status !== "voided",
        footAction,
        footLabel: footLabelOf(footAction),
        fileDisplayUrl,
      });
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 401) {
        this.setData({ state: "needLogin", errorText: "" });
        return;
      }
      this.setData({ state: "error", errorText: describeRequestError(err, "协议详情加载失败") });
    }
  },

  onRetry() {
    void this.load();
  },

  onGoLogin() {
    wx.navigateTo({ url: "/pages/login/index/index" });
  },

  /** 底栏唯一主操作。 */
  onFootAction() {
    if (this.data.footAction === "sign") {
      wx.navigateTo({ url: `/pages/merchant/agreement/sign/index?id=${HOLDER(this).agreementId}` });
      return;
    }
    if (this.data.footAction === "file") this.onOpenFile();
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
      success: () => wx.showToast({ title: "签署链接已复制", icon: "success" }),
    });
  },

  onOpenFile() {
    const url = this.data.fileDisplayUrl;
    if (!url) {
      wx.showToast({ title: "协议文件缺失", icon: "none" });
      return;
    }
    this.setData({ openingFile: true });
    wx.showLoading({ title: "加载文件中", mask: true });
    const done = () => {
      wx.hideLoading();
      this.setData({ openingFile: false });
    };
    wx.downloadFile({
      url,
      success: (res) => {
        done();
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
        done();
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
    chooseAndUpload(
      "盖章扫描件上传失败",
      (busy) => this.setData({ uploading: busy }),
      (url, name) => this.setData({ scanFileUrl: url, scanFileName: name }),
    );
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
      wx.showToast({ title: describeRequestError(err, "盖章扫描件归档失败"), icon: "none" });
    } finally {
      this.setData({ submitting: false });
    }
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
    chooseAndUpload(
      "补充协议上传失败",
      (busy) => this.setData({ supplementUploading: busy }),
      (url, name) => this.setData({ supplementFileUrl: url, supplementFileName: name }),
    );
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
      wx.showToast({ title: describeRequestError(err, "补充协议创建失败"), icon: "none" });
    } finally {
      this.setData({ supplementSaving: false });
    }
  },
});
