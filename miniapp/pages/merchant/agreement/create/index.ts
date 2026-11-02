/**
 * 员工发起协议（V05 REQ-M04-002）：选择门店、模板、签署人与到期时间.
 */
import type { components } from "../../../../types/api-types";
import { describeRequestError } from "../../../../utils/merchant-errors";
import { MP_ICONS } from "../../../../utils/mp-icons";
import { request } from "../../../../utils/request";
import { getCAccessToken } from "../../../../utils/token";

type StoreListResponse = components["schemas"]["MerchantStoreListResponse"];
type StoreListItem = components["schemas"]["MerchantStoreListItem"];
type StoreResponse = components["schemas"]["MerchantStoreResponse"];
type Broker = components["schemas"]["BrokerResponse"];
type Template = components["schemas"]["AgreementTemplateResponse"];
type Agreement = components["schemas"]["AgreementResponse"];

interface StoreOption {
  id: string;
  name: string;
  company_name: string;
  address: string;
}

interface SignerOption {
  id: string;
  name: string;
  phoneMasked: string;
}

const ACTION_FAILED = "操作失败";

/** 与后端 mask_phone 对齐：脱敏值用于判断当前手机号是否属于所选经纪人. */
function maskPhone(phone: string): string {
  const normalized = phone.replace(/[\s-]/g, "");
  if (!normalized || normalized.length < 7) {
    return "";
  }
  return `${normalized.slice(0, 3)}****${normalized.slice(-4)}`;
}

Page({
  data: {
    state: "loading" as "loading" | "error" | "needLogin" | "ok",
    errorText: "",
    stores: [] as StoreOption[],
    storeId: "",
    storeName: "",
    templates: [] as Template[],
    templateIndex: 0,
    templateName: "",
    signerName: "",
    signerPhone: "",
    signers: [] as SignerOption[],
    signerLabels: [] as string[],
    signerIndex: -1,
    signerHint: "",
    agreementNo: "",
    expireDate: "",
    remark: "",
    submitting: false,
    storePickerOpen: false,
    brokerModalOpen: false,
    newBrokerName: "",
    newBrokerPhone: "",
    brokerSaving: false,
    icons: { chevronRight: MP_ICONS.chevronRight, plus: MP_ICONS.plus, check: MP_ICONS.check },
  },

  onLoad(options: Record<string, string | undefined>) {
    void this.load(options.store_id || "");
  },

  // 从登录页返回后自恢复，避免用户停在「请先登录」
  onShow() {
    if (this.data.state === "needLogin" && getCAccessToken()) {
      void this.load(this.data.storeId);
    }
  },

  async load(storeId: string): Promise<void> {
    if (!getCAccessToken()) {
      this.setData({ state: "needLogin" });
      return;
    }
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
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 401 || statusCode === 403) {
        this.setData({ state: "needLogin" });
        return;
      }
      this.setData({ state: "error", errorText: describeRequestError(err, "发起页数据加载失败") });
    }
  },

  onGoLogin() {
    wx.navigateTo({ url: "/pages/login/index/index" });
  },

  onRetry() {
    this.load(this.data.storeId);
  },

  async selectStore(storeId: string): Promise<void> {
    try {
      const store = await request<StoreResponse>({ url: `/public/merchant/stores/${storeId}` });
      this.setData({ storeId, storeName: store.store_name });
      await this.loadSigners(storeId, store);
    } catch (err) {
      wx.showToast({ title: describeRequestError(err, ACTION_FAILED), icon: "none" });
    }
  },

  /**
   * REQ-IT5-04：签署人从门店经纪人中选，避免手填姓名与门店实际经纪人不一致。
   * 经纪人接口只回脱敏手机号（phone_masked），因此手机号仍由员工填写：选中号码与门店联系电话
   * 一致的经纪人时默认带出联系电话，否则留空重填；门店暂无经纪人（或接口失败）时退回手填。
   */
  async loadSigners(storeId: string, store: StoreResponse): Promise<void> {
    try {
      const brokers = await request<Broker[]>({ url: `/public/merchant/stores/${storeId}/brokers` });
      const signers: SignerOption[] = brokers.map((item) => ({
        id: item.id,
        name: item.name,
        phoneMasked: item.phone_masked,
      }));
      const maskedContact = maskPhone(store.contact_phone);
      // 联系人自动建档（REQ-IT5-06）后通常能在列表里命中门店联系电话，优先选中该经纪人；
      // 命中不到时不预填手机号，避免把联系人的号码填给另一位经纪人导致签错人。
      const matchedIndex = signers.findIndex(
        (item) => Boolean(maskedContact) && item.phoneMasked === maskedContact,
      );
      const selectedIndex = signers.length ? (matchedIndex >= 0 ? matchedIndex : 0) : -1;
      const selected = selectedIndex >= 0 ? signers[selectedIndex] : null;
      this.setData({
        signers,
        signerLabels: signers.map((item) => (item.phoneMasked ? `${item.name}（${item.phoneMasked}）` : item.name)),
        signerIndex: selectedIndex,
        signerName: selected ? selected.name : store.contact_name,
        signerPhone: selected && matchedIndex < 0 ? "" : store.contact_phone,
        signerHint: signers.length ? "" : "门店暂无经纪人，可手动填写签署人",
      });
    } catch {
      this.setData({
        signers: [],
        signerLabels: [],
        signerIndex: -1,
        signerName: store.contact_name,
        signerPhone: store.contact_phone,
        signerHint: "门店经纪人加载失败，可手动填写签署人",
      });
    }
  },

  onSelectSigner(e: WechatMiniprogram.PickerChange) {
    const index = Number(e.detail.value);
    const signer = this.data.signers[index];
    // 切换签署人时，仅当已填手机号确实属于该经纪人（脱敏值一致）才保留，否则清空重填
    const keepPhone = signer ? maskPhone(this.data.signerPhone) === signer.phoneMasked : false;
    this.setData({
      signerIndex: index,
      signerName: signer ? signer.name : "",
      signerPhone: keepPhone ? this.data.signerPhone : "",
    });
  },

  onOpenBrokerModal() {
    this.setData({ brokerModalOpen: true });
  },

  onCloseBrokerModal() {
    this.setData({ brokerModalOpen: false });
  },

  onNewBrokerNameInput(e: WechatMiniprogram.Input) {
    this.setData({ newBrokerName: e.detail.value });
  },

  onNewBrokerPhoneInput(e: WechatMiniprogram.Input) {
    this.setData({ newBrokerPhone: e.detail.value });
  },

  /**
   * REQ-IT5-05：门店没有经纪人时在发起页直接补录，补录后立即绑定并作为本次签署人。
   * 新增经纪人的真实手机号在本次操作中已知，因此顺带回填签署人手机号（列表接口只回脱敏值）。
   */
  async onSaveBroker(): Promise<void> {
    if (this.data.brokerSaving) {
      return;
    }
    const storeId = this.data.storeId;
    if (!storeId) {
      wx.showToast({ title: "请先选择门店", icon: "none" });
      return;
    }
    const name = this.data.newBrokerName.trim();
    const phone = this.data.newBrokerPhone.replace(/\s+/g, "");
    if (!name) {
      wx.showToast({ title: "请填写经纪人姓名", icon: "none" });
      return;
    }
    if (!/^1\d{10}$/.test(phone)) {
      wx.showToast({ title: "请填写 11 位手机号", icon: "none" });
      return;
    }
    this.setData({ brokerSaving: true });
    try {
      const created = await request<Broker>({
        url: `/public/merchant/stores/${storeId}/brokers`,
        method: "POST",
        data: { name, phone, remark: "发起协议页补录签署人" },
      });
      this.setData({ brokerModalOpen: false, newBrokerName: "", newBrokerPhone: "" });
      const store = await request<StoreResponse>({ url: `/public/merchant/stores/${storeId}` });
      await this.loadSigners(storeId, store);
      const index = this.data.signers.findIndex((item) => item.id === created.id);
      if (index >= 0) {
        this.setData({ signerIndex: index, signerName: this.data.signers[index].name, signerPhone: phone });
      }
      wx.showToast({ title: "经纪人已添加", icon: "success" });
    } catch (err) {
      wx.showToast({ title: describeRequestError(err, ACTION_FAILED), icon: "none" });
    } finally {
      this.setData({ brokerSaving: false });
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
    if (!signerName || (this.data.signers.length > 0 && this.data.signerIndex < 0)) {
      wx.showToast({ title: this.data.signers.length ? "请选择签署人" : "请填写签署人姓名", icon: "none" });
      return;
    }
    if (!signerPhone) {
      wx.showToast({ title: "请填写签署人手机号", icon: "none" });
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
      wx.showToast({ title: "已发起，请分享给商户签署", icon: "success" });
      wx.redirectTo({ url: `/pages/merchant/agreement/detail/index?id=${result.id}` });
    } catch (err) {
      wx.showToast({ title: describeRequestError(err, ACTION_FAILED), icon: "none" });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
