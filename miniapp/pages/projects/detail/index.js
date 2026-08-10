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

/** 将后端改造阶段与媒体分组映射为 6 项展示数据（含完成时间与照片）. */
function buildStages(media, apiStages) {
  // 按 renovation_stage 分组 renovation 类目的图片，并 resolve 为完整 URL
  const photosByStage = new Map();
  for (const m of media || []) {
    if (m.photo_category !== "renovation" || !m.renovation_stage) {
      continue;
    }
    const stageName = m.renovation_stage;
    const url = resolveAssetUrl(m.file_url);
    if (!url) {
      continue;
    }
    const list = photosByStage.get(stageName) || [];
    list.push(url);
    photosByStage.set(stageName, list);
  }

  return ALL_STAGES.map((stageName) => {
    const matched = apiStages?.find((s) => s.stage === stageName);
    const completedDate = matched?.completed_date ?? null;
    const photos = photosByStage.get(stageName) || [];
    const photoCount = matched?.photo_count ?? photos.length;
    let status = "pending";
    if (completedDate) {
      status = "completed";
    } else if (photos.length > 0) {
      status = "in_progress";
    }
    return {
      stage: stageName,
      status,
      completedDate,
      photoCount,
      cover: photos[0] ?? null,
      photos,
      clickable: photos.length > 0,
    };
  });
}

Page({
  data: {
    id: null,
    detail: null,
    contact: null,
    stages: [],
    gallery: [],
    stageViewer: { visible: false, stage: "", photos: [], current: 0 },
    hasRenovationPhotos: false,
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
    // 启用右上角菜单的「分享给朋友」与「分享到朋友圈」，使 onShareTimeline 可触发
    wx.showShareMenu({ menus: ["shareAppMessage", "shareTimeline"] });
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
      // 详情与顾问联系方式并行拉取，避免请求瀑布
      const [detail, contact] = await Promise.all([
        request({
          url: `/public/projects/${id}`,
          skipAuth: true,
        }),
        request({
          url: `/public/projects/${id}/consultant`,
          skipAuth: true,
        }),
      ]);
      // 后端文件 URL 为相对路径 /static/uploads/xxx.jpg，需拼接 origin 供 <image>/<video> 加载
      const resolvedDetail = {
        ...detail,
        images: (detail.images ?? []).map((img) => resolveAssetUrl(img)),
      };
      // 图集优先用 media（含图片与视频），按类型渲染；无 media 时回退 images
      // 视频项用 thumbnail_url 作封面（后端目前不生成视频缩略图，poster 常为空串→前端黑色占位兜底）
      const media = detail.media ?? [];
      const stages = buildStages(media, resolvedDetail.renovation_stages);
      const hasRenovationPhotos = stages.some((s) => s.photos.length > 0);
      const gallery =
        media.length > 0
          ? media
              .map((m) => {
                const type = m.media_type === "video" ? "video" : "image";
                return {
                  type,
                  url: resolveAssetUrl(m.file_url),
                  poster: type === "video" ? resolveAssetUrl(m.thumbnail_url) : "",
                };
              })
              .filter((g) => g.url)
          : (resolvedDetail.images ?? []).map((url) => ({ type: "image", url, poster: "" }));
      this.setData({ detail: resolvedDetail, contact, stages, gallery, hasRenovationPhotos, loading: false });
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
  onMediaTap(e) {
    const gallery = this.data.gallery ?? [];
    if (gallery.length === 0) {
      return;
    }
    // wx.previewMedia 的 current 为索引(number)，需根据点按的 url 定位
    const url = e.currentTarget.dataset.url;
    let current = gallery.findIndex((g) => g.url === url);
    if (current < 0) {
      current = 0;
    }
    wx.previewMedia({
      sources: gallery.map((g) => ({ url: g.url, type: g.type })),
      current,
    });
  },
  onStageTap(e) {
    const stageName = e.currentTarget.dataset.stage;
    if (!stageName) {
      return;
    }
    const target = this.data.stages.find((s) => s.stage === stageName);
    if (!target || !target.clickable || target.photos.length === 0) {
      // 无照片的阶段不可查看轮播
      wx.showToast({ title: "该阶段暂无照片", icon: "none" });
      return;
    }
    this.setData({
      stageViewer: {
        visible: true,
        stage: stageName,
        photos: target.photos,
        current: 0,
      },
    });
  },
  onViewerClose() {
    this.setData({
      stageViewer: { visible: false, stage: "", photos: [], current: 0 },
    });
  },
  onViewerChange(e) {
    this.setData({ "stageViewer.current": e.detail.current });
  },
  onCallPhone() {
    const phone = this.data.contact?.phone;
    if (phone) {
      wx.makePhoneCall({ phoneNumber: phone }).catch(() => {});
    } else {
      wx.showToast({ title: "暂无联系电话", icon: "none" });
    }
  },
  onAddWechat() {
    const wechat = this.data.contact?.wechat_number;
    if (!wechat) {
      wx.showToast({ title: "暂无微信号", icon: "none" });
      return;
    }
    wx.setClipboardData({ data: wechat });
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
