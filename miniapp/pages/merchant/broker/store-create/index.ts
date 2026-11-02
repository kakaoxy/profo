/**
 * 经纪人注册建店（V04 REQ-M05-006 / V02）：创建后 review_status=pending，自动绑定创建人.
 *
 * 页面级状态：进页面先确认登录并加载区域字典（区域只能从系统字典选），
 * 失败可重试；表单区在 state==='form' 时才渲染，避免半残表单被提交。
 */
import type { components } from "../../../../types/api-types";
import { chooseMapLocation } from "../../../../utils/location";
import { describeRequestError } from "../../../../utils/merchant-errors";
import { MP_ICONS } from "../../../../utils/mp-icons";
import { matchDistrict } from "../../../../utils/region";
import { request } from "../../../../utils/request";
import { getCAccessToken } from "../../../../utils/token";

type CompanyOption = components["schemas"]["BrokerCompanyOption"];
type CompanyList = components["schemas"]["BrokerCompanyOptionListResponse"];
type StoreCreateResult = components["schemas"]["MerchantStoreCreateResult"];
type StoreCreatePayload = components["schemas"]["MerchantStoreCreate"];
type DuplicateCheck = components["schemas"]["MerchantDuplicateCheckResponse"];

type PageState = "loading" | "error" | "needLogin" | "form";

/** 查重候选的展示态：匹配维度翻成中文，距离按「米 / 公里」出文案. */
interface DuplicateDisplay {
  id: string;
  store_name: string;
  address: string;
  matchedText: string;
  distanceText: string;
}

/** 查重命中维度（后端 matched_by 传的是 name/address/phone/distance 这类代码）.
 *  distance 不翻成文字，改由 distanceText 用「距离 350 米」表达，避免同句重复. */
const MATCH_LABELS: Record<string, string> = {
  name: "名称",
  address: "地址",
  phone: "电话",
};

function formatMatchedBy(codes: string[]): string {
  const labels = codes.map((code) => MATCH_LABELS[code]).filter(Boolean);
  return labels.length ? labels.join("、") : "信息相近";
}

/** 距离文案统一用「米 / 公里」，不再裸写 m/km. */
function formatDistance(meters: number | null | undefined): string {
  if (meters === null || meters === undefined) {
    return "";
  }
  if (meters < 1000) {
    return `距离 ${Math.round(meters)} 米`;
  }
  return `距离 ${(meters / 1000).toFixed(1)} 公里`;
}

Page({
  data: {
    state: "loading" as PageState,
    errorText: "",
    icons: {
      chevronDown: MP_ICONS.chevronDown,
      check: MP_ICONS.check,
    },
    companyKeyword: "",
    companies: [] as CompanyOption[],
    companyId: "",
    companyName: "",
    storeName: "",
    district: "",
    districtIndex: -1,
    districts: [] as string[],
    businessCircle: "",
    businessCircles: [] as string[],
    businessCircleIndex: -1,
    address: "",
    lng: "",
    lat: "",
    contactName: "",
    contactPhone: "",
    remark: "",
    submitting: false,
    duplicateOpen: false,
    duplicates: [] as DuplicateDisplay[],
    forceReason: "",
  },

  onLoad() {
    void this.loadPage();
  },

  /** 进页面：登录检查 + 区域字典（字典失败可重试，不让人对着空选择器填表）. */
  async loadPage(): Promise<void> {
    if (!getCAccessToken()) {
      this.setData({ state: "needLogin" });
      return;
    }
    this.setData({ state: "loading" });
    try {
      const data = await request<{ items: string[] }>({ url: "/public/merchant/districts" });
      const districts = data.items || [];
      if (!districts.length) {
        this.setData({ state: "error", errorText: "区域列表暂时为空，请稍后重试" });
        return;
      }
      this.setData({ districts, errorText: "", state: "form" });
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 401 || statusCode === 403) {
        this.setData({ state: "needLogin" });
        return;
      }
      this.setData({ state: "error", errorText: describeRequestError(err, "区域列表加载失败") });
    }
  },

  onRetry() {
    void this.loadPage();
  },

  onGoLogin() {
    wx.navigateTo({ url: "/pages/login/index/index" });
  },

  onCompanyKeywordInput(e: WechatMiniprogram.Input) {
    this.setData({ companyKeyword: e.detail.value });
  },

  async searchCompanies(): Promise<void> {
    try {
      const data = await request<CompanyList>({
        url: "/public/merchant/broker-companies",
        data: { keyword: this.data.companyKeyword.trim() || undefined },
      });
      this.setData({ companies: data.items });
    } catch (err) {
      wx.showToast({ title: describeRequestError(err, "公司搜索失败"), icon: "none" });
    }
  },

  onPickCompany(e: WechatMiniprogram.BaseEvent) {
    const id = e.currentTarget.dataset.id as string;
    const company = this.data.companies.find((item) => item.id === id);
    if (company) {
      // 结果列表保留，用激活态标出当前选择，方便随时换一家
      this.setData({ companyId: company.id, companyName: company.company_name });
    }
  },

  onFieldInput(e: WechatMiniprogram.Input) {
    const field = e.currentTarget.dataset.field as string;
    this.setData({ [field]: e.detail.value });
  },

  async onChooseLocation(): Promise<void> {
    const picked = await chooseMapLocation();
    if (!picked) {
      return;
    }
    const district = matchDistrict(picked.address, picked.name, this.data.districts);
    this.setData({
      address: picked.address || this.data.address,
      lng: String(picked.longitude),
      lat: String(picked.latitude),
      ...(district
        ? { district, districtIndex: this.data.districts.indexOf(district), businessCircle: "" }
        : {}),
    });
    if (district) {
      void this.loadBusinessCircles(district);
    } else {
      wx.showToast({ title: "未识别到区域，请手动选择", icon: "none" });
    }
  },

  /** 商圈候选（只能从列表选择；该区域无候选时退回手填，避免建不了店）. */
  async loadBusinessCircles(district: string): Promise<void> {
    if (!district) {
      this.setData({ businessCircles: [], businessCircleIndex: -1 });
      return;
    }
    try {
      const data = await request<{ items: string[] }>({
        url: "/public/merchant/business-circles",
        data: { district },
      });
      this.setData({ businessCircles: data.items || [], businessCircleIndex: -1 });
    } catch (err) {
      wx.showToast({ title: describeRequestError(err, "商圈加载失败"), icon: "none" });
    }
  },

  onSelectDistrict(e: WechatMiniprogram.PickerChange) {
    const index = Number(e.detail.value);
    const district = this.data.districts[index] || "";
    this.setData({ district, districtIndex: index, businessCircle: "", businessCircles: [], businessCircleIndex: -1 });
    void this.loadBusinessCircles(district);
  },

  onSelectBusinessCircle(e: WechatMiniprogram.PickerChange) {
    const index = Number(e.detail.value);
    this.setData({
      businessCircle: this.data.businessCircles[index] || "",
      businessCircleIndex: index,
    });
  },

  onForceReason(e: WechatMiniprogram.Input) {
    this.setData({ forceReason: e.detail.value });
  },

  onCloseDuplicate() {
    this.setData({ duplicateOpen: false });
  },

  onOpenDuplicate() {
    // 候选人选择：提示走后台绑定，避免经纪人重复建店
    wx.showModal({
      title: "疑似已有门店",
      content: "该门店已在系统中，可请邀请员工在后台完成绑定；如需新建，请填写强制新建理由。",
      showCancel: false,
    });
  },

  onForceCreate() {
    if (!this.data.forceReason.trim()) {
      wx.showToast({ title: "请填写强制新建理由", icon: "none" });
      return;
    }
    this.setData({ duplicateOpen: false });
    void this.submit(true);
  },

  async onSubmit(): Promise<void> {
    await this.submit(false);
  },

  async submit(force: boolean): Promise<void> {
    if (!this.data.companyId) {
      wx.showToast({ title: "请选择公司", icon: "none" });
      return;
    }
    if (
      !this.data.storeName.trim() ||
      !this.data.district.trim() ||
      !this.data.businessCircle.trim() ||
      !this.data.address.trim() ||
      !this.data.contactName.trim() ||
      !this.data.contactPhone.trim()
    ) {
      wx.showToast({ title: "请填写完整门店信息", icon: "none" });
      return;
    }
    if (!this.data.lng || !this.data.lat) {
      wx.showToast({ title: "请选择门店位置", icon: "none" });
      return;
    }
    if (!force && !this.data.forceReason.trim()) {
      try {
        const check = await request<DuplicateCheck>({
          url: "/public/merchant/stores/check-duplicates",
          method: "POST",
          data: {
            store_name: this.data.storeName.trim(),
            address: this.data.address.trim(),
            lng: Number(this.data.lng),
            lat: Number(this.data.lat),
            contact_phone: this.data.contactPhone.trim(),
          },
        });
        if (check.candidates && check.candidates.length) {
          this.setData({
            duplicateOpen: true,
            duplicates: check.candidates.map((item) => ({
              id: item.id,
              store_name: item.store_name,
              address: item.address,
              matchedText: formatMatchedBy(item.matched_by),
              distanceText: formatDistance(item.distance_m),
            })),
          });
          return;
        }
      } catch {
        // 查重服务异常不阻断建店（查重未完成由后端复核）
      }
    }

    const payload: StoreCreatePayload = {
      company_id: this.data.companyId,
      store_name: this.data.storeName.trim(),
      district: this.data.district.trim(),
      business_circle: this.data.businessCircle.trim(),
      address: this.data.address.trim(),
      lng: Number(this.data.lng),
      lat: Number(this.data.lat),
      contact_name: this.data.contactName.trim(),
      contact_phone: this.data.contactPhone.trim(),
      cooperation_status: "not_cooperated",
      remark: this.data.remark.trim() || undefined,
      force_create_reason: this.data.forceReason.trim() || null,
    };
    this.setData({ submitting: true });
    try {
      await request<StoreCreateResult>({
        url: "/public/merchant/brokers/me/store",
        method: "POST",
        data: payload,
      });
      wx.showToast({ title: "门店已提交审核", icon: "success" });
      setTimeout(() => wx.navigateBack(), 800);
    } catch (err) {
      wx.showToast({ title: describeRequestError(err, "门店提交失败"), icon: "none" });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
