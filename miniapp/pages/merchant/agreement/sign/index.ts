/**
 * 协议手写签名（V05 REQ-M04-003）：阅读正文 → 画布签名 → 上传图片 → 生成 PDF.
 *
 * 四态：loading / needLogin / error / ok，与商户模块其余页面一致
 * （DESIGN.md M7「登录 / 加载 / 错误 / 空 四态统一」）。
 */
import type { components } from "../../../../types/api-types";
import { uploadFileToServer } from "../../../../utils/image-upload";
import { describeRequestError } from "../../../../utils/merchant-errors";
import { request } from "../../../../utils/request";
import { getCAccessToken } from "../../../../utils/token";

type Agreement = components["schemas"]["AgreementResponse"];
type Template = components["schemas"]["AgreementTemplateResponse"];
type AgreementSignRequest = components["schemas"]["AgreementSignRequest"];

type PageState = "loading" | "error" | "needLogin" | "ok";

interface CanvasInfo {
  node: WechatMiniprogram.Canvas;
  width: number;
  height: number;
}

Page({
  data: {
    state: "loading" as PageState,
    errorText: "",
    agreement: null as Agreement | null,
    content: "",
    signerName: "",
    signerPhone: "",
    hasStroke: false,
    submitting: false,
  },

  onLoad(options: Record<string, string | undefined>) {
    const id = options.id || "";
    if (!id) {
      this.setData({ state: "error", errorText: "签署入口不完整，请返回协议详情重新进入" });
      return;
    }
    (this as unknown as { agreementId: string }).agreementId = id;
    void this.load();
  },

  /** 从登录页返回后若仍是未登录态，重新尝试（登录成功后即可签署）. */
  onShow() {
    if (this.data.state === "needLogin" && getCAccessToken()) {
      void this.load();
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
      const agreement = await request<Agreement>({
        url: `/public/merchant/agreements/${(this as unknown as { agreementId: string }).agreementId}`,
      });
      if (agreement.status !== "pending_sign") {
        this.setData({
          state: "error",
          errorText:
            agreement.status === "signed"
              ? "协议已签署，无需重复操作"
              : "协议当前不可签署，请返回协议详情查看最新状态",
        });
        return;
      }
      const templates = await request<Template[]>({ url: "/public/merchant/agreement-templates" });
      const template = templates.find((item) => item.id === agreement.template_id);
      this.setData({
        state: "ok",
        agreement,
        content: template?.content || "协议正文未找到，请联系对接人补全后再签署",
        signerName: agreement.signer_name || "",
      });
      setTimeout(() => this.initCanvas(), 100);
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 401) {
        this.setData({ state: "needLogin" });
        return;
      }
      this.setData({ state: "error", errorText: describeRequestError(err, "协议加载失败") });
    }
  },

  onRetry() {
    void this.load();
  },

  onGoLogin() {
    wx.navigateTo({ url: "/pages/login/index/index?from=merchant" });
  },

  initCanvas(): void {
    wx.createSelectorQuery()
      .in(this)
      .select("#signature")
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

  async onSubmit(): Promise<void> {
    const agreement = this.data.agreement;
    const holder = this as unknown as {
      canvas: WechatMiniprogram.Canvas | null;
      dirty: boolean;
    };
    if (!agreement || !holder.canvas) {
      wx.showToast({ title: "签名区还没准备好，请稍后再试", icon: "none" });
      return;
    }
    if (!this.data.hasStroke) {
      wx.showToast({ title: "请先手写签名", icon: "none" });
      return;
    }
    const signerName = this.data.signerName.trim();
    const signerPhone = this.data.signerPhone.trim();
    if (!signerName || !signerPhone) {
      wx.showToast({ title: "请填写签署人姓名和手机号", icon: "none" });
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
      const payload: AgreementSignRequest = {
        signer_name: signerName,
        signer_phone: signerPhone,
        signature_url: signatureUrl,
      };
      await request<Agreement>({
        url: `/public/merchant/agreements/${agreement.id}/sign`,
        method: "POST",
        data: payload,
      });
      wx.hideLoading();
      wx.showToast({ title: "签署成功", icon: "success" });
      setTimeout(() => wx.navigateBack(), 800);
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: describeRequestError(err, "签署失败，请重试"), icon: "none" });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
