// 与 index.ts 逻辑完全一致（去掉类型注解），改动需同步两侧
import { request } from "../../../utils/request";
import { BASE_URL } from "../../../utils/config";
import { resolveAssetUrl } from "../../../utils/url";

// ⚠️ 未覆盖：
// - 内部员工持有 admin 令牌时 GET /public/auth/me 返回 401，手机号维护回退 /auth/me 判定（canEditPhone=false）；
//   admin 令牌同样无法 POST /public/leads（需 C 端 aud=c 令牌），内部员工端内无法提交估价.
// - access_token 过期未接 refresh_token 自动续期，需重新登录.
const ORIENTATION_OPTIONS = ["南", "北", "东", "西", "南北", "东西"];

// 户型图上传上限（对齐 Web 与后端 PublicLeadCreate.images max_length=6）
const MAX_IMAGES = 6;

Page({
  data: {
    form: {
      community_name: "",
      community_id: "",
      district: "",
      business_area: "",
      layout: "",
      area: "",
      orientation: "",
      floor: "",
      total_floor: "",
      expected_price: "",
      remarks: "",
      images: [],
    },
    displayImages: [],
    submitting: false,
    layoutRoom: "",
    layoutHall: "",
    layoutToilet: "",
    orientationOptions: ORIENTATION_OPTIONS,
    loggedIn: false,
    hasPhone: false,
    canEditPhone: false,
    phoneInput: "",
    editingPhone: false,
    submittingPhone: false,
  },

  onShow() {
    this.loadLogin();
  },

  getToken() {
    return wx.getStorageSync("access_token");
  },

  // 加载登录态：优先 C 端 /public/auth/me，401 回退后台 /auth/me（内部员工）
  async loadLogin() {
    const token = this.getToken();
    if (!token) {
      this.setData({ loggedIn: false, hasPhone: false, canEditPhone: false });
      return;
    }
    const authHeader = { Authorization: `Bearer ${token}` };
    try {
      const pub = await request({
        url: "/public/auth/me",
        header: authHeader,
      });
      this.setData({ loggedIn: true, canEditPhone: true, hasPhone: !!pub.phone });
      return;
    } catch (err) {
      // 非 C 端令牌（内部员工 admin 令牌）→ 回退后台 /me
    }
    try {
      const admin = await request({
        url: "/auth/me",
        header: authHeader,
      });
      this.setData({ loggedIn: true, canEditPhone: false, hasPhone: !!admin.phone });
      return;
    } catch (err) {
      this.setData({ loggedIn: false, hasPhone: false, canEditPhone: false });
    }
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    if (!field) {
      return;
    }
    // 用 setData 路径表达式局部更新
    const patch = {};
    patch[`form.${field}`] = e.detail.value;
    this.setData(patch);
  },

  // 社区搜索组件输入变化：仅同步回显（组件内部已自行管理下拉态），此处按需保留值
  onCommunityChange(e) {},

  // 社区搜索组件选中结果：把完整小区信息写入表单
  // detail = { id, name, district, business_circle }
  onCommunitySelect(e) {
    const d = e.detail;
    this.setData({
      "form.community_name": d.name,
      "form.community_id": d.id,
      "form.district": d.district,
      "form.business_area": d.business_circle,
    });
  },

  // 搜索无匹配时以当前关键词作为小区名提交（community_id 留空），district/business_area 保持当前值
  onCommunityUseQuery(e) {
    const query = (e.detail && e.detail.query || "").trim();
    if (!query) {
      return;
    }
    this.setData({
      "form.community_name": query,
      "form.community_id": "",
    });
  },

  // 清空小区选择：同步清空表单中相关字段
  onCommunityClear() {
    this.setData({
      "form.community_name": "",
      "form.community_id": "",
      "form.district": "",
      "form.business_area": "",
    });
  },

  // 户型三段输入：按 dataset.field 更新，实时组合为 n室n厅n卫（空段跳过；室为空则 layout 为空）
  onLayoutInput(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value.replace(/\D/g, "");
    const room = field === "room" ? value : this.data.layoutRoom;
    const hall = field === "hall" ? value : this.data.layoutHall;
    const toilet = field === "toilet" ? value : this.data.layoutToilet;
    let layout = "";
    if (room.trim()) {
      layout = `${room.trim()}室`;
      if (hall.trim()) {
        layout += `${hall.trim()}厅`;
      }
      if (toilet.trim()) {
        layout += `${toilet.trim()}卫`;
      }
    }
    const key = field === "room" ? "layoutRoom" : field === "hall" ? "layoutHall" : "layoutToilet";
    this.setData({ [key]: value, "form.layout": layout });
  },

  // 朝向直接选择：点击选项即回填，无需二次确认
  onOrientationTap(e) {
    const orientation = e.currentTarget.dataset.value;
    if (orientation) {
      this.setData({ "form.orientation": orientation });
    }
  },

  async onChooseImage() {
    const token = this.getToken();
    if (!token) {
      wx.showToast({ title: "请先登录", icon: "none" });
      return;
    }
    const remaining = MAX_IMAGES - this.data.form.images.length;
    if (remaining <= 0) {
      wx.showToast({ title: "最多上传6张", icon: "none" });
      return;
    }
    try {
      const res = await new Promise((resolve, reject) => {
        wx.chooseMedia({
          count: remaining,
          mediaType: ["image"],
          sourceType: ["album", "camera"],
          success: resolve,
          fail: reject,
        });
      });
      for (const file of res.tempFiles) {
        // 仅允许 jpg/jpeg/png
        if (!/\.(jpe?g|png)$/i.test(file.tempFilePath)) {
          wx.showToast({ title: "仅支持jpg/jpeg/png", icon: "none" });
          continue;
        }
        try {
          const url = await this.uploadImage(file.tempFilePath);
          // form.images 存相对路径（与后端存储一致，提交时用）；displayImages 存完整 URL 供 <image> 加载
          const newImages = [...this.data.form.images, url];
          this.setData({
            "form.images": newImages,
            displayImages: newImages.map((u) => resolveAssetUrl(u)),
          });
        } catch (err) {
          wx.showToast({ title: "上传失败", icon: "none" });
        }
      }
    } catch (err) {
      // 用户取消等，静默
    }
  },

  onRemoveImage(e) {
    const index = Number(e.currentTarget.dataset.index);
    const images = this.data.form.images;
    const displayImages = this.data.displayImages;
    if (index < 0 || index >= images.length) {
      return;
    }
    this.setData({
      "form.images": images.filter((_, i) => i !== index),
      displayImages: displayImages.filter((_, i) => i !== index),
    });
  },

  uploadImage(filePath) {
    const token = this.getToken();
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: `${BASE_URL}/public/files/upload`,
        filePath,
        name: "file",
        header: { Authorization: `Bearer ${token}` },
        success: (res) => {
          // wx.uploadFile 的 success 不区分 2xx/4xx/5xx，需手动校验状态码，
          // 否则 401/500 的错误响应会被当 JSON 解析失败，丢失状态码信息
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const error = {
              statusCode: res.statusCode,
              body: res.data,
            };
            reject(error);
            return;
          }
          try {
            // 后端 FileUploadResponse 返回 { url, filename, thumbnail_url }
            const data = JSON.parse(res.data);
            const url = data.url;
            if (url) {
              resolve(url);
            } else {
              reject(new Error("upload response missing url"));
            }
          } catch (err) {
            reject(err);
          }
        },
        fail: (err) => {
          reject(err);
        },
      });
    });
  },

  onPhoneTap() {
    if (!this.data.loggedIn) {
      this.onGoLogin();
      return;
    }
    if (!this.data.canEditPhone) {
      // 内部员工（admin 身份）手机号在后台维护，C 端不可编辑
      wx.showToast({ title: "手机号在后台维护", icon: "none" });
      return;
    }
    // 仅未绑定手机号时允许完善（首次设置）
    if (this.data.hasPhone) {
      return;
    }
    this.setData({ editingPhone: true, phoneInput: "" });
  },

  onPhoneInput(e) {
    this.setData({ phoneInput: e.detail.value });
  },

  onPhoneCancel() {
    this.setData({ editingPhone: false, phoneInput: "" });
  },

  async onPhoneConfirm() {
    if (this.data.submittingPhone) {
      return;
    }
    const token = this.getToken();
    if (!token) {
      this.onGoLogin();
      return;
    }
    const value = this.data.phoneInput.trim();
    if (!/^1[3-9]\d{9}$/.test(value)) {
      wx.showToast({ title: "请输入正确的11位手机号", icon: "none" });
      return;
    }
    this.setData({ submittingPhone: true });
    try {
      const body = { phone: value };
      await request({
        url: "/public/users/phone",
        method: "POST",
        data: body,
        header: { Authorization: `Bearer ${token}` },
      });
      this.setData({ hasPhone: true, editingPhone: false, phoneInput: "" });
      wx.showToast({ title: "绑定成功", icon: "success" });
    } catch (err) {
      // 透出后端业务信息（如「手机号已被其他账号绑定」），无则兜底通用提示
      const msg = (err && err.body && err.body.message) || "";
      wx.showToast({ title: msg || "保存失败，请重试", icon: "none" });
    } finally {
      this.setData({ submittingPhone: false });
    }
  },

  onGoLogin() {
    // 后端微信登录未完成，先跳账号密码测试登录页（test-login）
    wx.navigateTo({ url: "/pages/test-login/index/index" });
  },

  async onSubmit() {
    if (this.data.submitting) {
      return;
    }
    const token = this.getToken();
    if (!token) {
      wx.showToast({ title: "请先登录", icon: "none" });
      return;
    }
    const {
      community_name,
      community_id,
      district,
      business_area,
      layout,
      area,
      orientation,
      floor,
      total_floor,
      expected_price,
      remarks,
      images,
    } = this.data.form;

    if (!community_name) {
      wx.showToast({ title: "请输入小区名称", icon: "none" });
      return;
    }
    if (!floor || !total_floor) {
      wx.showToast({ title: "请输入楼层与总高", icon: "none" });
      return;
    }
    if (!expected_price) {
      wx.showToast({ title: "请输入心理预期价", icon: "none" });
      return;
    }

    const body = {
      community_name,
      community_id: community_id || undefined,
      district: district || undefined,
      business_area: business_area || undefined,
      layout: layout || undefined,
      area: area ? Number(area) : undefined,
      floor_info: `${floor}/${total_floor}`,
      orientation: orientation || undefined,
      remarks: remarks || undefined,
      expected_price: expected_price ? Number(expected_price) : undefined,
      images: images.length ? images : undefined,
    };

    this.setData({ submitting: true });
    try {
      await request({
        url: "/public/leads",
        method: "POST",
        data: body,
        header: { Authorization: `Bearer ${token}` },
      });
      wx.showToast({ title: "提交成功", icon: "success" });
      // 极短延迟让成功提示可见即跳转，避免用户感知到明显跳转延迟
      setTimeout(() => {
        this.afterSubmitSuccess();
      }, 400);
    } catch (err) {
      wx.showToast({ title: "提交失败，请重试", icon: "none" });
    } finally {
      this.setData({ submitting: false });
    }
  },

  // 提交成功后统一跳转「我的估价」列表页，并正确维护导航历史栈：
  // - 本页若由列表页 navigateTo 进入（onGoValuation），则 navigateBack 返回该列表，
  //   使栈为 […, list]，从列表页后退时直接回到「我的页面」（profile），不再回到提交表单或重复列表；
  //   返回后列表页 onShow 会静默刷新，展示最新数据。
  // - 若由 tab 直达（栈内无列表页），则 redirectTo 替换本页为列表，同样不把提交页保留为后退目标。
  afterSubmitSuccess() {
    const pages = getCurrentPages();
    const prev = pages.length > 1 ? pages[pages.length - 2] : null;
    if (prev && prev.route === "pages/valuation/list/index") {
      wx.navigateBack();
    } else {
      wx.redirectTo({ url: "/pages/valuation/list/index" });
    }
  },
});
