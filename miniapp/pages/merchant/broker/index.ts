/**
 * 经纪人中心（V04）：认证、我的门店、绑定/换绑/解绑、绑定历史、推荐记录.
 *
 * - 未认证：展示认证表单（手机号必须已在 C 端账号绑定）
 * - 已认证：展示档案、当前门店、操作入口与只读历史
 * - 扫码进入（?code=）：解析门店邀请码，认证后自动绑定（D3-A 免审）
 */
import type { components } from "../../../types/api-types";
import { request } from "../../../utils/request";
import { getCAccessToken } from "../../../utils/token";

type Broker = components["schemas"]["BrokerResponse"];
type MyStore = components["schemas"]["BrokerMyStoreResponse"];
type Binding = components["schemas"]["BrokerBindingResponse"];
type BrokerRegisterResult = components["schemas"]["BrokerRegisterResult"];
type BrokerStoreOption = components["schemas"]["BrokerStoreOption"];
type BrokerStoreOptionListResponse = components["schemas"]["BrokerStoreOptionListResponse"];
type BrokerLeadListResponse = components["schemas"]["BrokerLeadListResponse"];
type BrokerLeadItem = components["schemas"]["BrokerLeadItem"];
type QRResolve = components["schemas"]["BrokerQRCodeResolveResponse"];
type PublicUserInfo = components["schemas"]["PublicUserInfo"];

type PageState = "loading" | "needLogin" | "register" | "profile" | "error";
type StoreAction = "bind" | "change";

interface DisplayBinding {
  id: string;
  store_name: string;
  statusText: string;
  timeText: string;
  reason: string;
}

interface DisplayLead {
  id: string;
  community_name: string;
  statusText: string;
  infoText: string;
  createdText: string;
  followUps: { id: string; methodText: string; content: string; followedText: string }[];
}

const BIND_STATUS_LABELS: Record<string, string> = {
  unbound: "未绑定",
  bound: "已绑定",
  unbound_after: "已解绑",
  disabled: "已停用",
  pending: "待审核",
};

const BINDING_STATUS_LABELS: Record<string, string> = {
  active: "已生效",
  pending: "待审核",
  rejected: "已驳回",
  unbound: "已解绑",
};

const LEAD_STATUS_LABELS: Record<string, string> = {
  pending_assessment: "待评估",
  pending_visit: "待看房",
  visited: "已看房",
  signed: "已签约",
  rejected: "已放弃",
  lost_to_competitor: "他司已成交",
};

const FOLLOW_METHOD_LABELS: Record<string, string> = {
  phone: "电话",
  wechat: "微信",
  face: "面谈",
  visit: "带看",
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function errMessage(err: unknown): string {
  return (err as { body?: { message?: string } }).body?.message || "操作失败，请重试";
}

function statusCodeOf(err: unknown): number | undefined {
  return (err as { statusCode?: number }).statusCode;
}

Page({
  data: {
    state: "loading" as PageState,
    errorText: "",
    phoneReady: false,
    hasPhone: false,
    // 注册
    regName: "",
    qrCode: "",
    qrStoreName: "",
    qrReason: "",
    // 分享归属（AC-024）
    referrer: "",
    // 档案
    broker: null as Broker | null,
    bindStatusText: "",
    // 门店
    myStore: null as MyStore | null,
    bindings: [] as DisplayBinding[],
    leads: [] as DisplayLead[],
    leadsTotal: 0,
    leadsPage: 1,
    // 门店搜索/绑定
    storePanelOpen: false,
    storeAction: "bind" as StoreAction,
    storeKeyword: "",
    storeOptions: [] as BrokerStoreOption[],
    selectedStoreId: "",
    changeReason: "",
    // 解绑/编辑
    unbindOpen: false,
    unbindReason: "",
    editOpen: false,
    editName: "",
    editRemark: "",
    saving: false,
  },

  onLoad(options: Record<string, string | undefined>) {
    (this as unknown as { qrCode: string }).qrCode = options.code || "";
    this.setData({ qrCode: options.code || "", referrer: options.referrer || "" });
    this.load();
  },

  onShow() {
    if (this.data.state === "profile" || this.data.state === "register") {
      this.load();
    }
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  async load(): Promise<void> {
    if (!getCAccessToken()) {
      this.setData({ state: "needLogin" });
      return;
    }
    this.setData({ state: "loading", errorText: "" });
    try {
      const me = await request<PublicUserInfo>({ url: "/public/auth/me" });
      const hasPhone = Boolean(me.phone);
      this.setData({ hasPhone, phoneReady: hasPhone });
      if (this.data.qrCode) {
        await this.resolveQRCode(this.data.qrCode);
      }
      try {
        const broker = await request<Broker>({ url: "/public/merchant/brokers/me" });
        this.setData({
          state: "profile",
          broker,
          bindStatusText: BIND_STATUS_LABELS[broker.bind_status] || broker.bind_status,
        });
        await Promise.all([this.loadStore(), this.loadBindings(), this.loadLeads(1)]);
      } catch (err) {
        if (statusCodeOf(err) === 404) {
          this.setData({ state: "register" });
          return;
        }
        throw err;
      }
    } catch (err) {
      this.setData({ state: "error", errorText: errMessage(err) });
    }
  },

  async resolveQRCode(code: string): Promise<void> {
    try {
      const resolved = await request<QRResolve>({
        url: `/public/merchant/broker-qrcodes/${encodeURIComponent(code)}`,
        skipAuth: true,
      });
      this.setData({
        qrStoreName: resolved.store_name || "",
        qrReason: resolved.valid ? "" : resolved.reason || "二维码无效",
      });
    } catch {
      this.setData({ qrReason: "二维码解析失败" });
    }
  },

  async loadStore(): Promise<void> {
    try {
      const store = await request<MyStore | null>({ url: "/public/merchant/brokers/me/store" });
      this.setData({ myStore: store || null });
    } catch {
      this.setData({ myStore: null });
    }
  },

  async loadBindings(): Promise<void> {
    try {
      const rows = await request<Binding[]>({ url: "/public/merchant/brokers/me/bindings" });
      this.setData({
        bindings: rows.map((row) => ({
          id: row.id,
          store_name: row.store_name,
          statusText: BINDING_STATUS_LABELS[row.status] || row.status,
          timeText: formatDate(row.applied_at),
          reason: row.reason || "",
        })),
      });
    } catch {
      this.setData({ bindings: [] });
    }
  },

  async loadLeads(page: number): Promise<void> {
    try {
      const data = await request<BrokerLeadListResponse>({
        url: "/public/merchant/brokers/me/leads",
        data: { page, page_size: 20 },
      });
      const mapped: DisplayLead[] = data.items.map((item: BrokerLeadItem) => ({
        id: item.id,
        community_name: item.community_name,
        statusText: LEAD_STATUS_LABELS[item.status] || item.status,
        infoText: [item.layout, item.area ? `${item.area}㎡` : "", item.total_price ? `${item.total_price}万` : ""]
          .filter(Boolean)
          .join(" · "),
        createdText: formatDate(item.created_at),
        followUps: item.follow_ups.map((fu) => ({
          id: fu.id,
          methodText: FOLLOW_METHOD_LABELS[fu.method] || fu.method,
          content: fu.content,
          followedText: formatDate(fu.followed_at),
        })),
      }));
      this.setData({
        leads: page === 1 ? mapped : this.data.leads.concat(mapped),
        leadsTotal: data.total,
        leadsPage: page,
      });
    } catch {
      if (page === 1) this.setData({ leads: [], leadsTotal: 0 });
    }
  },

  onMoreLeads() {
    if (this.data.leads.length >= this.data.leadsTotal) return;
    this.loadLeads(this.data.leadsPage + 1);
  },

  onGoLogin() {
    wx.navigateTo({ url: "/pages/login/index/index" });
  },

  onGoProfile() {
    wx.switchTab({ url: "/pages/profile/index/index" });
  },

  onRegNameInput(e: WechatMiniprogram.Input) {
    this.setData({ regName: e.detail.value });
  },

  async onRegister(): Promise<void> {
    const name = this.data.regName.trim();
    if (!name) {
      wx.showToast({ title: "请填写姓名", icon: "none" });
      return;
    }
    if (!this.data.hasPhone) {
      wx.showToast({ title: "请先完善手机号", icon: "none" });
      return;
    }
    this.setData({ saving: true });
    try {
      const result = await request<BrokerRegisterResult>({
        url: "/public/merchant/brokers/register",
        method: "POST",
        data: {
          name,
          qrcode_code: this.data.qrCode || undefined,
          referrer: this.data.referrer || undefined,
        },
      });
      wx.showToast({
        title: result.auto_bound ? "认证成功，已绑定门店" : "认证成功",
        icon: "success",
      });
      if (result.qr_invalid_reason) {
        wx.showToast({ title: result.qr_invalid_reason, icon: "none" });
      }
      await this.load();
    } catch (err) {
      wx.showToast({ title: errMessage(err), icon: "none" });
    } finally {
      this.setData({ saving: false });
    }
  },

  onOpenEdit() {
    const broker = this.data.broker;
    if (!broker) return;
    this.setData({ editOpen: true, editName: broker.name, editRemark: broker.remark || "" });
  },

  onCloseEdit() {
    this.setData({ editOpen: false });
  },

  onEditNameInput(e: WechatMiniprogram.Input) {
    this.setData({ editName: e.detail.value });
  },

  onEditRemarkInput(e: WechatMiniprogram.Input) {
    this.setData({ editRemark: e.detail.value });
  },

  async onSaveProfile(): Promise<void> {
    const name = this.data.editName.trim();
    if (!name) {
      wx.showToast({ title: "姓名不能为空", icon: "none" });
      return;
    }
    this.setData({ saving: true });
    try {
      await request<Broker>({
        url: "/public/merchant/brokers/me",
        method: "PUT",
        data: { name, remark: this.data.editRemark.trim() || null },
      });
      this.setData({ editOpen: false });
      wx.showToast({ title: "已保存", icon: "success" });
      await this.load();
    } catch (err) {
      wx.showToast({ title: errMessage(err), icon: "none" });
    } finally {
      this.setData({ saving: false });
    }
  },

  onCreateStore() {
    wx.navigateTo({ url: "/pages/merchant/broker/store-create/index" });
  },

  onOpenBind() {
    this.setData({
      storePanelOpen: true,
      storeAction: "bind",
      storeKeyword: "",
      storeOptions: [],
      selectedStoreId: "",
      changeReason: "",
    });
    this.searchStores();
  },

  onOpenChange() {
    this.setData({
      storePanelOpen: true,
      storeAction: "change",
      storeKeyword: "",
      storeOptions: [],
      selectedStoreId: "",
      changeReason: "",
    });
    this.searchStores();
  },

  onCloseStorePanel() {
    this.setData({ storePanelOpen: false });
  },

  onStoreKeywordInput(e: WechatMiniprogram.Input) {
    this.setData({ storeKeyword: e.detail.value });
  },

  async searchStores(): Promise<void> {
    try {
      const data = await request<BrokerStoreOptionListResponse>({
        url: "/public/merchant/broker-stores",
        data: { page: 1, page_size: 50, keyword: this.data.storeKeyword.trim() || undefined },
      });
      this.setData({ storeOptions: data.items });
    } catch (err) {
      wx.showToast({ title: errMessage(err), icon: "none" });
    }
  },

  onSelectStore(e: WechatMiniprogram.BaseEvent) {
    this.setData({ selectedStoreId: e.currentTarget.dataset.id as string });
  },

  onChangeReasonInput(e: WechatMiniprogram.Input) {
    this.setData({ changeReason: e.detail.value });
  },

  async onSubmitStore(): Promise<void> {
    const storeId = this.data.selectedStoreId;
    if (!storeId) {
      wx.showToast({ title: "请选择门店", icon: "none" });
      return;
    }
    if (this.data.storeAction === "change" && !this.data.changeReason.trim()) {
      wx.showToast({ title: "请填写换绑原因", icon: "none" });
      return;
    }
    this.setData({ saving: true });
    try {
      if (this.data.storeAction === "bind") {
        await request<Broker>({
          url: "/public/merchant/brokers/me/bind",
          method: "POST",
          data: { store_id: storeId },
        });
        wx.showToast({ title: "绑定成功", icon: "success" });
      } else {
        await request<Binding>({
          url: "/public/merchant/brokers/me/change",
          method: "POST",
          data: { store_id: storeId, reason: this.data.changeReason.trim() },
        });
        wx.showToast({ title: "换绑申请已提交", icon: "success" });
      }
      this.setData({ storePanelOpen: false });
      await this.load();
    } catch (err) {
      wx.showToast({ title: errMessage(err), icon: "none" });
    } finally {
      this.setData({ saving: false });
    }
  },

  onOpenUnbind() {
    this.setData({ unbindOpen: true, unbindReason: "" });
  },

  onCloseUnbind() {
    this.setData({ unbindOpen: false });
  },

  onUnbindReasonInput(e: WechatMiniprogram.Input) {
    this.setData({ unbindReason: e.detail.value });
  },

  async onSubmitUnbind(): Promise<void> {
    const reason = this.data.unbindReason.trim();
    if (!reason) {
      wx.showToast({ title: "请填写解绑原因", icon: "none" });
      return;
    }
    this.setData({ saving: true });
    try {
      await request<Binding>({
        url: "/public/merchant/brokers/me/unbind",
        method: "POST",
        data: { reason },
      });
      this.setData({ unbindOpen: false });
      wx.showToast({ title: "解绑申请已提交", icon: "success" });
      await this.load();
    } catch (err) {
      wx.showToast({ title: errMessage(err), icon: "none" });
    } finally {
      this.setData({ saving: false });
    }
  },
});
