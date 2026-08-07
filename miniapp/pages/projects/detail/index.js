// pages/projects/detail/index.js
import { request } from "../../../utils/request";
import { resolveAssetUrl } from "../../../utils/url";

/** 设计稿仅展示 6 个改造阶段（不含「已完成」）. */
const ALL_STAGES = ["拆除", "设计", "水电", "木瓦", "油漆", "交付"];

/** 判断是否为 HTTP 非 2xx 错误. */
function isHttpResponseError(err) {
  return (
    typeof err === "object" &&
    err !== null &&
    "statusCode" in err &&
    typeof err.statusCode === "number"
  );
}

/** 取 MM-DD. */
function formatDate(dateStr) {
  return dateStr.slice(5);
}

/** 将后端改造阶段映射为 6 项展示数据. */
function buildStages(apiStages) {
  // ⚠️ TODO: API 暂无阶段首图，renovation-img 用渐变占位，待后端补阶段图片字段
  return ALL_STAGES.map((stageName) => {
    const matched = apiStages?.find((s) => s.stage === stageName);
    let meta = "待开始";
    if (matched) {
      if (matched.completed_date) {
        meta = `${matched.photo_count} 张 · 完成于 ${formatDate(
          matched.completed_date
        )}`;
      } else if (matched.photo_count > 0) {
        meta = "进行中";
      } else {
        meta = "待开始";
      }
    }
    return { stage: stageName, meta };
  });
}

Page({
  data: {
    id: null,
    detail: null,
    stages: [],
    gallery: [],
    loading: false,
    error: false,
    notFound: false,
  },
  onLoad(options) {
    const rawId = options.id;
    if (!rawId) {
      this.setData({ notFound: true });
      return;
    }
    const id = Number(rawId);
    if (!Number.isFinite(id)) {
      this.setData({ notFound: true });
      return;
    }
    this.setData({ id });
    this.loadDetail(id);
  },
  async loadDetail(id) {
    this.setData({
      loading: true,
      error: false,
      notFound: false,
      detail: null,
    });
    try {
      const detail = await request({
        url: `/public/projects/${id}`,
      });
      // 后端文件 URL 为相对路径 /static/uploads/xxx.jpg，需拼接 origin 供 <image>/<video> 加载
      const resolvedDetail = {
        ...detail,
        images: (detail.images ?? []).map((img) => resolveAssetUrl(img)),
      };
      const stages = buildStages(resolvedDetail.renovation_stages);
      // 图集优先用 media（含图片与视频），按类型渲染；无 media 时回退 images
      const media = detail.media ?? [];
      const gallery =
        media.length > 0
          ? media
              .map((m) => ({
                type: m.media_type === "video" ? "video" : "image",
                url: resolveAssetUrl(m.file_url),
              }))
              .filter((g) => g.url)
          : (resolvedDetail.images ?? []).map((url) => ({ type: "image", url }));
      this.setData({ detail: resolvedDetail, stages, gallery, loading: false });
    } catch (err) {
      this.setData({ loading: false });
      if (isHttpResponseError(err) && err.statusCode === 404) {
        this.setData({ notFound: true });
        return;
      }
      this.setData({ error: true });
      wx.showToast({ title: "加载失败，请重试", icon: "none" });
    }
  },
  onImageTap(e) {
    const images = (this.data.gallery ?? [])
      .filter((g) => g.type === "image")
      .map((g) => g.url);
    if (images.length === 0) {
      return;
    }
    const current = e.currentTarget.dataset.url;
    wx.previewImage({
      urls: images,
      current: current ?? images[0],
    });
  },
  onCallPhone() {
    const phone = this.data.detail?.consultant?.phone;
    if (phone) {
      wx.makePhoneCall({ phoneNumber: phone }).catch(() => {});
    } else {
      wx.showToast({ title: "暂无联系电话", icon: "none" });
    }
  },
  onAddWechat() {
    // ⚠️ TODO: 待配置真实微信号
    wx.setClipboardData({ data: "微信号待配置" });
    wx.showToast({ title: "微信号已复制", icon: "none" });
  },
  onRetry() {
    const id = this.data.id;
    if (id === null) {
      return;
    }
    this.loadDetail(id);
  },
  onShareAppMessage() {
    return {
      title: this.data.detail?.title || "美房宝房源",
      path: `/pages/projects/detail/index?id=${this.data.id}`,
    };
  },
});
