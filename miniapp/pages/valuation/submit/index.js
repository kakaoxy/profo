import { request } from "../../../utils/request";
import { BASE_URL } from "../../../utils/config";
import { resolveAssetUrl } from "../../../utils/url";

Page({
  data: {
    form: {
      community_name: "",
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
  },

  getToken() {
    return wx.getStorageSync("access_token");
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

  async onChooseImage() {
    const token = this.getToken();
    if (!token) {
      // ⚠️ TODO 待登录流程
      wx.showToast({ title: "请先登录", icon: "none" });
      return;
    }
    const remaining = 9 - this.data.form.images.length;
    if (remaining <= 0) {
      wx.showToast({ title: "最多上传9张", icon: "none" });
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
        try {
          const url = await this.uploadImage(file.tempFilePath);
          // form.images 存相对路径（与后端存储一致，提交时用）；displayImages 存完整 URL 供 <image> 加载
          const newImages = [...this.data.form.images, url];
          this.setData({
            "form.images": newImages,
            displayImages: newImages.map((u) => resolveAssetUrl(u)),
          });
        } catch {
          wx.showToast({ title: "上传失败", icon: "none" });
        }
      }
    } catch {
      // 用户取消等，静默
    }
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

  async onSubmit() {
    if (this.data.submitting) {
      return;
    }
    const token = this.getToken();
    if (!token) {
      // ⚠️ TODO 待登录流程
      wx.showToast({ title: "请先登录", icon: "none" });
      return;
    }
    const {
      community_name,
      floor,
      total_floor,
      expected_price,
      layout,
      area,
      orientation,
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
      // ⚠️ TODO 设计稿标「可选填」但 API required number，本轮强制校验
      wx.showToast({ title: "请输入心理预期价", icon: "none" });
      return;
    }

    const body = {
      community_name,
      layout: layout || undefined,
      area: area ? Number(area) : undefined,
      floor_info: `${floor}/${total_floor}`,
      orientation: orientation || undefined,
      remarks: remarks || undefined,
      expected_price: Number(expected_price),
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
      setTimeout(() => {
        // ⚠️ 本页是 tabBar 页，navigateBack 可能无上一页；改 switchTab 回房源列表更稳妥
        wx.switchTab({ url: "/pages/projects/list/index" });
      }, 1500);
    } catch {
      wx.showToast({ title: "提交失败，请重试", icon: "none" });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
