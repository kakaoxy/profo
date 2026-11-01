/**
 * 经纪人注册建店（V04 REQ-M05-006 / V02）：创建后 review_status=pending，自动绑定创建人.
 */
import type { components } from "../../../../types/api-types";
import { request } from "../../../../utils/request";

type CompanyOption = components["schemas"]["BrokerCompanyOption"];
type CompanyList = components["schemas"]["BrokerCompanyOptionListResponse"];
type StoreCreateResult = components["schemas"]["MerchantStoreCreateResult"];
type StoreCreatePayload = components["schemas"]["MerchantStoreCreate"];
type DuplicateCheck = components["schemas"]["MerchantDuplicateCheckResponse"];

function errMessage(err: unknown): string {
  return (err as { body?: { message?: string } }).body?.message || "操作失败，请重试";
}

Page({
  data: {
    companyKeyword: "",
    companies: [] as CompanyOption[],
    companyId: "",
    companyName: "",
    storeName: "",
    province: "上海市",
    city: "上海市",
    district: "",
    businessCircle: "",
    address: "",
    lng: "",
    lat: "",
    contactName: "",
    contactPhone: "",
    remark: "",
    submitting: false,
    duplicateOpen: false,
    duplicates: [] as Array<{ id: string; store_name: string; address: string; matchedText: string; distance_m?: number | null }>,
    forceReason: "",
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
      wx.showToast({ title: errMessage(err), icon: "none" });
    }
  },

  onPickCompany(e: WechatMiniprogram.BaseEvent) {
    const id = e.currentTarget.dataset.id as string;
    const company = this.data.companies.find((item) => item.id === id);
    if (company) {
      this.setData({ companyId: company.id, companyName: company.company_name, companies: [] });
    }
  },

  onFieldInput(e: WechatMiniprogram.Input) {
    const field = e.currentTarget.dataset.field as string;
    this.setData({ [field]: e.detail.value });
  },

  onChooseLocation() {
    wx.chooseLocation({
      success: (res) => {
        this.setData({
          address: res.address || res.name,
          lng: String(res.longitude),
          lat: String(res.latitude),
        });
      },
      fail: () => wx.showToast({ title: "未选择位置", icon: "none" }),
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
              matchedText: item.matched_by.join(" / "),
              distance_m: item.distance_m,
            })),
          });
          return;
        }
      } catch {
        // 查重服务异常不阻断建店（REQ-M01B-002 分支 4：记录「查重未完成」由后端复核）
      }
    }

    const payload: StoreCreatePayload = {
      company_id: this.data.companyId,
      store_name: this.data.storeName.trim(),
      province: this.data.province.trim(),
      city: this.data.city.trim(),
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
      wx.showToast({ title: errMessage(err), icon: "none" });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
