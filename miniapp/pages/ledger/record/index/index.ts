/**
 * ③ 记一笔全屏表单页（②账目清单 → 本页）.
 *
 * 对齐后台 RecordDialog（Task 8 重构后交互）：
 * - 方向二选一（花出去 out / 收进来 in）：界面本身不提供「同时填流出和流入」的可能，
 *   单一金额按方向落到 outflow 或 inflow，服务端互斥校验从结构上不可能触发；
 * - 资金账户（新）：GET /admin/accounts/options 免解锁拉账户列表（仅 id/名称/类型/卡号，
 *   无余额），流出=付款账户 / 流入=收款账户，方向切换时清空已选避免挂错；
 *   必须选一个账户，或显式勾「没走账户」并写明备注原因（后端同样校验）；
 * - 对方信息：按方向只展示相关的一方（out→付给谁 payee / in→谁付的 payer），
 *   账户已确定的那一方由账户带入，避免重复输入；
 * - 科目 via subject-picker 弹层（按业务模式过滤）；
 * - 票据九宫格：wx.chooseMedia → wx.uploadFile ${BASE_URL}/files/upload（admin 令牌，
 *   401 刷新重试一次）→ FileUploadResponse.url 记入列表；
 * - 提交：POST /admin/ledger，date 发送 YYYY-MM-DD；成功 toast → navigateBack 回②刷新。
 */
import type { components } from "../../../../types/api-types";
import { request, refreshAccessToken } from "../../../../utils/request";
import { getAccessToken } from "../../../../utils/token";
import { resolveAssetUrl } from "../../../../utils/url";
import { BASE_URL } from "../../../../utils/config";
import { pad2 } from "../../../../utils/format";

type BusinessForm = components["schemas"]["BusinessForm"];
type LedgerRecordCreate = components["schemas"]["LedgerRecordCreate"];
type CashFlowRecordResponse = components["schemas"]["CashFlowRecordResponse"];
type FileUploadResponse = components["schemas"]["FileUploadResponse"];
type FundAccountOption = components["schemas"]["FundAccountOption"];

/** 票据最多数量. */
const MAX_RECEIPTS = 9;

/** wx.uploadFile 单次上传结果. */
interface UploadResult {
  statusCode: number;
  data: string;
}

/** 票据展示项. */
interface ReceiptItem {
  key: string;
  /** 已上传的服务端 url（空=上传中）. */
  url: string;
  /** 展示缩略图（上传中先用本地临时路径）. */
  thumb: string;
  uploading: boolean;
}

/** 账户展示项（选项接口不含余额，从类型上保证不显示假数字）. */
interface AccountItem {
  id: string;
  name: string;
  typeText: string;
  accountNo: string;
}

/** 账户类型 → 展示中文（对齐后台 ACCOUNT_TYPES 语义）. */
const ACCOUNT_TYPE_TEXT: Record<string, string> = {
  bank: "银行",
  alipay: "支付宝",
  wechat: "微信",
  cash: "现金",
  other: "其他",
};

/** 页面 data. */
interface PageData {
  projectId: string;
  projectName: string;
  communityName: string;
  businessForm: BusinessForm | null;
  /** subject-picker 的 mode 参数（agent/acquire/空=all）. */
  pickerMode: string;
  pickerVisible: boolean;
  subjectId: string;
  subjectName: string;
  subjectLevel: string;
  /** 方向二选一：out=花出去 / in=收进来. */
  direction: "out" | "in";
  amount: string;
  /** 对方信息：out→payee（付给谁）/ in→payer（谁付的）. */
  counterparty: string;
  /** 资金账户. */
  accounts: AccountItem[];
  accountsLoading: boolean;
  accountsLoadFailed: boolean;
  accountId: string;
  accountSkipped: boolean;
  date: string;
  remark: string;
  receipts: ReceiptItem[];
  uploadingAll: boolean;
  submitting: boolean;
  subjectError: string;
  amountError: string;
  accountError: string;
  dateError: string;
  canAddReceipt: boolean;
}

/** 页面自定义方法. */
interface PageCustom {
  pendingUploads: number;
  getToken(): string;
  clearToken(): void;
  todayStr(): string;
  loadAccounts(): void;
  openPicker(): void;
  onSubjectSelect(e: WechatMiniprogram.CustomEvent): void;
  onSubjectClose(): void;
  onDirectionTap(e: WechatMiniprogram.BaseEvent): void;
  onAmountInput(e: WechatMiniprogram.Input): void;
  onCounterpartyInput(e: WechatMiniprogram.Input): void;
  onAccountTap(e: WechatMiniprogram.BaseEvent): void;
  onToggleSkipped(): void;
  onDateChange(e: WechatMiniprogram.PickerChange): void;
  onRemarkInput(e: WechatMiniprogram.Input): void;
  onAddReceipt(): void;
  uploadReceipt(localPath: string, key: string): void;
  applyReceiptSuccess(key: string, url: string): void;
  removeReceiptByKey(key: string): void;
  onRemoveReceipt(e: WechatMiniprogram.BaseEvent): void;
  validate(): boolean;
  onSubmit(): void;
}

/** 上传文件到 ${BASE_URL}/files/upload（admin 令牌）. */
function doUploadFile(filePath: string, token: string): Promise<UploadResult> {
  return new Promise<UploadResult>((resolve, reject) => {
    wx.uploadFile({
      url: `${BASE_URL}/files/upload`,
      filePath,
      name: "file",
      header: { Authorization: `Bearer ${token}` },
      success: (res) => resolve({ statusCode: res.statusCode, data: res.data }),
      fail: (err) => reject(err),
    });
  });
}

Page<PageData, PageCustom>({
  pendingUploads: 0,

  data: {
    projectId: "",
    projectName: "",
    communityName: "",
    businessForm: null,
    pickerMode: "",
    pickerVisible: false,
    subjectId: "",
    subjectName: "",
    subjectLevel: "",
    direction: "out",
    amount: "",
    counterparty: "",
    accounts: [],
    accountsLoading: false,
    accountsLoadFailed: false,
    accountId: "",
    accountSkipped: false,
    date: "",
    remark: "",
    receipts: [],
    uploadingAll: false,
    submitting: false,
    subjectError: "",
    amountError: "",
    accountError: "",
    dateError: "",
    canAddReceipt: true,
  },

  getToken() {
    return getAccessToken();
  },

  clearToken() {
    wx.removeStorageSync("access_token");
    wx.removeStorageSync("refresh_token");
  },

  todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  },

  onLoad(query) {
    const businessFormStr = (query.business_form as string) || "";
    const businessForm: BusinessForm | null =
      businessFormStr === "agent" || businessFormStr === "wholesale" ? businessFormStr : null;
    const rawName = (query.name as string) || "";
    const rawCommunity = (query.community_name as string) || "";
    this.setData({
      projectId: (query.id as string) || "",
      projectName: rawName ? decodeURIComponent(rawName) : "",
      communityName: rawCommunity ? decodeURIComponent(rawCommunity) : "",
      businessForm,
      // 科目 mode 映射（与后台 subject-select-panel 一致）：agent→agent / wholesale→acquire / null→all
      pickerMode: businessForm === "agent" ? "agent" : businessForm === "wholesale" ? "acquire" : "",
      date: this.todayStr(),
    });
    this.loadAccounts();
  },

  /** 拉取资金账户选项（/admin/accounts/options 免解锁，无余额字段）. */
  loadAccounts() {
    const token = this.getToken();
    if (!token) {
      this.clearToken();
      this.setData({ accountsLoadFailed: true });
      return;
    }
    this.setData({ accountsLoading: true, accountsLoadFailed: false });
    request<{ items: FundAccountOption[]; total: number }>({
      url: `/admin/accounts/options`,
      header: { Authorization: `Bearer ${token}` },
    })
      .then((data) => {
        const accounts = (data.items ?? [])
          .filter((item) => item.status === "active")
          .map((item) => ({
            id: item.id,
            name: item.name ?? "",
            typeText: ACCOUNT_TYPE_TEXT[item.type ?? ""] ?? "",
            accountNo: item.account_no ?? "",
          }));
        this.setData({ accounts, accountsLoading: false });
      })
      .catch((err) => {
        const statusCode = (err as { statusCode?: number } | undefined)?.statusCode;
        if (statusCode === 401) {
          this.clearToken();
          wx.showToast({ title: "登录已失效，请重新登录", icon: "none" });
        }
        // 失败不阻塞记账（可勾「没走账户」），但明确提示而非静默变空
        this.setData({ accountsLoading: false, accountsLoadFailed: true });
      });
  },

  openPicker() {
    this.setData({ pickerVisible: true });
  },

  onSubjectSelect(e: WechatMiniprogram.CustomEvent) {
    const detail = e.detail as { id: string; name: string; level: string };
    if (!detail?.id) {
      this.setData({ pickerVisible: false });
      return;
    }
    this.setData({
      subjectId: detail.id,
      subjectName: detail.name,
      subjectLevel: detail.level,
      pickerVisible: false,
      subjectError: "",
    });
  },

  onSubjectClose() {
    this.setData({ pickerVisible: false });
  },

  /** 方向切换：清空账户选择（付款户↔收款户语义不同，混用会挂错）与对方信息. */
  onDirectionTap(e: WechatMiniprogram.BaseEvent) {
    const value = e.currentTarget.dataset.value as "out" | "in";
    if (!value || value === this.data.direction) {
      return;
    }
    this.setData({
      direction: value,
      accountId: "",
      counterparty: "",
      accountError: "",
      amountError: "",
    });
  },

  onAmountInput(e: WechatMiniprogram.Input) {
    this.setData({ amount: e.detail.value || "", amountError: "" });
  },

  onCounterpartyInput(e: WechatMiniprogram.Input) {
    this.setData({ counterparty: e.detail.value || "" });
  },

  onAccountTap(e: WechatMiniprogram.BaseEvent) {
    const id = e.currentTarget.dataset.id as string;
    if (this.data.accountSkipped) {
      return;
    }
    this.setData({ accountId: id === this.data.accountId ? id : id, accountError: "" });
  },

  /** 勾/取消「没走账户」：勾选时清空已选账户. */
  onToggleSkipped() {
    const next = !this.data.accountSkipped;
    this.setData({
      accountSkipped: next,
      accountId: next ? "" : this.data.accountId,
      accountError: "",
    });
  },

  onDateChange(e: WechatMiniprogram.PickerChange) {
    this.setData({ date: (e.detail.value as string) || this.todayStr(), dateError: "" });
  },

  onRemarkInput(e: WechatMiniprogram.Input) {
    this.setData({ remark: e.detail.value || "" });
  },

  onAddReceipt() {
    const existing = this.data.receipts.length;
    if (existing >= MAX_RECEIPTS) {
      return;
    }
    wx.chooseMedia({
      count: MAX_RECEIPTS - existing,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      success: (res) => {
        res.tempFiles.forEach((f) => {
          if (this.data.receipts.length >= MAX_RECEIPTS) {
            return;
          }
          const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const receipts = [
            ...this.data.receipts,
            { key, url: "", thumb: f.tempFilePath, uploading: true },
          ];
          this.setData({ receipts, canAddReceipt: receipts.length < MAX_RECEIPTS });
          this.uploadReceipt(f.tempFilePath, key);
        });
      },
    });
  },

  uploadReceipt(localPath: string, key: string) {
    const token = this.getToken();
    if (!token) {
      this.clearToken();
      wx.showToast({ title: "登录已失效", icon: "none" });
      return;
    }
    this.pendingUploads += 1;
    this.setData({ uploadingAll: true });
    const done = () => {
      this.pendingUploads -= 1;
      if (this.pendingUploads <= 0) {
        this.pendingUploads = 0;
        this.setData({ uploadingAll: false });
      }
    };
    doUploadFile(localPath, token)
      .then((res) => {
        if (res.statusCode === 401) {
          // 复用统一 refreshAccessToken（与 request.ts 同源）：
          // 刷新成功用新令牌重试一次；刷新失败清令牌并提示登录失效
          return refreshAccessToken().then((newToken) => {
            if (newToken) {
              return doUploadFile(localPath, newToken);
            }
            this.clearToken();
            wx.showToast({ title: "登录已失效，请重新登录", icon: "none" });
            return null;
          });
        }
        return res;
      })
      .then((res) => {
        if (!res) {
          throw new Error("upload failed");
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          throw new Error(res.data);
        }
        const file = JSON.parse(res.data) as FileUploadResponse;
        if (!file.url) {
          throw new Error("upload response missing url");
        }
        this.applyReceiptSuccess(key, file.url);
        done();
      })
      .catch(() => {
        this.removeReceiptByKey(key);
        wx.showToast({ title: "上传失败", icon: "none" });
        done();
      });
  },

  applyReceiptSuccess(key: string, url: string) {
    const receipts = this.data.receipts.map((r) =>
      r.key === key
        ? { ...r, url, thumb: resolveAssetUrl(url), uploading: false }
        : r,
    );
    this.setData({ receipts, canAddReceipt: receipts.length < MAX_RECEIPTS });
  },

  removeReceiptByKey(key: string) {
    const receipts = this.data.receipts.filter((r) => r.key !== key);
    this.setData({ receipts, canAddReceipt: receipts.length < MAX_RECEIPTS });
  },

  onRemoveReceipt(e: WechatMiniprogram.BaseEvent) {
    const key = e.currentTarget.dataset.key as string;
    this.removeReceiptByKey(key);
  },

  validate(): boolean {
    const amountNum = parseFloat(this.data.amount || "0") || 0;
    const subjectError = this.data.subjectId ? "" : "请选择科目分类";
    const amountError =
      amountNum <= 0
        ? this.data.direction === "out"
          ? "请填写流出金额（大于 0）"
          : "请填写流入金额（大于 0）"
        : "";
    // 账户：必须选一个，或显式勾「没走账户」并写明原因（后端同样校验）
    let accountError = "";
    if (!this.data.accountSkipped && !this.data.accountId) {
      accountError =
        this.data.direction === "out"
          ? "请选择付款账户，或标记「没走账户」"
          : "请选择收款账户，或标记「没走账户」";
    }
    const dateError = this.data.date ? "" : "请选择发生日期";
    const ok = !subjectError && !amountError && !accountError && !dateError;
    this.setData({ subjectError, amountError, accountError, dateError });
    return ok;
  },

  onSubmit() {
    if (this.data.submitting) {
      return;
    }
    // 票据仍在上传时禁止提交：否则下方 filter(!!r.url) 会把未完成的票据静默丢弃，
    // 造成「记账成功但凭证丢失」的数据完整性问题
    if (this.data.uploadingAll) {
      wx.showToast({ title: "票据上传中，请稍候", icon: "none" });
      return;
    }
    if (!this.validate()) {
      return;
    }
    // 勾「没走账户」必须写明原因（后端 Service 同样校验，前置拦截给即时反馈）
    if (this.data.accountSkipped && !this.data.remark.trim()) {
      wx.showToast({ title: "标记「没走账户」时请填写备注说明原因", icon: "none" });
      return;
    }
    const token = this.getToken();
    if (!token) {
      this.clearToken();
      wx.showToast({ title: "登录已失效", icon: "none" });
      return;
    }
    const amountNum = parseFloat(this.data.amount || "0") || 0;
    // 方向决定金额落到 outflow 还是 inflow：永远只有一个 > 0
    const outflowNum = this.data.direction === "out" ? amountNum : 0;
    const inflowNum = this.data.direction === "in" ? amountNum : 0;
    const receiptUrls = this.data.receipts
      .filter((r) => !!r.url)
      .map((r) => r.url);

    const body: LedgerRecordCreate = {
      project_id: this.data.projectId,
      subject_id: this.data.subjectId,
      date: this.data.date, // YYYY-MM-DD，Pydantic 解析为当日零点
      outflow: outflowNum,
      inflow: inflowNum,
      account_id: this.data.accountSkipped ? null : this.data.accountId || null,
      account_skipped: this.data.accountSkipped,
      receipt_urls: receiptUrls.length > 0 ? receiptUrls : undefined,
    };
    // 对方信息：out→payee（付给谁）/ in→payer（谁付的），与后台一致
    const counterparty = this.data.counterparty.trim();
    if (counterparty) {
      if (this.data.direction === "out") {
        body.payee = counterparty;
      } else {
        body.payer = counterparty;
      }
    }
    if (this.data.remark.trim()) {
      body.description = this.data.remark.trim();
    }

    this.setData({ submitting: true });
    request<CashFlowRecordResponse>({
      url: `/admin/ledger`,
      method: "POST",
      data: body,
      header: { Authorization: `Bearer ${token}` },
    })
      .then(() => {
        wx.showToast({ title: "记账成功", icon: "success" });
        setTimeout(() => wx.navigateBack({ delta: 1 }), 800);
      })
      .catch((err) => {
        const statusCode = (err as { statusCode?: number } | undefined)?.statusCode;
        if (statusCode === 401) {
          this.clearToken();
          wx.showToast({ title: "登录已失效，请重新登录", icon: "none" });
        } else {
          const msg = (err as { body?: { message?: string } } | undefined)?.body?.message;
          wx.showToast({
            title: msg || (statusCode === 403 ? "无权限记账" : "提交失败，请重试"),
            icon: "none",
          });
        }
      })
      .finally(() => this.setData({ submitting: false }));
  },
});
