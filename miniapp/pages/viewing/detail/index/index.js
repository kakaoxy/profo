import { request } from "../../../../utils/request";

/**
 * 单项目销售记录详情页（profile「带看记录」→「我负责的项目」→ 详情）.
 *
 * 功能对等后台 MobileSellingView：KPI（挂牌天数 + 带看/出价/面谈计数）+
 * Tab 切换 + 记录列表（按 record_date 倒序）+ 新增记录（底部表单）+ 删除记录（二次确认）.
 * 仅内部员工（admin 令牌）可访问；401 → 清令牌提示登录失效；403 → 无权限态.
 */

/** 当前 Tab 中文标签（表单标题 / 空态文案）. */
const TAB_LABEL = {
  viewing: "带看",
  offer: "出价",
  negotiation: "面谈",
};

/** 人员字段 label（按 Tab 切换）. */
const PERSON_LABEL = {
  viewing: "带看人/机构",
  offer: "出价人",
  negotiation: "面谈对象",
};

/** 新增记录 endpoint 后缀（保持于 Base /projects/{id}/selling 下）. */
const ADD_PATH = {
  viewing: "/selling/viewings",
  offer: "/selling/offers",
  negotiation: "/selling/negotiations",
};

/** 两位补零. */
function pad2(n) {
  return String(n).padStart(2, "0");
}

/** 挂牌天数文案：无/非法上架日期返回「未挂牌」，否则「挂牌N天」. */
function getListingDaysText(listingDate) {
  if (!listingDate) {
    return "未挂牌";
  }
  const d = new Date(listingDate);
  if (isNaN(d.getTime())) {
    return "未挂牌";
  }
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  return "挂牌" + days + "天";
}

/** 仅当值为 string 时返回，否则 undefined（兜底非法/缺失字段）. */
function str(v) {
  return typeof v === "string" ? v : undefined;
}

/**
 * 将松类型 sales_records 收窄/兜底为完整记录.
 * 对齐 TS 版 parseSalesRecords（utils/sales-records.ts，无对应 .js，故内联）：
 * 非数组视为空、跳过非对象项、缺失 record_type 按 "viewing" 兜底、price 统一转字符串.
 */
function parseSalesRecords(records) {
  if (!Array.isArray(records)) {
    return [];
  }
  return records
    .filter((r) => r && typeof r === "object")
    .map((r) => ({
      id: str(r.id) ?? "",
      project_id: str(r.project_id) ?? "",
      record_type: str(r.record_type) ?? "viewing",
      customer_name: str(r.customer_name),
      customer_phone: str(r.customer_phone),
      customer_info: r.customer_info ?? undefined,
      record_date: str(r.record_date) ?? "",
      record_time: str(r.record_time),
      price: r.price != null ? String(r.price) : undefined,
      notes: str(r.notes),
      feedback: str(r.feedback),
      result: str(r.result),
      related_agent: str(r.related_agent),
      created_at: str(r.created_at) ?? "",
      operator: r.operator ?? undefined,
    }));
}

Page({
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
    formPerson: "",
    formPrice: "",
    formNotes: "",
    personLabel: PERSON_LABEL.viewing,
    formTitle: "新增" + TAB_LABEL.viewing + "记录",
  },

  getToken() {
    return wx.getStorageSync("access_token");
  },

  clearToken() {
    wx.removeStorageSync("access_token");
    wx.removeStorageSync("refresh_token");
  },

  onLoad(query) {
    this.projectId = (query.id || "");
    const name = query.name || "";
    this.setData({
      projectName: name ? decodeURIComponent(name) : "项目详情",
      formDate: this.today(),
    });
    this.loadProject();
  },

  today() {
    const d = new Date();
    return (
      d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate())
    );
  },

  parseRecords(project) {
    return parseSalesRecords(project.sales_records);
  },

  sortByDateDesc(list) {
    return list.slice().sort(
      (a, b) =>
        new Date(b.record_date).getTime() - new Date(a.record_date).getTime(),
    );
  },

  formatShort(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) {
      return "—";
    }
    return (
      pad2(d.getMonth() + 1) +
      "-" +
      pad2(d.getDate()) +
      " " +
      pad2(d.getHours()) +
      ":" +
      pad2(d.getMinutes())
    );
  },

  formatFull(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) {
      return "—";
    }
    return (
      d.getFullYear() +
      "/" +
      pad2(d.getMonth() + 1) +
      "/" +
      pad2(d.getDate()) +
      " " +
      pad2(d.getHours()) +
      ":" +
      pad2(d.getMinutes())
    );
  },

  applyProject(project) {
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
      .filter((p) => !isNaN(p));
    const maxPrice = prices.length > 0 ? Math.max.apply(Math, prices) : 0;

    const canEditSales = project.sale && project.sale.can_edit_sales === true;
    this.setData({
      state: "ready",
      projectName: project.community_name || project.name || "项目详情",
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
        const isMax = !isNaN(numPrice) && numPrice === maxPrice && numPrice > 0;
        return {
          id: r.id,
          price: r.price || "-",
          isMax: isMax,
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
    request({
      url: "/projects/" + this.projectId,
      header: { Authorization: "Bearer " + token },
    })
      .then((project) => this.applyProject(project))
      .catch((err) => {
        const statusCode = err && err.statusCode;
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

  onTabTap(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({
      activeTab: tab,
      personLabel: PERSON_LABEL[tab],
      formTitle: "新增" + TAB_LABEL[tab] + "记录",
    });
  },

  onAddTap() {
    this.setData({
      formOpen: true,
      formDate: this.today(),
      formPerson: "",
      formPrice: "",
      formNotes: "",
    });
  },

  onFormCancel() {
    this.setData({ formOpen: false });
  },

  onDateChange(e) {
    this.setData({ formDate: e.detail.value });
  },

  onPersonInput(e) {
    this.setData({ formPerson: e.detail.value });
  },

  onPriceInput(e) {
    this.setData({ formPrice: e.detail.value });
  },

  onNotesInput(e) {
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
    const person = (this.data.formPerson || "").trim();
    if (!this.data.formDate || !person) {
      wx.showToast({ title: "请填写日期和人员", icon: "none" });
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
    const body = {
      record_type: type,
      customer_name: person,
      record_date: this.data.formDate + "T23:59:59",
      price: type === "offer" ? Number(this.data.formPrice) : undefined,
      notes: type === "negotiation" ? this.data.formNotes : undefined,
    };
    this.setData({ submitting: true });
    try {
      await request({
        url: "/projects/" + this.projectId + ADD_PATH[type],
        method: "POST",
        data: body,
        header: { Authorization: "Bearer " + token },
      });
      this.setData({ formOpen: false });
      wx.showToast({ title: "记录已添加", icon: "success" });
      // 静默刷新列表（保留当前 Tab）
      this.loadProject();
    } catch (err) {
      const statusCode = err && err.statusCode;
      if (statusCode === 401) {
        this.clearToken();
        this.setData({ state: "needLogin" });
      } else if (statusCode === 403) {
        this.setData({ state: "noPermission" });
      } else {
        const msg = (err && err.body && err.body.message) || "";
        wx.showToast({ title: msg || "添加失败，请重试", icon: "none" });
      }
    } finally {
      this.setData({ submitting: false });
    }
  },

  onDelete(e) {
    const id = e.currentTarget.dataset.id;
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

  async doDelete(recordId) {
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
      await request({
        url:
          "/projects/" +
          this.projectId +
          "/selling/records/" +
          recordId,
        method: "DELETE",
        header: { Authorization: "Bearer " + token },
      });
      wx.showToast({ title: "删除成功", icon: "success" });
      this.loadProject();
    } catch (err) {
      const statusCode = err && err.statusCode;
      if (statusCode === 401) {
        this.clearToken();
        this.setData({ state: "needLogin" });
      } else if (statusCode === 403) {
        this.setData({ state: "noPermission" });
      } else {
        const msg = (err && err.body && err.body.message) || "";
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