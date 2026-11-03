/**
 * 经纪人中心（V04）：认证、我的门店、绑定/换绑/解绑、推荐记录、联系对接人.
 *
 * - 未认证：展示认证表单（手机号必须已在 C 端账号绑定）
 * - 已认证：展示档案、当前门店、操作入口与只读历史
 * - 扫码进入（?code=）：解析门店邀请码，认证后自动绑定（D3-A 免审）
 *
 * 状态文案与色档统一走 utils/merchant-status.ts（M3 三档），
 * 请求错误文案统一走 utils/merchant-errors.ts，避免各页再各写一份兜底文案。
 *
 * 说明：本页同时承载「认证 / 我的门店 / 绑定与换绑 / 推荐记录 / 联系对接人」五块状态，
 * data 与方法都在同一 Page 对象内共享；拆成多文件会把页内状态变成跨文件隐式契约，
 * 维护成本高于单文件长度收益，故超过 500 行（REQ-IT7-08 时约 590 行）。
 */
import type { components } from "../../../types/api-types";
import { describeRequestError } from "../../../utils/merchant-errors";
import { storeStatusLabel, storeStatusTone, type StatusTone } from "../../../utils/merchant-status";
import { MP_ICONS } from "../../../utils/mp-icons";
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

interface DisplayLead {
  id: string;
  community_name: string;
  statusText: string;
  infoText: string;
  createdText: string;
  followUps: { id: string; methodText: string; content: string; followedText: string }[];
}

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

function statusCodeOf(err: unknown): number | undefined {
  return (err as { statusCode?: number }).statusCode;
}

/** 从扫到的二维码内容里取出门店邀请短码（兼容纯短码、`code=xxx`、`path?code=xxx`、`path?scene=xxx` 与带参数的 URL）. */
function extractStoreQrCode(raw: string): string {
  const text = (raw || "").trim();
  if (!text) return "";
  const codeMatch = text.match(/(?:^|[?&])code=([^&#]+)/);
  if (codeMatch) return decodeURIComponent(codeMatch[1]);
  const sceneMatch = text.match(/[?&]scene=([^&#]+)/);
  if (sceneMatch) {
    const scene = decodeURIComponent(sceneMatch[1]);
    const inner = scene.match(/[?&]?code=([^&#]+)/);
    if (inner) return decodeURIComponent(inner[1]);
    return /^[A-Za-z0-9_-]{8,64}$/.test(scene) ? scene : "";
  }
  return /^[A-Za-z0-9_-]{8,64}$/.test(text) ? text : "";
}

Page({
  data: {
    state: "loading" as PageState,
    errorText: "",
    hasPhone: false,
    // 注册
    regName: "",
    qrCode: "",
    qrStoreName: "",
    qrReason: "",
    // 认证前先搜索选定的门店，认证成功后自动绑定（REQ-IT7-08）
    pendingStoreId: "",
    pendingStoreName: "",
    // 分享归属（AC-024）
    referrer: "",
    // 档案
    broker: null as Broker | null,
    // 门店
    myStore: null as MyStore | null,
    storeTone: "todo" as StatusTone,
    storeLabel: "还没绑定门店",
    storeError: "",
    storeLoading: false,
    leads: [] as DisplayLead[],
    leadsError: "",
    leadsLoading: false,
    leadsTotal: 0,
    leadsPage: 1,
    // 门店搜索/绑定
    storePanelOpen: false,
    storeAction: "bind" as StoreAction,
    storeKeyword: "",
    storeOptions: [] as BrokerStoreOption[],
    storeSearching: false,
    storeSearched: false,
    selectedStoreId: "",
    changeReason: "",
    // 解绑/编辑
    unbindOpen: false,
    unbindReason: "",
    editOpen: false,
    editName: "",
    editRemark: "",
    saving: false,
    icons: {
      check: MP_ICONS.check,
      chevronDown: MP_ICONS.chevronDown,
      chevronRight: MP_ICONS.chevronRight,
    },
  },

  onLoad(options: Record<string, string | undefined>) {
    // 兼容两种进入方式：?code= 直接参数，或小程序码 scene（REQ-IT7-09）
    const rawScene = options.scene ? decodeURIComponent(options.scene) : "";
    const code = options.code || extractStoreQrCode(rawScene);
    this.setData({ qrCode: code, referrer: options.referrer || "" });
    this.load();
  },

  onShow() {
    if ((this.data.state === "profile" || this.data.state === "register") && getCAccessToken()) {
      this.load();
      return;
    }
    if (this.data.state === "needLogin" && getCAccessToken()) {
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
      this.setData({ hasPhone: Boolean(me.phone) });
      if (this.data.qrCode) {
        await this.resolveQRCode(this.data.qrCode);
      }
      try {
        const broker = await request<Broker>({ url: "/public/merchant/brokers/me" });
        this.setData({ state: "profile", broker });
        await Promise.all([this.loadStore(), this.loadLeads(1)]);
      } catch (err) {
        if (statusCodeOf(err) === 404) {
          this.setData({ state: "register" });
          return;
        }
        throw err;
      }
    } catch (err) {
      if (statusCodeOf(err) === 401) {
        this.setData({ state: "needLogin" });
        return;
      }
      this.setData({ state: "error", errorText: describeRequestError(err, "经纪人信息没加载出来") });
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

  /** 门店是二级信息：失败不打断整页，只在门店卡内提示，避免把「已绑定」误显示成「未绑定」 */
  async loadStore(): Promise<void> {
    this.setData({ storeLoading: true });
    try {
      const store = await request<MyStore | null>({ url: "/public/merchant/brokers/me/store" });
      this.setData({
        myStore: store || null,
        storeTone: store ? storeStatusTone(store.review_status, store.cooperation_status) : "todo",
        storeLabel: store ? storeStatusLabel(store.review_status, store.cooperation_status_label) : "还没绑定门店",
        storeError: "",
        storeLoading: false,
      });
    } catch (err) {
      this.setData({
        myStore: null,
        storeTone: "todo",
        storeLabel: "门店状态未知",
        storeError: describeRequestError(err, "门店信息没加载出来"),
        storeLoading: false,
      });
    }
  },

  async loadLeads(page: number): Promise<void> {
    this.setData({ leadsLoading: true });
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
        leadsError: "",
        leadsLoading: false,
      });
    } catch (err) {
      const message = describeRequestError(err, "推荐记录没加载出来");
      if (page === 1) {
        this.setData({ leads: [], leadsTotal: 0, leadsError: message, leadsLoading: false });
      } else {
        this.setData({ leadsLoading: false });
        wx.showToast({ title: message, icon: "none" });
      }
    }
  },

  /** 直接拨打对接人（门店负责人）电话（REQ-IT7-14）。 */
  onCallContact() {
    const phone = this.data.myStore?.owner_employee_phone || "";
    if (!phone) {
      wx.showToast({ title: "暂无对接人电话，请联系门店员工", icon: "none" });
      return;
    }
    wx.makePhoneCall({
      phoneNumber: phone,
      fail: () => {
        wx.showToast({ title: "拨号未完成，请稍后重试", icon: "none" });
      },
    });
  },

  /** 打开推荐线索的评估详情（REQ-IT7-10）。 */
  onOpenLeadDetail(e: WechatMiniprogram.BaseEvent) {
    const id = String(e.currentTarget.dataset.id || "");
    if (!id) return;
    wx.navigateTo({ url: `/pages/valuation/detail/index?id=${id}` });
  },

  onMoreLeads() {
    if (this.data.leadsLoading || this.data.leads.length >= this.data.leadsTotal) return;
    void this.loadLeads(this.data.leadsPage + 1);
  },

  onGoLogin() {
    wx.navigateTo({ url: "/pages/login/index/index?from=merchant" });
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
      if (this.data.pendingStoreId) {
        try {
          await request<Broker>({
            url: "/public/merchant/brokers/me/bind",
            method: "POST",
            data: { store_id: this.data.pendingStoreId },
          });
          this.setData({ pendingStoreId: "", pendingStoreName: "" });
        } catch (err) {
          wx.showToast({ title: describeRequestError(err, "门店绑定没成功，可在门店卡内重试"), icon: "none" });
        }
      }
      wx.showToast({
        title: result.auto_bound ? "认证成功，已绑定门店" : "认证成功",
        icon: "success",
      });
      if (result.qr_invalid_reason) {
        wx.showToast({ title: result.qr_invalid_reason, icon: "none" });
      }
      await this.load();
    } catch (err) {
      wx.showToast({ title: describeRequestError(err, "认证没提交成功"), icon: "none" });
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
      wx.showToast({ title: describeRequestError(err, "资料没保存成功"), icon: "none" });
    } finally {
      this.setData({ saving: false });
    }
  },

  onCreateStore() {
    wx.navigateTo({ url: "/pages/merchant/broker/store-create/index" });
  },

  onSkipBind() {
    // REQ-M05-006 三选一：暂不绑定即保持独立经纪人状态
    wx.showToast({ title: "已作为独立经纪人使用", icon: "none" });
  },

  onOpenBind() {
    this.setData({
      storePanelOpen: true,
      storeAction: "bind",
      storeKeyword: "",
      storeOptions: [],
      storeSearching: false,
      storeSearched: false,
      selectedStoreId: "",
      changeReason: "",
    });
    this.searchStores();
  },

  /** 认证页先搜索选门店：认证成功后自动绑定（REQ-IT7-08）. */
  onOpenBindForRegister() {
    this.onOpenBind();
  },

  onOpenChange() {
    this.setData({
      storePanelOpen: true,
      storeAction: "change",
      storeKeyword: "",
      storeOptions: [],
      storeSearching: false,
      storeSearched: false,
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
    const holder = this as unknown as { storeSearchSeq?: number };
    const seq = (holder.storeSearchSeq || 0) + 1;
    holder.storeSearchSeq = seq;
    this.setData({ storeSearching: true, storeSearched: false });
    try {
      const data = await request<BrokerStoreOptionListResponse>({
        url: "/public/merchant/broker-stores",
        data: { page: 1, page_size: 50, keyword: this.data.storeKeyword.trim() || undefined },
      });
      if (seq !== holder.storeSearchSeq) return;
      this.setData({ storeOptions: data.items, storeSearching: false, storeSearched: true });
    } catch (err) {
      if (seq !== holder.storeSearchSeq) return;
      this.setData({ storeSearching: false, storeSearched: true });
      wx.showToast({ title: describeRequestError(err, "门店没搜出来"), icon: "none" });
    }
  },

  /** 搜索不到自己的门店时，直接从搜索弹层跳到建店页（REQ-IT7-08）. */
  onCreateStoreFromPanel() {
    this.setData({ storePanelOpen: false });
    this.onCreateStore();
  },

  /** 扫码绑定：内部员工提供的门店二维码 → 解析门店 → 首次绑定免审生效（REQ-IT7-08）. */
  onScanBind(): void {
    // REQ-IT7-09：不要传 scanType——指定 scanType 后微信不会识别「小程序码」，
    // 真机相机对着邀请二维码会一直没有反应（开发者工具相册上传不受此限制）。
    wx.scanCode({
      onlyFromCamera: false,
      success: (res) => {
        // 扫「本小程序」的小程序码时微信只回传 path（如 pages/merchant-invite/index?scene=CODE），
        // result 为空或固定为 "*"；普通二维码/相册上传时内容才在 result 里。两个字段都尝试解析。
        let code = "";
        for (const candidate of [res.path, res.result]) {
          if (!candidate) continue;
          code = extractStoreQrCode(candidate);
          if (code) break;
        }
        if (!code) {
          wx.showToast({ title: "这不是门店邀请二维码", icon: "none" });
          return;
        }
        void this.bindByQrCode(code);
      },
      fail: () => {
        wx.showToast({ title: "未完成扫码", icon: "none" });
      },
    });
  },

  async bindByQrCode(code: string): Promise<void> {
    try {
      const resolved = await request<QRResolve>({
        url: `/public/merchant/broker-qrcodes/${encodeURIComponent(code)}`,
        skipAuth: true,
      });
      if (!resolved.valid || !resolved.store_id) {
        wx.showToast({ title: resolved.reason || "二维码无效或已过期", icon: "none" });
        return;
      }
      if (this.data.state === "register") {
        this.setData({
          qrCode: code,
          qrStoreName: resolved.store_name || "",
          qrReason: "",
          pendingStoreId: "",
          pendingStoreName: "",
        });
        wx.showToast({ title: "已识别门店，提交认证后自动绑定", icon: "none" });
        return;
      }
      await request<Broker>({
        url: "/public/merchant/brokers/me/bind",
        method: "POST",
        data: { store_id: resolved.store_id, qrcode_code: code },
      });
      wx.showToast({ title: "绑定成功", icon: "success" });
      await this.load();
    } catch (err) {
      wx.showToast({ title: describeRequestError(err, "扫码绑定没成功"), icon: "none" });
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
    if (this.data.state === "register") {
      const selected = this.data.storeOptions.find((item) => item.id === storeId);
      this.setData({
        pendingStoreId: storeId,
        pendingStoreName: selected ? selected.store_name : "",
        storePanelOpen: false,
      });
      wx.showToast({ title: "已选择门店，提交认证后自动绑定", icon: "none" });
      return;
    }
    const isChange = this.data.storeAction === "change";
    this.setData({ saving: true });
    try {
      if (isChange) {
        await request<Binding>({
          url: "/public/merchant/brokers/me/change",
          method: "POST",
          data: { store_id: storeId, reason: this.data.changeReason.trim() },
        });
        wx.showToast({ title: "换绑申请已提交", icon: "success" });
      } else {
        await request<Broker>({
          url: "/public/merchant/brokers/me/bind",
          method: "POST",
          data: { store_id: storeId },
        });
        wx.showToast({ title: "绑定成功", icon: "success" });
      }
      this.setData({ storePanelOpen: false });
      await this.load();
    } catch (err) {
      wx.showToast({ title: describeRequestError(err, isChange ? "换绑申请没提交成功" : "绑定没成功"), icon: "none" });
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
      wx.showToast({ title: describeRequestError(err, "解绑申请没提交成功"), icon: "none" });
    } finally {
      this.setData({ saving: false });
    }
  },
});
