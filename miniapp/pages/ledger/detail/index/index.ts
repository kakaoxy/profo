/**
 * ② 项目账目清单页（①项目列表 → 本页）.
 *
 * 展示选中项目账目作为记账入口：
 * - p_load 解析 query 存项目上下文（id/name/community_name/business_form），
 *   onShow 请求 GET /admin/ledger/{id}，记账返回后自动刷新；
 * - 汇总卡（流入红/流出绿/净现金流正负着色/ROI 百分比/持有天数）+ 流水明细；
 * - 401 清后台令牌切「登录已失效」；403 → 无权限态不清令牌；
 * - 底部固定「记一笔」/空态「记第一笔」跳③并携带同一组 query。
 */
import type { components } from "../../../../types/api-types";
import { request } from "../../../../utils/request";
import { getAccessToken } from "../../../../utils/token";
import { resolveAssetUrl } from "../../../../utils/url";
import { pad2 } from "../../../../utils/format";

type CashFlowResponse = components["schemas"]["CashFlowResponse"];
type CashFlowRecordResponse = components["schemas"]["CashFlowRecordResponse"];
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
  onRetry(): void;
  onGoLogin(): void;
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

  onRetry() {
    this.loadDetail();
  },

  onGoLogin() {
    wx.navigateBack({ delta: 1 });
  },
});