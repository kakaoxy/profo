/**
 * ② 项目账目清单页（①项目列表 → 本页）.
 *
 * 展示选中项目账目作为记账入口：
 * - p_load 解析 query 存项目上下文（id/name/community_name/business_form），
 *   onShow 请求 GET /admin/ledger/{id}，记账返回后自动刷新；
 * - 汇总卡（流入红/流出绿/净现金流正负着色/ROI 百分比/持有天数）+ 流水明细；
 * - 「缺凭证」标签可点击：wx.chooseMedia 选图 → wx.uploadFile 上传 →
 *   PATCH /admin/ledger/{record_id} { receipt_urls }（Service 端追加去重合并），
 *   成功后刷新列表；401 刷新令牌重试一次；
 * - 401 清后台令牌切「登录已失效」；403 → 无权限态不清令牌；
 * - 底部固定「记一笔」/空态「记第一笔」跳③并携带同一组 query。
 */
import type { components } from "../../../../types/api-types";
import { request, refreshAccessToken } from "../../../../utils/request";
import { getAccessToken } from "../../../../utils/token";
import { resolveAssetUrl } from "../../../../utils/url";
import { BASE_URL } from "../../../../utils/config";
import { pad2 } from "../../../../utils/format";

type CashFlowResponse = components["schemas"]["CashFlowResponse"];
type CashFlowRecordResponse = components["schemas"]["CashFlowRecordResponse"];
type FileUploadResponse = components["schemas"]["FileUploadResponse"];
type SubjectLevel = components["schemas"]["SubjectLevel"];
type BusinessForm = components["schemas"]["BusinessForm"];

/** 页状态机. */
type PageState = "loading" | "items" | "empty" | "error" | "needLogin" | "noPermission";

/** 汇总卡展示结构. */
interface SummaryDisplay {
  totalIncome: string;
  totalExpense: string;
  netFlow: string;
  /** 净现金流正负：true=正(红) / false=负(绿). */
  netPositive: boolean;
  roiText: string;
  holdingText: string;
}

/** 流水展示项. */
interface RecordItem {
  id: string;
  dateText: string;
  hasSubject: boolean;
  subjectLevel: string;
  subjectName: string;
  flowText: string;
  showFlow: boolean;
  amountText: string;
  /** 金额样式态：out=流出(绿) / in=流入(红) / zero=「—」. */
  amountKind: "out" | "in" | "zero";
  hasTicket: boolean;
  ticketCount: number;
  ticketThumb: string;
  /** 全部票据 URL（已 resolve），用于预览. */
  ticketUrls: string[];
}

/** 「缺凭证」补传单次最多张数. */
const SUPPLEMENT_MAX = 9;

/** wx.uploadFile 单次上传结果. */
interface UploadResult {
  statusCode: number;
  data: string;
}

/** 页面 data. */
interface PageData {
  state: PageState;
  projectId: string;
  projectName: string;
  communityName: string;
  businessForm: BusinessForm | null;
  summary: SummaryDisplay | null;
  records: RecordItem[];
  recordCount: number;
  /** 补凭证中（该行标签显示「上传中…」）. */
  supplementingId: string;
}

/** 页面自定义方法. */
interface PageCustom {
  inFlight: boolean;
  getToken(): string;
  clearToken(): void;
  buildSummary(cf: CashFlowResponse): SummaryDisplay;
  buildRecords(cf: CashFlowResponse): RecordItem[];
  apply(cf: CashFlowResponse): void;
  loadDetail(): void;
  onGoRecord(): void;
  onPreviewTicket(e: WechatMiniprogram.TouchEvent): void;
  onSupplementTap(e: WechatMiniprogram.TouchEvent): void;
  doSupplementUpload(filePath: string, token: string): Promise<UploadResult>;
  supplementRecord(recordId: string, urls: string[]): void;
  onRetry(): void;
  onGoLogin(): void;
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

/** 金额展示：千位分隔 + 最多两位小数（小数位为 0 时不显示）. */
function formatMoney(n: number): string {
  if (!Number.isFinite(n)) {
    return "0";
  }
  const neg = n < 0;
  const abs = Math.abs(n);
  const [intStr, decStr] = abs.toFixed(2).split(".");
  const grouped = Number(intStr).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const dec = decStr === "00" ? "" : `.${decStr}`;
  return `${neg ? "-" : ""}${grouped}${dec}`;
}

/** ROI 百分比展示：去尾零（如 12.5 → "12.5%"，20 → "20%"）. */
function formatRoi(roi: number): string {
  if (!Number.isFinite(roi)) {
    return "0%";
  }
  const v = Math.round(roi * 10) / 10;
  return `${v}%`;
}

/** ISO 日期 → YYYY-MM-DD；无/非法返回空串. */
function formatDate(iso: string): string {
  if (!iso) {
    return "";
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

Page<PageData, PageCustom>({
  inFlight: false,

  data: {
    state: "loading",
    projectId: "",
    projectName: "",
    communityName: "",
    businessForm: null,
    summary: null,
    records: [],
    recordCount: 0,
    supplementingId: "",
  },

  getToken() {
    return getAccessToken();
  },

  clearToken() {
    // 401 仅清后台令牌；C 端令牌由独立生命周期管理
    wx.removeStorageSync("access_token");
    wx.removeStorageSync("refresh_token");
  },

  onLoad(query) {
    const projectId = (query.id as string) || "";
    const name = (query.name as string) || "";
    const communityName = (query.community_name as string) || "";
    const businessFormStr = (query.business_form as string) || "";
    const businessForm: BusinessForm | null =
      businessFormStr === "agent" || businessFormStr === "wholesale" ? businessFormStr : null;
    const decodedName = name ? decodeURIComponent(name) : "";
    const decodedCommunity = communityName ? decodeURIComponent(communityName) : "";
    this.setData({
      projectId,
      projectName: decodedName,
      communityName: decodedCommunity,
      businessForm,
    });
    // 导航副标题显示「项目名 · 小区名」（query 传入）
    if (decodedName || decodedCommunity) {
      wx.setNavigationBarTitle({ title: [decodedName, decodedCommunity].filter(Boolean).join(" · ") });
    }
  },

  onShow() {
    // 记账后返回本页时 onShow 重新拉取账目（新流水出现在列表）
    this.loadDetail();
  },

  buildSummary(cf: CashFlowResponse): SummaryDisplay {
    const s = cf.summary;
    const totalIncome = s.total_income ?? 0;
    const totalExpense = s.total_expense ?? 0;
    const netFlow = s.net_cash_flow ?? 0;
    const roi = s.roi ?? 0;
    const holdingDays = s.holding_days ?? 0;
    return {
      totalIncome: `¥${formatMoney(totalIncome)}`,
      totalExpense: `¥${formatMoney(totalExpense)}`,
      netFlow: `¥${formatMoney(netFlow)}`,
      netPositive: netFlow >= 0,
      roiText: formatRoi(roi),
      holdingText: `持有 ${holdingDays} 天`,
    };
  },

  buildRecords(cf: CashFlowResponse): RecordItem[] {
    return (cf.records ?? []).map((r: CashFlowRecordResponse) => {
      const outflow = r.outflow ?? 0;
      const inflow = r.inflow ?? 0;
      const subject = r.subject ?? null;
      const payer = r.payer || "";
      const payee = r.payee || "";
      const remark = r.remark || "";

      // 科目：有则徽章(level)+名称；无则「—」
      const hasSubject = !!subject && !!subject.name;
      const subjectLevel: SubjectLevel = hasSubject ? subject.level : ("1" as SubjectLevel);
      const subjectName = hasSubject ? subject.name : "—";

      // 付款方 → 收款方 + 备注摘要；均空则不显示该行
      const parts: string[] = [];
      if (payer && payee) {
        parts.push(`${payer} → ${payee}`);
      } else if (payer) {
        parts.push(payer);
      } else if (payee) {
        parts.push(payee);
      }
      if (remark) {
        parts.push(remark);
      }
      const flowText = parts.join(" · ");

      // 金额列：流出>0 显示 −¥绿；流入>0 显示 +¥红；双零「—」
      let amountText = "—";
      let amountKind: RecordItem["amountKind"] = "zero";
      if (outflow > 0) {
        amountText = `−¥${formatMoney(outflow)}`;
        amountKind = "out";
      } else if (inflow > 0) {
        amountText = `+¥${formatMoney(inflow)}`;
        amountKind = "in";
      }

      const receiptUrls: string[] = r.receipt_urls ?? [];
      const hasTicket = receiptUrls.length > 0;

      return {
        id: r.id,
        dateText: formatDate(r.record_date),
        hasSubject,
        subjectLevel,
        subjectName,
        flowText,
        showFlow: flowText.length > 0,
        amountText,
        amountKind,
        hasTicket,
        ticketCount: receiptUrls.length,
        ticketThumb: hasTicket ? resolveAssetUrl(receiptUrls[0]) : "",
        ticketUrls: receiptUrls.map((u) => resolveAssetUrl(u)),
      };
    });
  },

  apply(cf: CashFlowResponse) {
    const records = this.buildRecords(cf);
    this.setData({
      state: records.length > 0 ? "items" : "empty",
      summary: this.buildSummary(cf),
      records,
      recordCount: records.length,
    });
  },

  async loadDetail() {
    if (this.inFlight) {
      return;
    }
    const token = this.getToken();
    if (!token) {
      this.setData({ state: "needLogin", records: [] });
      return;
    }
    this.inFlight = true;
    this.setData({ state: "loading", records: [] });
    try {
      const cf = await request<CashFlowResponse>({
        url: `/admin/ledger/${this.data.projectId}`,
        header: { Authorization: `Bearer ${token}` },
      });
      this.apply(cf);
    } catch (err) {
      const statusCode = (err as { statusCode?: number } | undefined)?.statusCode;
      if (statusCode === 401) {
        this.clearToken();
        this.setData({ state: "needLogin", records: [] });
      } else if (statusCode === 403) {
        this.setData({ state: "noPermission", records: [] });
      } else {
        this.setData({ state: "error", records: [] });
      }
    } finally {
      this.inFlight = false;
    }
  },

  onGoRecord() {
    const { projectId, projectName, communityName, businessForm } = this.data;
    wx.navigateTo({
      url:
        `/pages/ledger/record/index/index?` +
        `id=${encodeURIComponent(projectId)}&name=${encodeURIComponent(projectName)}` +
        `&community_name=${encodeURIComponent(communityName)}` +
        `&business_form=${businessForm ? encodeURIComponent(businessForm) : ""}`,
    });
  },

  onPreviewTicket(e: WechatMiniprogram.TouchEvent) {
    const index = Number((e.currentTarget.dataset.index as string) ?? "");
    const record = this.data.records[index];
    if (!record || record.ticketUrls.length === 0) {
      return;
    }
    // 原生图片预览：全屏 + 左右滑动切换 + 双指缩放
    wx.previewImage({
      current: record.ticketUrls[0],
      urls: record.ticketUrls,
    });
  },

  /** 点击「缺凭证」标签：选图后逐张上传，再 PATCH 补凭证. */
  onSupplementTap(e: WechatMiniprogram.TouchEvent) {
    const recordId = (e.currentTarget.dataset.id as string) || "";
    if (!recordId || this.data.supplementingId) {
      return;
    }
    const token = this.getToken();
    if (!token) {
      this.clearToken();
      wx.showToast({ title: "登录已失效", icon: "none" });
      return;
    }
    wx.chooseMedia({
      count: SUPPLEMENT_MAX,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      success: (res) => {
        const paths = res.tempFiles.map((f) => f.tempFilePath).filter(Boolean);
        if (paths.length === 0) {
          return;
        }
        this.supplementRecord(recordId, paths);
      },
    });
  },

  /** 上传单张（401 刷新令牌重试一次，与记账页 uploadReceipt 同模式）. */
  doSupplementUpload(filePath: string, token: string): Promise<UploadResult> {
    return doUploadFile(filePath, token).then((res) => {
      if (res.statusCode !== 401) {
        return res;
      }
      return refreshAccessToken().then((newToken) => {
        if (newToken) {
          return doUploadFile(filePath, newToken);
        }
        this.clearToken();
        wx.showToast({ title: "登录已失效，请重新登录", icon: "none" });
        throw new Error("unauthorized");
      });
    });
  },

  /** 逐张上传 → PATCH /admin/ledger/{id} 追加凭证 → 刷新列表. */
  supplementRecord(recordId: string, localPaths: string[]) {
    const token = this.getToken();
    if (!token) {
      this.clearToken();
      wx.showToast({ title: "登录已失效", icon: "none" });
      return;
    }
    this.setData({ supplementingId: recordId });
    Promise.all(localPaths.map((p) => this.doSupplementUpload(p, token)))
      .then((results) => {
        const urls: string[] = [];
        for (const res of results) {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            throw new Error(res.data);
          }
          const file = JSON.parse(res.data) as FileUploadResponse;
          if (!file.url) {
            throw new Error("upload response missing url");
          }
          urls.push(file.url);
        }
        if (urls.length === 0) {
          throw new Error("no receipts");
        }
        return request<CashFlowRecordResponse>({
          url: `/admin/ledger/${recordId}`,
          // 后端同时暴露 PATCH 与 POST（POST 别名供小程序端，见 routers/finance/ledger.py）
          method: "POST",
          data: { receipt_urls: urls },
          header: { Authorization: `Bearer ${token}` },
        });
      })
      .then(() => {
        wx.showToast({ title: "凭证已补充", icon: "success" });
        this.setData({ supplementingId: "" });
        this.loadDetail();
      })
      .catch((err) => {
        const statusCode = (err as { statusCode?: number } | undefined)?.statusCode;
        if (statusCode === 401) {
          this.clearToken();
          wx.showToast({ title: "登录已失效，请重新登录", icon: "none" });
        } else if ((err as Error)?.message !== "unauthorized") {
          wx.showToast({ title: "补充凭证失败，请重试", icon: "none" });
        }
        this.setData({ supplementingId: "" });
      });
  },

  onRetry() {
    this.loadDetail();
  },

  onGoLogin() {
    wx.navigateBack({ delta: 1 });
  },
});