/**
 * 员工协议列表（V05）：按门店筛选、状态筛选、发起协议入口.
 */
import type { components } from "../../../../types/api-types";
import { describeRequestError } from "../../../../utils/merchant-errors";
import { agreementStatusLabel, agreementStatusTone } from "../../../../utils/merchant-status";
import { MP_ICONS } from "../../../../utils/mp-icons";
import { request } from "../../../../utils/request";
import { getCAccessToken } from "../../../../utils/token";

type AgreementListResponse = components["schemas"]["AgreementListResponse"];
type Agreement = components["schemas"]["AgreementResponse"];

interface DisplayAgreement {
  id: string;
  title: string;
  subject_name: string;
  statusText: string;
  statusTone: string;
  expireText: string;
  signerText: string;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

Page({
  data: {
    state: "loading" as "loading" | "error" | "needLogin" | "empty" | "items",
    errorText: "",
    storeId: "",
    status: "all",
    tabs: [
      { code: "all", label: "全部" },
      { code: "pending_sign", label: "待签署" },
      { code: "signed", label: "已签署" },
      { code: "expired", label: "已过期" },
      { code: "voided", label: "已作废" },
    ],
    items: [] as DisplayAgreement[],
    total: 0,
    statusLabel: "",
    icons: { chevronRight: MP_ICONS.chevronRight },
  },

  onLoad(options: Record<string, string | undefined>) {
    const storeId = options.store_id || "";
    this.setData({ storeId });
    (this as unknown as { shownOnce?: boolean }).shownOnce = false;
    this.load();
  },

  // REQ-IT5-02：从发起页/签署页返回时重新拉取，否则新发起的待签署协议不会出现在「全部」里
  onShow() {
    const self = this as unknown as { shownOnce?: boolean };
    if (!self.shownOnce) {
      self.shownOnce = true;
      return;
    }
    if (this.data.state === "needLogin") {
      if (getCAccessToken()) void this.load();
      return;
    }
    void this.load({ silent: this.data.state === "items" || this.data.state === "empty" });
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  async load(options: { silent?: boolean } = {}): Promise<void> {
    const holder = this as unknown as { loadSeq?: number };
    const seq = (holder.loadSeq || 0) + 1;
    holder.loadSeq = seq;
    if (!options.silent) {
      this.setData({ state: "loading", errorText: "" });
    }
    try {
      const data = await request<AgreementListResponse>({
        url: "/public/merchant/agreements",
        data: {
          page: 1,
          page_size: 50,
          store_id: this.data.storeId || undefined,
          status: this.data.status === "all" ? undefined : this.data.status,
        },
      });
      if (seq !== holder.loadSeq) return;
      const items = data.items.map((item: Agreement) => ({
        id: item.id,
        title: item.agreement_no || item.id.slice(0, 8),
        subject_name: item.subject_name || "—",
        statusText: agreementStatusLabel(item.status),
        statusTone: agreementStatusTone(item.status),
        expireText: item.expire_at ? formatDate(item.expire_at) : "长期有效",
        signerText: item.signer_name || "—",
      }));
      this.setData({ items, total: data.total, state: items.length ? "items" : "empty" });
    } catch (err) {
      if (seq !== holder.loadSeq) return;
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 401) {
        this.setData({ state: "needLogin" });
        return;
      }
      if (options.silent && this.data.state === "items") {
        wx.showToast({ title: describeRequestError(err, "协议列表刷新失败"), icon: "none" });
        return;
      }
      this.setData({ state: "error", errorText: describeRequestError(err, "协议列表加载失败") });
    }
  },

  onGoLogin() {
    wx.navigateTo({ url: "/pages/login/index/index?from=merchant" });
  },

  onRetry() {
    this.load();
  },

  onSelectTab(e: WechatMiniprogram.BaseEvent) {
    // 空态里的「查看全部协议」也走这里（data-code="all"）
    const code = e.currentTarget.dataset.code as string;
    const tab = this.data.tabs.find((item) => item.code === code);
    this.setData({ status: code, statusLabel: tab ? tab.label : "" });
    this.load();
  },

  onCreate() {
    const suffix = this.data.storeId ? `?store_id=${this.data.storeId}` : "";
    wx.navigateTo({ url: `/pages/merchant/agreement/create/index${suffix}` });
  },

  onTapItem(e: WechatMiniprogram.BaseEvent) {
    const id = e.currentTarget.dataset.id as string;
    wx.navigateTo({ url: `/pages/merchant/agreement/detail/index?id=${id}` });
  },
});
