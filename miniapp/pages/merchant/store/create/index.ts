/**
 * 门店建档 / 编辑（V02 M01B/M02）.
 *
 * 新建：员工现场建档，必须填写首访信息；门店与首访同事务提交。
 * 编辑：地址/坐标变化需选择「地址纠错」或「门店搬迁」。
 */
import type { components } from "../../../../types/api-types";
import { pickAndUploadPhotos } from "../../../../utils/image-upload";
import { chooseMapLocation } from "../../../../utils/location";
import type { MerchantPhoto, MerchantPhotoType } from "../../../../utils/image-upload";
import { describeRequestError } from "../../../../utils/merchant-errors";
import { getCAccessToken } from "../../../../utils/token";
import { MP_ICONS } from "../../../../utils/mp-icons";
import { matchDistrict } from "../../../../utils/region";
import { request } from "../../../../utils/request";
import { resolveAssetUrl } from "../../../../utils/url";

type CompanyList = components["schemas"]["MerchantCompanyListResponse"];
type CompanyItem = components["schemas"]["MerchantCompanyResponse"];
type StoreCreateResult = components["schemas"]["MerchantStoreCreateResult"];
type StoreResponse = components["schemas"]["MerchantStoreResponse"];
type StoreUpdateResult = StoreResponse | components["schemas"]["MerchantStoreRelocateResponse"];
type DuplicateCheck = components["schemas"]["MerchantDuplicateCheckResponse"];
type DuplicateCandidate = components["schemas"]["MerchantDuplicateCandidate"];
type DictItem = components["schemas"]["PublicDictItemResponse"];
type DictResponse = components["schemas"]["PublicDictListResponse"];

interface DisplayPhoto extends MerchantPhoto {
  displayUrl: string;
}

interface StoreForm {
  store_name: string;
  district: string;
  business_circle: string;
  address: string;
  lng: number | null;
  lat: number | null;
  contact_name: string;
  contact_phone: string;
  cooperation_status: string;
  remark: string;
  photos: DisplayPhoto[];
}

interface Option {
  code: string;
  label: string;
}

interface DuplicateDisplay extends DuplicateCandidate {
  matchedText: string;
  distanceText: string;
}

interface PageData {
  /** 页面级状态：编辑模式加载门店失败时进 error，避免空表单被误提交 */
  state: "loading" | "error" | "needLogin" | "ok";
  errorText: string;
  mode: "create" | "edit";
  storeId: string;
  companyKeyword: string;
  companies: CompanyItem[];
  companySearched: boolean;
  selectedCompany: CompanyItem | null;
  showCompanyCreate: boolean;
  newCompanyName: string;
  newCompanyContact: string;
  newCompanyPhone: string;
  form: StoreForm;
  cooperationOptions: Option[];
  districts: string[];
  districtIndex: number;
  businessCircles: string[];
  businessCircleIndex: number;
  changeType: "edit" | "correct" | "relocate";
  changeReason: string;
  submitting: boolean;
  duplicateOpen: boolean;
  duplicates: DuplicateDisplay[];
  forceReason: string;
}

const DEFAULT_COOPERATION_OPTIONS: Option[] = [
  { code: "not_cooperated", label: "未合作" },
  { code: "negotiating", label: "洽谈中" },
];
/** 页面兜底文案：具体原因由 describeRequestError 补全（审查报告 T11）. */
const ACTION_FAILED = "操作失败";

/** 距离文案统一「米 / 公里」（审查报告 T8）. */
function formatDistance(meters: number | null | undefined): string {
  if (meters === null || meters === undefined) {
    return "";
  }
  if (meters < 1000) {
    return `距离 ${Math.round(meters)} 米`;
  }
  return `距离 ${(meters / 1000).toFixed(1)} 公里`;
}

function toDisplayPhotos(photos: MerchantPhoto[]): DisplayPhoto[] {
  return photos.map((photo) => ({ ...photo, displayUrl: resolveAssetUrl(photo.file_url) }));
}

Page({
  data: {
    state: "ok" as "loading" | "error" | "needLogin" | "ok",
    errorText: "",
    mode: "create" as "create" | "edit",
    storeId: "",
    companyKeyword: "",
    companies: [] as CompanyItem[],
    companySearched: false,
    selectedCompany: null as CompanyItem | null,
    showCompanyCreate: false,
    newCompanyName: "",
    newCompanyContact: "",
    newCompanyPhone: "",
    form: {
      store_name: "",
      district: "",
      business_circle: "",
      address: "",
      lng: null as number | null,
      lat: null as number | null,
      contact_name: "",
      contact_phone: "",
      cooperation_status: "not_cooperated",
      remark: "",
      photos: [] as DisplayPhoto[],
    },
    cooperationOptions: DEFAULT_COOPERATION_OPTIONS,
    districts: [] as string[],
    districtIndex: -1,
    businessCircles: [] as string[],
    businessCircleIndex: -1,
    changeType: "edit" as "edit" | "correct" | "relocate",
    changeReason: "",
    submitting: false,
    duplicateOpen: false,
    duplicates: [] as DuplicateDisplay[],
    forceReason: "",
    icons: {
      plus: MP_ICONS.plus,
      close: MP_ICONS.close,
      camera: MP_ICONS.camera,
      pin: MP_ICONS.pin,
      chevronDown: MP_ICONS.chevronDown,
    },
  },

  onLoad(options: Record<string, string | undefined>) {
    const mode = options.mode === "edit" ? "edit" : "create";
    const storeId = options.store_id || "";
    this.setData({ mode, storeId });
    wx.setNavigationBarTitle({ title: mode === "edit" ? "编辑门店" : "门店建档" });
    this.loadDictOptions();
    void this.loadDistricts();
    if (mode === "edit" && storeId) {
      this.loadStore(storeId);
    }
  },

  /** 区域字典（REQ-IT1-04：只能从系统区域列表选择，避免手填错误） */
  async loadDistricts(): Promise<void> {
    try {
      const data = await request<{ items: string[] }>({ url: "/public/merchant/districts" });
      const districts = data.items || [];
      this.setData({ districts, districtIndex: districts.indexOf(this.data.form.district) });
    } catch {
      // 字典不可用不阻断建档，选择器会退化为空列表并提示
    }
  },

  async loadDictOptions(): Promise<void> {
    try {
      const cooperation = await request<DictResponse>({
        url: "/public/dicts/merchant_cooperation_status",
        skipAuth: true,
      });
      this.setData({
        cooperationOptions: cooperation.items.filter((item: DictItem) =>
          ["not_cooperated", "negotiating"].includes(item.code),
        ),
      });
    } catch {
      // 字典接口不可用时使用本地兜底选项，不阻断建档
    }
  },

  async loadStore(storeId: string): Promise<void> {
    this.setData({ state: "loading", errorText: "" });
    try {
      const store = await request<StoreResponse>({ url: `/public/merchant/stores/${storeId}` });
      this.setData({
        selectedCompany: {
          id: store.company_id,
          company_name: store.company_name,
          status: "normal",
          contact_name: null,
          contact_phone_masked: null,
          remark: null,
          created_at: store.created_at,
          updated_at: store.updated_at,
        },
        form: {
          store_name: store.store_name,
          district: store.district,
          business_circle: store.business_circle,
          address: store.address,
          lng: store.lng,
          lat: store.lat,
          contact_name: store.contact_name,
          contact_phone: store.contact_phone,
          cooperation_status: store.cooperation_status,
          remark: store.remark || "",
          photos: toDisplayPhotos(store.photos || []),
        },
      });
      this.setData({ state: "ok", districtIndex: this.data.districts.indexOf(store.district) });
      void this.loadBusinessCircles(store.district, store.business_circle);
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 401) {
        this.setData({ state: "needLogin" });
        return;
      }
      // 空表单比报错更危险：加载失败就停在这里，不允许编辑/提交
      this.setData({ state: "error", errorText: describeRequestError(err, "门店信息加载失败") });
    }
  },

  onGoLogin() {
    wx.navigateTo({ url: "/pages/login/index/index?from=merchant" });
  },

  // 从登录页返回后自恢复：只有编辑态才有需要重拉的详情
  onShow() {
    if (this.data.state === "needLogin" && getCAccessToken() && this.data.mode === "edit" && this.data.storeId) {
      void this.loadStore(this.data.storeId);
    }
  },

  onRetry() {
    if (this.data.mode === "edit" && this.data.storeId) {
      void this.loadStore(this.data.storeId);
    }
  },

  onInput(e: WechatMiniprogram.Input) {
    const field = e.currentTarget.dataset.field as keyof StoreForm;
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  onCompanyKeyword(e: WechatMiniprogram.Input) {
    this.setData({ companyKeyword: e.detail.value });
  },

  async onSearchCompany(): Promise<void> {
    const keyword = this.data.companyKeyword.trim();
    if (!keyword) {
      wx.showToast({ title: "请输入公司名称", icon: "none" });
      return;
    }
    try {
      const data = await request<CompanyList>({
        url: "/public/merchant/companies",
        data: { keyword, limit: 20 },
      });
      this.setData({ companies: data.items, companySearched: true });
    } catch (err) {
      wx.showToast({ title: describeRequestError(err, ACTION_FAILED), icon: "none" });
    }
  },

  onSelectCompany(e: WechatMiniprogram.BaseEvent) {
    const index = Number(e.currentTarget.dataset.index);
    const company = this.data.companies[index];
    if (!company) {
      return;
    }
    this.setData({ selectedCompany: company, companies: [], companyKeyword: "", companySearched: false });
  },

  onClearCompany() {
    this.setData({ selectedCompany: null });
  },

  onToggleCompanyCreate() {
    this.setData({ showCompanyCreate: !this.data.showCompanyCreate });
  },

  onNewCompanyName(e: WechatMiniprogram.Input) {
    this.setData({ newCompanyName: e.detail.value });
  },

  onNewCompanyContact(e: WechatMiniprogram.Input) {
    this.setData({ newCompanyContact: e.detail.value });
  },

  onNewCompanyPhone(e: WechatMiniprogram.Input) {
    this.setData({ newCompanyPhone: e.detail.value });
  },

  async onCreateCompany(): Promise<void> {
    const name = this.data.newCompanyName.trim();
    if (!name) {
      wx.showToast({ title: "公司名称必填", icon: "none" });
      return;
    }
    try {
      const company = await request<CompanyItem>({
        url: "/public/merchant/companies",
        method: "POST",
        data: {
          company_name: name,
          contact_name: this.data.newCompanyContact || null,
          contact_phone: this.data.newCompanyPhone || null,
        },
      });
      this.setData({
        selectedCompany: company,
        showCompanyCreate: false,
        newCompanyName: "",
        newCompanyContact: "",
        newCompanyPhone: "",
      });
      wx.showToast({ title: "公司已创建", icon: "success" });
    } catch (err) {
      wx.showToast({ title: describeRequestError(err, ACTION_FAILED), icon: "none" });
    }
  },

  async onChooseLocation(): Promise<void> {
    const picked = await chooseMapLocation();
    if (!picked) {
      return;
    }
    const district = matchDistrict(picked.address, picked.name, this.data.districts);
    const districtChanged = Boolean(district && district !== this.data.form.district);
    this.setData({
      "form.address": picked.address || this.data.form.address,
      "form.lng": picked.longitude,
      "form.lat": picked.latitude,
      "form.district": district || this.data.form.district,
      "form.business_circle": districtChanged ? "" : this.data.form.business_circle,
      districtIndex: district ? this.data.districts.indexOf(district) : this.data.districtIndex,
    });
    if (district) {
      void this.loadBusinessCircles(district, "");
    } else {
      wx.showToast({ title: "未识别到区域，请手动选择区域与商圈", icon: "none" });
    }
  },

  onSelectDistrict(e: WechatMiniprogram.PickerChange) {
    const index = Number(e.detail.value);
    const district = this.data.districts[index] || "";
    this.setData({
      "form.district": district,
      "form.business_circle": "",
      districtIndex: index,
      businessCircles: [],
      businessCircleIndex: -1,
    });
    void this.loadBusinessCircles(district, "");
  },

  /** 商圈候选（REQ-IT1-04：从列表选择；该区域无候选时退回手填，避免建不了店） */
  async loadBusinessCircles(district: string, current: string): Promise<void> {
    if (!district) {
      this.setData({ businessCircles: [], businessCircleIndex: -1 });
      return;
    }
    try {
      const data = await request<{ items: string[] }>({
        url: "/public/merchant/business-circles",
        data: { district },
      });
      const circles = data.items || [];
      this.setData({
        businessCircles: circles,
        businessCircleIndex: current ? circles.indexOf(current) : -1,
      });
    } catch (err) {
      wx.showToast({ title: describeRequestError(err, ACTION_FAILED), icon: "none" });
    }
  },

  onSelectBusinessCircle(e: WechatMiniprogram.PickerChange) {
    const index = Number(e.detail.value);
    const value = this.data.businessCircles[index] || "";
    this.setData({ "form.business_circle": value, businessCircleIndex: index });
  },

  onSelectCooperation(e: WechatMiniprogram.BaseEvent) {
    this.setData({ "form.cooperation_status": e.currentTarget.dataset.code as string });
  },

  onSelectChangeType(e: WechatMiniprogram.BaseEvent) {
    this.setData({ changeType: e.currentTarget.dataset.type as "edit" | "correct" | "relocate" });
  },

  onChangeReason(e: WechatMiniprogram.Input) {
    this.setData({ changeReason: e.detail.value });
  },

  async onAddPhoto(e: WechatMiniprogram.BaseEvent): Promise<void> {
    const photoType = e.currentTarget.dataset.type as MerchantPhotoType;
    const remaining = 20 - this.data.form.photos.length;
    if (remaining <= 0) {
      wx.showToast({ title: "最多 20 张", icon: "none" });
      return;
    }
    try {
      const photos = await pickAndUploadPhotos(remaining, photoType);
      this.setData({ "form.photos": this.data.form.photos.concat(toDisplayPhotos(photos)) });
    } catch (err) {
      wx.showToast({ title: describeRequestError(err, ACTION_FAILED), icon: "none" });
    }
  },

  onRemovePhoto(e: WechatMiniprogram.BaseEvent) {
    const index = Number(e.currentTarget.dataset.index);
    this.setData({ "form.photos": this.data.form.photos.filter((_, i) => i !== index) });
  },

  onForceReason(e: WechatMiniprogram.Input) {
    this.setData({ forceReason: e.detail.value });
  },

  onCloseDuplicate() {
    this.setData({ duplicateOpen: false });
  },

  onOpenDuplicate(e: WechatMiniprogram.BaseEvent) {
    const id = e.currentTarget.dataset.id as string;
    this.setData({ duplicateOpen: false });
    wx.navigateTo({ url: `/pages/merchant/store/detail/index?store_id=${id}` });
  },

  onForceCreate() {
    if (!this.data.forceReason.trim()) {
      wx.showToast({ title: "请填写强制新建理由", icon: "none" });
      return;
    }
    this.setData({ duplicateOpen: false });
    this.submitStore(true);
  },

  onSubmit() {
    this.submitStore(false);
  },

  validate(): string | null {
    const { form, selectedCompany } = this.data;
    if (!selectedCompany) {
      return "请选择或创建公司";
    }
    if (!form.store_name.trim()) {
      return "请填写门店名称";
    }
    if (!form.district.trim()) {
      return "请选择区域";
    }
    if (!form.business_circle.trim()) {
      return "请选择商圈";
    }
    if (!form.address.trim()) {
      return "请填写详细地址";
    }
    if (form.lng === null || form.lat === null) {
      return "请地图选点获取经纬度";
    }
    if (!form.contact_name.trim() || !form.contact_phone.trim()) {
      return "请填写联系人及联系电话";
    }
    return null;
  },

  async submitStore(force: boolean): Promise<void> {
    if (this.data.submitting) {
      return;
    }
    const error = this.validate();
    if (error) {
      wx.showToast({ title: error, icon: "none" });
      return;
    }
    const { form, mode, storeId, selectedCompany, changeType, changeReason } = this.data;
    if (!selectedCompany) {
      return;
    }

    this.setData({ submitting: true });
    try {
      if (mode === "create" && !force && !this.data.forceReason.trim()) {
        try {
          const check = await request<DuplicateCheck>({
            url: "/public/merchant/stores/check-duplicates",
            method: "POST",
            data: {
              store_name: form.store_name,
              address: form.address,
              lng: form.lng,
              lat: form.lat,
              contact_phone: form.contact_phone,
            },
          });
          if (check.candidates && check.candidates.length) {
            const duplicates = check.candidates.map((item) => ({
              ...item,
              matchedText: item.matched_by.join(" / "),
              distanceText: formatDistance(item.distance_m),
            }));
            this.setData({ duplicateOpen: true, duplicates });
            return;
          }
        } catch {
          // 查重失败不阻断保存（后端会二次校验并记录）
        }
      }

      if (mode !== "create" && changeType !== "edit" && !changeReason.trim()) {
        wx.showToast({ title: "请填写变更原因", icon: "none" });
        return;
      }

      const photos = form.photos.map(({ displayUrl: _displayUrl, ...photo }) => photo);
      if (mode === "edit") {
        const result = await request<StoreUpdateResult>({
          url: `/public/merchant/stores/${storeId}`,
          method: "PUT",
          data: {
            company_id: selectedCompany.id,
            store_name: form.store_name,
            district: form.district,
            business_circle: form.business_circle,
            address: form.address,
            lng: form.lng,
            lat: form.lat,
            contact_name: form.contact_name,
            contact_phone: form.contact_phone,
            photos,
            remark: form.remark || null,
            change_type: changeType,
            change_reason: changeReason || null,
          },
        });
        const target =
          "new_store" in result ? (result as components["schemas"]["MerchantStoreRelocateResponse"]).new_store : result;
        wx.showToast({ title: "已保存", icon: "success" });
        setTimeout(() => {
          wx.redirectTo({ url: `/pages/merchant/store/detail/index?store_id=${target.id}` });
        }, 800);
        return;
      }

      const result = await request<StoreCreateResult>({
        url: "/public/merchant/stores",
        method: "POST",
        data: {
          company_id: selectedCompany.id,
          store_name: form.store_name,
          district: form.district,
          business_circle: form.business_circle,
          address: form.address,
          lng: form.lng,
          lat: form.lat,
          contact_name: form.contact_name,
          contact_phone: form.contact_phone,
          cooperation_status: form.cooperation_status,
          photos,
          remark: form.remark || null,
          force_create_reason: this.data.forceReason || null,
        },
      });
      wx.showToast({ title: "建档成功", icon: "success" });
      setTimeout(() => {
        wx.redirectTo({ url: `/pages/merchant/store/detail/index?store_id=${result.store.id}` });
      }, 800);
    } catch (err) {
      wx.showToast({ title: describeRequestError(err, ACTION_FAILED), icon: "none" });
    } finally {
      this.setData({ submitting: false });
    }
  },

});
