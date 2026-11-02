/**
 * 商户签署协议（REQ-IT5-03）.
 *
 * 流程：员工发起协议并分享链接 → 商户微信登录后打开本页 → 核对协议正文与商户信息
 * → 勾选确认 → 手写签名提交 → 员工侧协议即为「已签署」。
 *
 * 权限：不依赖 merchant:agreement，只校验 C 端身份 + 链接里的签署分享码，
 * 因此商户/客户账号即可打开；签名图通过 /public/files/upload 上传。
 */
import type { components } from "../../../../types/api-types";
import { uploadFileToServer } from "../../../../utils/image-upload";
import { describeRequestError } from "../../../../utils/merchant-errors";
import { agreementStatusLabel, agreementStatusTone, type StatusTone } from "../../../../utils/merchant-status";
import { MP_ICONS } from "../../../../utils/mp-icons";
import { request } from "../../../../utils/request";
import { getCAccessToken } from "../../../../utils/token";
import { resolveAssetUrl } from "../../../../utils/url";

type SignView = components["schemas"]["AgreementSignView"];
type AgreementMerchantSignRequest = components["schemas"]["AgreementMerchantSignRequest"];
type Agreement = components["schemas"]["AgreementResponse"];

interface CanvasInfo {
  node: WechatMiniprogram.Canvas;
  width: number;
  height: number;
}

/** 到期时间按「年-月-日 时:分」展示，空值即长期有效（避免把后端 ISO 串直接抛给商户）. */
function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "长期有效";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

Page({
  data: {
    state: "loading" as "loading" | "error" | "needLogin" | "ok",
    errorText: "",
    view: null as SignView | null,
    content: "",
    signerName: "",
    signerPhone: "",
    signerPhoneMasked: "",
    /** 协议状态档/文案（DESIGN M3 三档语义，映射集中在 utils/merchant-status.ts） */
    statusTone: "done" as StatusTone,
    statusLabel: "",
    expireText: "",
    confirmed: false,
    hasStroke: false,
    submitting: false,
    done: false,
    signedFileUrl: "",
    icons: {
      check: MP_ICONS.check,
    },
  },

  onLoad(options: Record<string, string | undefined>) {
    const id = options.id || "";
    const code = options.code || "";
    if (!id || !code) {
      this.setData({ state: "error", errorText: "签署链接不完整，请联系门店员工重新分享" });
      return;
    }
    const holder = this as unknown as { agreementId: string; signCode: string };
    holder.agreementId = id;
    holder.signCode = code;
    this.load();
  },

  onShow() {
    // 从登录页返回后若仍是未登录态，重新尝试（登录成功后即可签署）
    if (this.data.state === "needLogin" && getCAccessToken()) {
      this.load();
    }
  },

  onReady() {
    if (this.data.state === "ok") this.initCanvas();
  },

  async load(): Promise<void> {
    if (!getCAccessToken()) {
      this.setData({ state: "needLogin" });
      return;
    }
    this.setData({ state: "loading", errorText: "" });
    try {
      const holder = this as unknown as { agreementId: string; signCode: string };
      const view = await request<SignView>({
        url: `/public/merchant/agreement-sign/${holder.agreementId}?code=${holder.signCode}`,
      });
      this.setData({
        state: "ok",
        view,
        content: view.content || "协议正文未找到，请联系门店员工补全模板。",
        signerName: view.signer_name || "",
        signerPhoneMasked: view.signer_phone_masked || "—",
        statusTone: agreementStatusTone(view.status),
        statusLabel: agreementStatusLabel(view.status, view.status_label),
        expireText: formatDate(view.expire_at),
      });
      if (view.can_sign) {
        setTimeout(() => this.initCanvas(), 120);
      }
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 401) {
        this.setData({ state: "needLogin", errorText: "请先登录后再签署协议" });
        return;
      }
      if (statusCode === 403) {
        // 403 表示分享码无效/缺失（身份已登录），不能再引导去登录，否则会陷入反复登录。
        // 这里不走 describeRequestError：通用 403 文案是「没有商户拓展权限」，与本页无关。
        this.setData({ state: "error", errorText: "签署链接无效或已失效，请联系门店员工重新分享" });
        return;
      }
      this.setData({ state: "error", errorText: describeRequestError(err, "协议加载失败，请稍后重试") });
    }
  },

  onRetry() {
    this.load();
  },

  onGoLogin() {
    wx.navigateTo({ url: "/pages/login/index/index" });
  },

  initCanvas(): void {
    wx.createSelectorQuery()
      .in(this)
      .select("#merchant-signature")
      .fields({ node: true, size: true })
      .exec((res) => {
        const info = res[0] as CanvasInfo | undefined;
        if (!info || !info.node) return;
        const dpr = wx.getSystemInfoSync().pixelRatio;
        const canvas = info.node;
        canvas.width = info.width * dpr;
        canvas.height = info.height * dpr;
        const ctx = canvas.getContext(
          "2d",
        ) as WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D;
        ctx.scale(dpr, dpr);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, info.width, info.height);
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "#17191c";
        const holder = this as unknown as {
          canvas: WechatMiniprogram.Canvas | null;
          ctx: WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D | null;
          drawing: boolean;
          dirty: boolean;
          canvasWidth: number;
          canvasHeight: number;
        };
        holder.canvas = canvas;
        holder.ctx = ctx;
        holder.drawing = false;
        holder.dirty = false;
        holder.canvasWidth = info.width;
        holder.canvasHeight = info.height;
        this.setData({ hasStroke: false });
      });
  },

  onTouchStart(e: WechatMiniprogram.TouchEvent): void {
    const holder = this as unknown as {
      ctx: WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D | null;
      drawing: boolean;
    };
    const point = e.touches[0] as unknown as { x: number; y: number } | undefined;
    if (!holder.ctx || !point) return;
    holder.drawing = true;
    holder.ctx.beginPath();
    holder.ctx.moveTo(point.x, point.y);
  },

  onTouchMove(e: WechatMiniprogram.TouchEvent): void {
    const holder = this as unknown as {
      ctx: WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D | null;
      drawing: boolean;
      dirty: boolean;
    };
    const point = e.touches[0] as unknown as { x: number; y: number } | undefined;
    if (!holder.ctx || !holder.drawing || !point) return;
    holder.ctx.lineTo(point.x, point.y);
    holder.ctx.stroke();
    if (!holder.dirty) {
      holder.dirty = true;
      this.setData({ hasStroke: true });
    }
  },

  onTouchEnd(): void {
    (this as unknown as { drawing: boolean }).drawing = false;
  },

  onClear(): void {
    const holder = this as unknown as {
      ctx: WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D | null;
      dirty: boolean;
      canvasWidth: number;
      canvasHeight: number;
    };
    if (!holder.ctx) return;
    holder.ctx.clearRect(0, 0, holder.canvasWidth, holder.canvasHeight);
    holder.ctx.fillStyle = "#ffffff";
    holder.ctx.fillRect(0, 0, holder.canvasWidth, holder.canvasHeight);
    holder.dirty = false;
    this.setData({ hasStroke: false });
  },

  onSignerNameInput(e: WechatMiniprogram.Input) {
    this.setData({ signerName: e.detail.value });
  },

  onSignerPhoneInput(e: WechatMiniprogram.Input) {
    this.setData({ signerPhone: e.detail.value });
  },

  onToggleConfirmed() {
    this.setData({ confirmed: !this.data.confirmed });
  },

  onOpenTemplate() {
    const view = this.data.view;
    if (!view) return;
    wx.showModal({
      title: view.template_name || "协议正文",
      content: this.data.content.slice(0, 500),
      showCancel: false,
    });
  },

  async onSubmit(): Promise<void> {
    const view = this.data.view;
    const holder = this as unknown as { canvas: WechatMiniprogram.Canvas | null };
    if (!view || !view.can_sign) {
      wx.showToast({ title: view?.reason || "协议当前不可签署", icon: "none" });
      return;
    }
    if (!this.data.confirmed) {
      wx.showToast({ title: "请先勾选已核对协议与商户信息", icon: "none" });
      return;
    }
    const signerName = this.data.signerName.trim();
    if (!signerName) {
      wx.showToast({ title: "请填写签署人姓名", icon: "none" });
      return;
    }
    const signerPhone = this.data.signerPhone.trim();
    if (!/^1\d{10}$/.test(signerPhone)) {
      wx.showToast({ title: "请填写 11 位手机号", icon: "none" });
      return;
    }
    if (!this.data.hasStroke || !holder.canvas) {
      wx.showToast({ title: "请先手写签名", icon: "none" });
      return;
    }
    this.setData({ submitting: true });
    wx.showLoading({ title: "生成协议中", mask: true });
    try {
      const tempFilePath = await new Promise<string>((resolve, reject) => {
        wx.canvasToTempFilePath({
          canvas: holder.canvas as unknown as WechatMiniprogram.IAnyObject,
          fileType: "png",
          success: (res) => resolve(res.tempFilePath),
          fail: reject,
        });
      });
      const signatureUrl = await uploadFileToServer(tempFilePath);
      const holderIds = this as unknown as { agreementId: string; signCode: string };
      const payload: AgreementMerchantSignRequest = {
        signer_name: signerName,
        signer_phone: signerPhone,
        signature_url: signatureUrl,
        confirmed: true,
      };
      const signed = await request<Agreement>({
        url: `/public/merchant/agreement-sign/${holderIds.agreementId}?code=${holderIds.signCode}`,
        method: "POST",
        data: payload,
      });
      wx.hideLoading();
      // 签署成功后本地没有重新拉取 view：状态 chip 与标题一起切到「已签署」，
      // 避免页面标题已变而协议信息卡仍显示「待签署」。
      this.setData({
        done: true,
        signedFileUrl: signed.file_url ? resolveAssetUrl(signed.file_url) : "",
        statusTone: "done",
        statusLabel: "已签署",
      });
      wx.showToast({ title: "签署完成", icon: "success" });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: describeRequestError(err, "签署提交失败，请重试"), icon: "none" });
    } finally {
      this.setData({ submitting: false });
    }
  },

  onBackHome() {
    wx.reLaunch({ url: "/pages/merchant/home/index" });
  },

  onCopyFileUrl() {
    if (!this.data.signedFileUrl) return;
    wx.setClipboardData({
      data: this.data.signedFileUrl,
      success: () => wx.showToast({ title: "文件地址已复制", icon: "success" }),
    });
  },
});
