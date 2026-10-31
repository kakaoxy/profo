/**
 * 员工协议列表（V05）：按门店筛选、状态筛选、发起协议入口.
 */
import type { components } from "../../../../types/api-types";
import { request } from "../../../../utils/request";

type AgreementListResponse = components["schemas"]["AgreementListResponse"];
type Agreement = components["schemas"]["AgreementResponse"];

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

interface DisplayAgreement {
  id: string;
  title: string;
  subject_name: string;
  statusText: string;
  reviewText: string;
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

function errMessage(err: unknown): string {
  return (err as { body?: { message?: string } }).body?.message || "加载失败，请重试";
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
  },

  onLoad(options: Record<string, string | undefined>) {
    const storeId = options.store_id || "";
    this.setData({ storeId });
    this.load();
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  async load(): Promise<void> {
    this.setData({ state: "loading", errorText: "" });
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
      const items = data.items.map((item: Agreement) => ({
        id: item.id,
        title: item.agreement_no || item.id.slice(0, 8),
        subject_name: item.subject_name || "—",
        statusText: STATUS_LABELS[item.status] || item.status,
        reviewText: REVIEW_LABELS[item.review_status] || item.review_status,
        expireText: formatDate(item.expire_at),
        signerText: item.signer_name || "—",
      }));
      this.setData({ items, total: data.total, state: items.length ? "items" : "empty" });
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 401 || statusCode === 403) {
        this.setData({ state: "needLogin" });
        return;
      }
      this.setData({ state: "error", errorText: errMessage(err) });
    }
  },

  onGoLogin() {
    wx.navigateTo({ url: "/pages/login/index/index" });
  },

  onRetry() {
    this.load();
  },

  onSelectTab(e: WechatMiniprogram.BaseEvent) {
    this.setData({ status: e.currentTarget.dataset.code as string });
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
