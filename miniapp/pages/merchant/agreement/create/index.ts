/**
 * 员工发起协议（V05 REQ-M04-002）：选择门店、模板、签署人与到期时间.
 */
import type { components } from "../../../../types/api-types";
import { request } from "../../../../utils/request";

type StoreListResponse = components["schemas"]["MerchantStoreListResponse"];
type StoreListItem = components["schemas"]["MerchantStoreListItem"];
type StoreResponse = components["schemas"]["MerchantStoreResponse"];
type Template = components["schemas"]["AgreementTemplateResponse"];
type Agreement = components["schemas"]["AgreementResponse"];

interface StoreOption {
  id: string;
  name: string;
  company_name: string;
  address: string;
}

function errMessage(err: unknown): string {
  return (err as { body?: { message?: string } }).body?.message || "操作失败，请重试";
}

Page({
  data: {
    state: "loading" as "loading" | "error" | "ok",
    errorText: "",
    stores: [] as StoreOption[],
    storeId: "",
    storeName: "",
    templates: [] as Template[],
    templateIndex: 0,
    templateName: "",
    signerName: "",
    signerPhone: "",
    agreementNo: "",
    expireDate: "",
    remark: "",
    submitting: false,
    storePickerOpen: false,
  },

  onLoad(options: Record<string, string | undefined>) {
    this.load(options.store_id || "");
  },

  async load(storeId: string): Promise<void> {
    this.setData({ state: "loading", errorText: "" });
    try {
      const [stores, templates] = await Promise.all([
        request<StoreListResponse>({ url: "/public/merchant/stores", data: { page: 1, page_size: 100 } }),
        request<Template[]>({ url: "/public/merchant/agreement-templates" }),
      ]);
      const options: StoreOption[] = stores.items.map((item: StoreListItem) => ({
        id: item.id,
        name: item.store_name,
        company_name: item.company_name,
        address: item.address,
      }));
      const templatesEnabled = templates.filter((item) => item.status === "enabled");
      this.setData({
        state: "ok",
        stores: options,
        templates: templatesEnabled,
        templateIndex: 0,
        templateName: templatesEnabled.length ? templatesEnabled[0].template_name : "",
      });
      if (storeId) {
        await this.selectStore(storeId);
      } else if (options.length === 1) {
        await this.selectStore(options[0].id);
      }
    } catch (err) {
      this.setData({ state: "error", errorText: errMessage(err) });
    }
  },

  onRetry() {
    this.load(this.data.storeId);
  },

  async selectStore(storeId: string): Promise<void> {
    try {
      const store = await request<StoreResponse>({ url: `/public/merchant/stores/${storeId}` });
      this.setData({
        storeId,
        storeName: store.store_name,
        signerName: store.contact_name,
        signerPhone: store.contact_phone,
      });
    } catch (err) {
      wx.showToast({ title: errMessage(err), icon: "none" });
    }
  },

  onOpenStorePicker() {
    this.setData({ storePickerOpen: true });
  },

  onCloseStorePicker() {
    this.setData({ storePickerOpen: false });
  },

  onPickStore(e: WechatMiniprogram.BaseEvent) {
    const id = e.currentTarget.dataset.id as string;
    this.setData({ storePickerOpen: false });
    this.selectStore(id);
  },

  onTemplateChange(e: WechatMiniprogram.PickerChange) {
    const index = Number(e.detail.value);
    const template = this.data.templates[index];
    this.setData({ templateIndex: index, templateName: template ? template.template_name : "" });
  },

  onSignerNameInput(e: WechatMiniprogram.Input) {
    this.setData({ signerName: e.detail.value });
  },

  onSignerPhoneInput(e: WechatMiniprogram.Input) {
    this.setData({ signerPhone: e.detail.value });
  },

  onAgreementNoInput(e: WechatMiniprogram.Input) {
    this.setData({ agreementNo: e.detail.value });
  },

  onExpireChange(e: WechatMiniprogram.PickerChange) {
    this.setData({ expireDate: e.detail.value as string });
  },

  onRemarkInput(e: WechatMiniprogram.Input) {
    this.setData({ remark: e.detail.value });
  },

  async onSubmit(): Promise<void> {
    if (!this.data.storeId) {
      wx.showToast({ title: "请选择门店", icon: "none" });
      return;
    }
    if (!this.data.templates.length) {
      wx.showToast({ title: "暂无可用协议模板", icon: "none" });
      return;
    }
    const signerName = this.data.signerName.trim();
    const signerPhone = this.data.signerPhone.trim();
    if (!signerName || !signerPhone) {
      wx.showToast({ title: "请填写签署人姓名和手机号", icon: "none" });
      return;
    }
    this.setData({ submitting: true });
    try {
      const template = this.data.templates[this.data.templateIndex];
      const expireAt = this.data.expireDate
        ? new Date(`${this.data.expireDate}T23:59:59+08:00`).toISOString()
        : undefined;
      const result = await request<Agreement>({
        url: "/public/merchant/agreements",
        method: "POST",
        data: {
          subject_type: "store",
          store_id: this.data.storeId,
          template_id: template.id,
          agreement_no: this.data.agreementNo.trim() || undefined,
          signer_name: signerName,
          signer_phone: signerPhone,
          expire_at: expireAt,
          remark: this.data.remark.trim() || undefined,
        },
      });
      wx.showToast({ title: "已提交审核", icon: "success" });
      wx.redirectTo({ url: `/pages/merchant/agreement/detail/index?id=${result.id}` });
    } catch (err) {
      wx.showToast({ title: errMessage(err), icon: "none" });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
