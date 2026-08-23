/**
 * 单项目销售记录详情页（profile「带看记录」→「我负责的项目」→ 详情）.
 *
 * 功能对等后台 MobileSellingView：KPI（挂牌天数 + 带看/出价/面谈计数）+
 * Tab 切换 + 记录列表（按 record_date 倒序）+ 新增记录（底部表单，日期时间精确到时分，
 * 默认填当前日期时间）+ 删除记录（二次确认）.
 * 仅内部员工（admin 令牌）可访问；401 → 清令牌提示登录失效；403 → 无权限态.
 */
import type { components } from "../../../../types/api-types";
import { request } from "../../../../utils/request";
import { getAccessToken } from "../../../../utils/token";
import { pad2 } from "../../../../utils/format";
import { parseSalesRecords } from "../../../../utils/sales-records";

type SalesRecordResponse = components["schemas"]["SalesRecordResponse"];
type ProjectResponse = components["schemas"]["ProjectResponse"];
type RecordType = components["schemas"]["RecordType"];

type TabType = "viewing" | "offer" | "negotiation";

/** 当前 Tab 中文标签（表单标题 / 空态文案）. */
const TAB_LABEL: Record<TabType, string> = {
  viewing: "带看",
  offer: "出价",
  negotiation: "面谈",
};

/** 人员字段 label（按 Tab 切换）. */
const PERSON_LABEL: Record<TabType, string> = {
  viewing: "带看人/机构",
  offer: "出价人",
  negotiation: "面谈对象",
};

/** 新增记录 endpoint 后缀（保持于 Base /projects/{id}/selling 下）. */
const ADD_PATH: Record<TabType, string> = {
  viewing: "/selling/viewings",
  offer: "/selling/offers",
  negotiation: "/selling/negotiations",
};

/** 带看列表项展示结构. */
interface DisplayViewing {
  id: string;
  name: string;
  date: string;
}

/** 出价列表项展示结构（含最高价标记）. */
interface DisplayOffer {
  id: string;
  price: string;
  isMax: boolean;
  name: string;
  date: string;
}

/** 面谈列表项展示结构（含纪要）. */
interface DisplayNegotiation {
  id: string;
  name: string;
  date: string;
  notes: string;
}

/** 页面 data. */
interface PageData {
  state: "loading" | "error" | "needLogin" | "noPermission" | "ready";
  projectName: string;
  listingDaysText: string;
  viewingCount: number;
  offerCount: number;
  negotiationCount: number;
  activeTab: TabType;
  viewings: DisplayViewing[];
  offers: DisplayOffer[];
  negotiations: DisplayNegotiation[];
  canAdd: boolean;
  formOpen: boolean;
  submitting: boolean;
  deleting: boolean;
  formDate: string;
  formTime: string;
  formPerson: string;
  formPrice: string;
  formNotes: string;
  personLabel: string;
  formTitle: string;
}

/** 页面自定义方法. */
interface PageCustom {
  projectId: string;
  getToken(): string;
  clearToken(): void;
  loadProject(): void;
  parseRecords(project: ProjectResponse): SalesRecordResponse[];
  sortByDateDesc(list: SalesRecordResponse[]): SalesRecordResponse[];
  formatShort(iso: string): string;
  formatFull(iso: string): string;
  today(): string;
  nowTime(): string;
  applyProject(project: ProjectResponse): void;
  doDelete(recordId: string): void;
  onTabTap(e: WechatMiniprogram.BaseEvent): void;
  onAddTap(): void;
  onFormCancel(): void;
  onDateChange(e: WechatMiniprogram.PickerChange): void;
  onTimeChange(e: WechatMiniprogram.PickerChange): void;
  onPersonInput(e: WechatMiniprogram.Input): void;
  onPriceInput(e: WechatMiniprogram.Input): void;
  onNotesInput(e: WechatMiniprogram.Input): void;
  onFormConfirm(): void;
  onDelete(e: WechatMiniprogram.BaseEvent): void;
  onRetry(): void;
  onGoBack(): void;
}

/** 挂牌天数文案：无/非法上架日期返回「未挂牌」，否则「挂牌N天」. */
function getListingDaysText(listingDate: string | null | undefined): string {
  if (!listingDate) {
    return "未挂牌";
  }
  const d = new Date(listingDate);
  if (Number.isNaN(d.getTime())) {
    return "未挂牌";
  }
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  return `挂牌${days}天`;
}

Page<PageData, PageCustom>({
  projectId: "",

  data: {
    state: "loading",
    projectName: "项目详情",
    listingDaysText: "未挂牌",
    viewingCount: 0,
    offerCount: 0,
    negotiationCount: 0,
    activeTab: "viewing",
    viewings: [],
    offers: [],
    negotiations: [],
    canAdd: false,
    formOpen: false,
    submitting: false,
    deleting: false,
    formDate: "",
    formTime: "",
    formPerson: "",
    formPrice: "",
    formNotes: "",
    personLabel: PERSON_LABEL.viewing,
    formTitle: `新增${TAB_LABEL.viewing}记录`,
  },

  getToken() {
    return getAccessToken();
  },

  clearToken() {
    wx.removeStorageSync("access_token");
    wx.removeStorageSync("refresh_token");
  },

  onLoad(query) {
    this.projectId = (query.id as string) || "";
    const name = (query.name as string) || "";
    this.setData({
      projectName: name ? decodeURIComponent(name) : "项目详情",
      formDate: this.today(),
      formTime: this.nowTime(),
    });
    this.loadProject();
  },

  today(): string {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  },

  nowTime(): string {
    const d = new Date();
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  },

  parseRecords(project: ProjectResponse): SalesRecordResponse[] {
    return parseSalesRecords(project.sales_records);
  },

  sortByDateDesc(list: SalesRecordResponse[]): SalesRecordResponse[] {
    return [...list].sort(
      (a, b) =>
        new Date(b.record_date).getTime() - new Date(a.record_date).getTime(),
    );
  },

  formatShort(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) {
      return "—";
    }
    return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  },

  formatFull(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) {
      return "—";
    }
    return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  },

  applyProject(project: ProjectResponse) {
    const records = this.parseRecords(project);
    const viewings = this.sortByDateDesc(
      records.filter((r) => r.record_type === "viewing"),
    );
    const offers = this.sortByDateDesc(
      records.filter((r) => r.record_type === "offer"),
    );
    const negotiations = this.sortByDateDesc(
      records.filter((r) => r.record_type === "negotiation"),
    );

    const prices = offers
      .map((r) => Number(r.price))
      .filter((p) => !Number.isNaN(p));
    const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;

    const canEditSales = project.sale?.can_edit_sales === true;
    this.setData({
      state: "ready",
      projectName: project.community_name ?? project.name ?? "项目详情",
      listingDaysText: getListingDaysText(project.listing_date),
      viewingCount: viewings.length,
      offerCount: offers.length,
      negotiationCount: negotiations.length,
      viewings: viewings.map((r) => ({
        id: r.id,
        name: r.customer_name || "-",
        date: this.formatShort(r.record_date),
      })),
      offers: offers.map((r) => {
        const numPrice = Number(r.price);
        const isMax = !Number.isNaN(numPrice) && numPrice === maxPrice && numPrice > 0;
        return {
          id: r.id,
          price: r.price ?? "-",
          isMax,
          name: r.customer_name || "-",
          date: this.formatShort(r.record_date),
        };
      }),
      negotiations: negotiations.map((r) => ({
        id: r.id,
        name: r.customer_name || "-",
        date: this.formatFull(r.record_date),
        notes: r.notes || "",
      })),
      canAdd: project.status === "selling" && canEditSales,
    });
  },

  loadProject() {
    const token = this.getToken();
    if (!token) {
      this.setData({ state: "needLogin" });
      return;
    }
    this.setData({ state: "loading" });
    request<ProjectResponse>({
      url: `/projects/${this.projectId}`,
      header: { Authorization: `Bearer ${token}` },
    })
      .then((project) => this.applyProject(project))
      .catch((err) => {
        const statusCode = (err as { statusCode?: number } | undefined)?.statusCode;
        if (statusCode === 401) {
          this.clearToken();
          this.setData({ state: "needLogin" });
        } else if (statusCode === 403) {
          this.setData({ state: "noPermission" });
        } else {
          this.setData({ state: "error" });
        }
      });
  },

  onTabTap(e: WechatMiniprogram.BaseEvent) {
    const tab = e.currentTarget.dataset.tab as TabType;
    this.setData({
      activeTab: tab,
      personLabel: PERSON_LABEL[tab],
      formTitle: `新增${TAB_LABEL[tab]}记录`,
    });
  },

  onAddTap() {
    this.setData({
      formOpen: true,
      formDate: this.today(),
      formTime: this.nowTime(),
      formPerson: "",
      formPrice: "",
      formNotes: "",
    });
  },

  onFormCancel() {
    this.setData({ formOpen: false });
  },

  onDateChange(e: WechatMiniprogram.PickerChange) {
    this.setData({ formDate: e.detail.value as string });
  },

  onTimeChange(e: WechatMiniprogram.PickerChange) {
    this.setData({ formTime: e.detail.value as string });
  },

  onPersonInput(e: WechatMiniprogram.Input) {
    this.setData({ formPerson: e.detail.value });
  },

  onPriceInput(e: WechatMiniprogram.Input) {
    this.setData({ formPrice: e.detail.value });
  },

  onNotesInput(e: WechatMiniprogram.Input) {
    this.setData({ formNotes: e.detail.value });
  },

  async onFormConfirm() {
    if (this.data.submitting) {
      return;
    }
    const token = this.getToken();
    if (!token) {
      this.setData({ state: "needLogin" });
      return;
    }
    const person = this.data.formPerson.trim();
    if (!this.data.formDate || !this.data.formTime || !person) {
      wx.showToast({ title: "请填写日期时间和人员", icon: "none" });
      return;
    }
    if (this.data.activeTab === "offer") {
      const priceNum = Number(this.data.formPrice);
      if (!this.data.formPrice || !priceNum || priceNum <= 0) {
        wx.showToast({ title: "请输入有效的出价金额", icon: "none" });
        return;
      }
    }
    const type = this.data.activeTab;
    this.setData({ submitting: true });
    try {
      const body: components["schemas"]["SalesRecordCreate"] = {
        record_type: type as RecordType,
        customer_name: person,
        record_date: `${this.data.formDate}T${this.data.formTime}:00`,
        price:
          type === "offer" ? Number(this.data.formPrice) : undefined,
        notes: type === "negotiation" ? this.data.formNotes : undefined,
      };
      await request<SalesRecordResponse>({
        url: `/projects/${this.projectId}${ADD_PATH[type]}`,
        method: "POST",
        data: body,
        header: { Authorization: `Bearer ${token}` },
      });
      this.setData({ formOpen: false });
      wx.showToast({ title: "记录已添加", icon: "success" });
      // 静默刷新列表（保留当前 Tab）
      this.loadProject();
    } catch (err) {
      const statusCode = (err as { statusCode?: number } | undefined)?.statusCode;
      if (statusCode === 401) {
        this.clearToken();
        this.setData({ state: "needLogin" });
      } else if (statusCode === 403) {
        this.setData({ state: "noPermission" });
      } else {
        const msg = (err as { body?: { message?: string } } | undefined)?.body?.message;
        wx.showToast({ title: msg || "添加失败，请重试", icon: "none" });
      }
    } finally {
      this.setData({ submitting: false });
    }
  },

  onDelete(e: WechatMiniprogram.BaseEvent) {
    const id = e.currentTarget.dataset.id as string;
    wx.showModal({
      title: "删除记录",
      content: "确定删除这条记录吗？",
      confirmColor: "#5d2a1a",
      success: (res) => {
        if (res.confirm) {
          this.doDelete(id);
        }
      },
    });
  },

  async doDelete(recordId: string) {
    if (this.data.deleting) {
      return;
    }
    const token = this.getToken();
    if (!token) {
      this.setData({ state: "needLogin" });
      return;
    }
    this.setData({ deleting: true });
    try {
      await request<void>({
        url: `/projects/${this.projectId}/selling/records/${recordId}`,
        method: "DELETE",
        header: { Authorization: `Bearer ${token}` },
      });
      wx.showToast({ title: "删除成功", icon: "success" });
      this.loadProject();
    } catch (err) {
      const statusCode = (err as { statusCode?: number } | undefined)?.statusCode;
      if (statusCode === 401) {
        this.clearToken();
        this.setData({ state: "needLogin" });
      } else if (statusCode === 403) {
        this.setData({ state: "noPermission" });
      } else {
        const msg = (err as { body?: { message?: string } } | undefined)?.body?.message;
        wx.showToast({ title: msg || "删除失败，请重试", icon: "none" });
      }
    } finally {
      this.setData({ deleting: false });
    }
  },

  onRetry() {
    this.loadProject();
  },

  onGoBack() {
    wx.navigateBack({ delta: 1 });
  },
});