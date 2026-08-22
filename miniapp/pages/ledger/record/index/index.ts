/**
 * ③ 记一笔全屏表单页（②账目清单 → 本页）.
 *
 * 完整映射 LedgerRecordCreate 并 POST /admin/ledger 创建流水：
 * - 项目上下文头（query 传入，只读）；科目 via subject-picker 弹层；
 * - 流出(绿)/流入(红) 金额互斥校验；发生日期 date picker 默认今天；
 * - 票据九宫格：wx.chooseMedia → wx.uploadFile ${BASE_URL}/files/upload（admin 令牌，
 *   401 刷新重试一次，参照 profile uploadAvatar 模式）→ FileUploadResponse.url 记入列表；
 * - 提交：date 发送 YYYY-MM-DD，receipt_urls 为已上传 url 数组；成功 toast → navigateBack 回②刷新；
 *   失败保留表单数据并 toast。
 */
import type { components } from "../../../../types/api-types";
import { request, refreshAccessToken } from "../../../../utils/request";
import { getAccessToken } from "../../../../utils/token";
import { resolveAssetUrl } from "../../../../utils/url";
import { BASE_URL } from "../../../../utils/config";
import { pad2 } from "../../../../utils/format";

type BusinessForm = components["schemas"]["BusinessForm"];
type SubjectLevel = components["schemas"]["SubjectLevel"];
type LedgerRecordCreate = components["schemas"]["LedgerRecordCreate"];
type CashFlowRecordResponse = components["schemas"]["CashFlowRecordResponse"];
type FileUploadResponse = components["schemas"]["FileUploadResponse"];

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
  outflow: string;
  inflow: string;
  payer: string;
  payee: string;
  date: string;
  remark: string;
  receipts: ReceiptItem[];
  uploadingAll: boolean;
  submitting: boolean;
  subjectError: string;
  amountError: string;
  dateError: string;
  canAddReceipt: boolean;
}

/** 页面自定义方法. */
interface PageCustom {
  pendingUploads: number;
  getToken(): string;
  clearToken(): void;
  todayStr(): string;
  openPicker(): void;
  onSubjectSelect(e: WechatMiniprogram.CustomEvent): void;
  onSubjectClose(): void;
  onOutflowInput(e: WechatMiniprogram.Input): void;
  onInflowInput(e: WechatMiniprogram.Input): void;
  onPayerInput(e: WechatMiniprogram.Input): void;
  onPayeeInput(e: WechatMiniprogram.Input): void;
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
    outflow: "",
    inflow: "",
    payer: "",
    payee: "",
    date: "",
    remark: "",
    receipts: [],
    uploadingAll: false,
    submitting: false,
    subjectError: "",
    amountError: "",
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

  onOutflowInput(e: WechatMiniprogram.Input) {
    this.setData({ outflow: e.detail.value || "", amountError: "" });
  },

  onInflowInput(e: WechatMiniprogram.Input) {
    this.setData({ inflow: e.detail.value || "", amountError: "" });
  },

  onPayerInput(e: WechatMiniprogram.Input) {
    this.setData({ payer: e.detail.value || "" });
  },

  onPayeeInput(e: WechatMiniprogram.Input) {
    this.setData({ payee: e.detail.value || "" });
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
          return refreshAccessToken().then((newToken) =>
            newToken ? doUploadFile(localPath, newToken) : null,
          );
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
    const outflowNum = parseFloat(this.data.outflow || "0") || 0;
    const inflowNum = parseFloat(this.data.inflow || "0") || 0;
    const subjectError = this.data.subjectId ? "" : "请选择科目分类";
    let amountError = "";
    if (outflowNum <= 0 && inflowNum <= 0) {
      amountError = "流入 / 流出至少填一项且大于 0";
    } else if (outflowNum > 0 && inflowNum > 0) {
      amountError = "流入 / 流出互斥：只能填一项";
    }
    const dateError = this.data.date ? "" : "请选择发生日期";
    const ok = !subjectError && !amountError && !dateError;
    this.setData({ subjectError, amountError, dateError });
    return ok;
  },

  onSubmit() {
    if (this.data.submitting) {
      return;
    }
    if (!this.validate()) {
      return;
    }
    const token = this.getToken();
    if (!token) {
      this.clearToken();
      wx.showToast({ title: "登录已失效", icon: "none" });
      return;
    }
    const outflowNum = parseFloat(this.data.outflow || "0") || 0;
    const inflowNum = parseFloat(this.data.inflow || "0") || 0;
    const receiptUrls = this.data.receipts
      .filter((r) => !!r.url)
      .map((r) => r.url);

    const body: LedgerRecordCreate = {
      project_id: this.data.projectId,
      subject_id: this.data.subjectId,
      date: this.data.date, // YYYY-MM-DD，Pydantic 解析为当日零点
      outflow: outflowNum,
      inflow: inflowNum,
      receipt_urls: receiptUrls.length > 0 ? receiptUrls : undefined,
    };
    if (this.data.payer.trim()) {
      body.payer = this.data.payer.trim();
    }
    if (this.data.payee.trim()) {
      body.payee = this.data.payee.trim();
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