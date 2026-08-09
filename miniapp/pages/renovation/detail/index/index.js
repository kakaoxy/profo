import { request } from "../../../../utils/request";
import { resolveAssetUrl } from "../../../../utils/url";
import { BASE_URL } from "../../../../utils/config";
import {
  RENOVATION_STAGES,
  ALLOWED_EXT,
  formatMonthDay,
  todayStr,
  toStageLabel,
} from "./constants";

/**
 * 单项目装修进度详情页（profile「装修记录」→ 装修记录列表 → 详情）.
 *
 * 功能对等后台 MobileRenovationView：阶段时间线 + 按阶段分组的照片网格 +
 * 上传/删除施工照片 + 标记阶段完成。仅内部员工（admin 令牌）可访问；
 * 401 → 清令牌提示登录失效；403 → 无权限态；写权限由
 * project.renovation.can_edit_renovation 门控，后端双通道最终校验。
 * 常量与纯函数拆分自 ./constants.js 以控制本文件行数 < 500。
 */

Page({
  projectId: "",

  data: {
    state: "loading",
    projectName: "项目详情",
    currentStageText: "未开始",
    progressText: "0%",
    canEdit: false,
    stages: [],
    expandedStage: "",
    submittingStage: "",
    deletingPhoto: "",
  },

  getToken() {
    return wx.getStorageSync("access_token");
  },

  clearToken() {
    wx.removeStorageSync("access_token");
    wx.removeStorageSync("refresh_token");
  },

  onLoad(query) {
    this.projectId = query.id || "";
    const name = query.name || "";
    this.setData({
      projectName: name ? decodeURIComponent(name) : "项目详情",
    });
    this.loadAll();
  },

  loadProject(token) {
    return request({
      url: "/projects/" + this.projectId,
      header: { Authorization: "Bearer " + token },
    });
  },

  loadPhotos(token) {
    return request({
      url: "/projects/" + this.projectId + "/renovation/photos",
      header: { Authorization: "Bearer " + token },
    }).then((res) => res.items);
  },

  async loadAll() {
    const token = this.getToken();
    if (!token) {
      this.setData({ state: "needLogin" });
      return;
    }
    this.setData({ state: "loading" });
    try {
      const project = await this.loadProject(token);
      this.applyProject(project);
      const photos = await this.loadPhotos(token);
      this.applyPhotos(photos);
    } catch (err) {
      const statusCode = err && err.statusCode;
      if (statusCode === 401) {
        this.clearToken();
        this.setData({ state: "needLogin" });
      } else if (statusCode === 403) {
        this.setData({ state: "noPermission" });
      } else {
        this.setData({ state: "error" });
      }
    }
  },

  buildStages(project) {
    const dates = project.renovationStageDates || {};
    const realValues = RENOVATION_STAGES.map((s) => s.value);
    const allCompleted = realValues.every((v) => !!dates[v]);
    const currentIndex = realValues.findIndex((v) => !dates[v]);
    const prevStages = this.data.stages;
    return RENOVATION_STAGES.map((cfg, idx) => {
      const isCompleted = !!dates[cfg.value];
      const isCurrent = !allCompleted && !isCompleted && idx === currentIndex;
      const prev = prevStages.find((s) => s.value === cfg.value);
      return {
        value: cfg.value,
        label: cfg.label,
        isCompleted: isCompleted,
        isCurrent: isCurrent,
        isFuture: !isCompleted && !isCurrent,
        finishDate: formatMonthDay(dates[cfg.value] || ""),
        completeDate: todayStr(),
        photos: [],
        uploading: (prev && prev.uploading) || [],
      };
    });
  },

  firstIncompleteStage(stages) {
    const first = stages.find((s) => !s.isCompleted);
    return first ? first.value : stages[stages.length - 1].value;
  },

  applyProject(project) {
    const stages = this.buildStages(project);
    const dates = project.renovationStageDates || {};
    const completed = RENOVATION_STAGES.filter((s) => dates[s.value]).length;
    const percent = Math.round((completed / RENOVATION_STAGES.length) * 100);
    this.setData({
      projectName: project.community_name || project.name || "项目详情",
      currentStageText: toStageLabel(project.renovation_stage),
      progressText: percent + "%",
      canEdit: project.renovation && project.renovation.can_edit_renovation === true,
      stages: stages,
      expandedStage: this.firstIncompleteStage(stages),
      submittingStage: "",
      deletingPhoto: "",
    });
  },

  applyPhotos(photos) {
    const groups = {};
    photos.forEach((p) => {
      const stage = p.stage;
      if (!groups[stage]) {
        groups[stage] = [];
      }
      groups[stage].push({
        id: p.id,
        url: resolveAssetUrl(p.url),
        thumb: resolveAssetUrl(p.thumbnail_url),
      });
    });
    const stages = this.data.stages.map((s) =>
      Object.assign({}, s, { photos: groups[s.value] || [] }),
    );
    this.setData({ stages: stages, state: "ready" });
  },

  onToggleStage(e) {
    const stage = e.currentTarget.dataset.stage;
    this.setData({
      expandedStage: this.data.expandedStage === stage ? "" : stage,
    });
  },

  onChoosePhoto(e) {
    if (!this.data.canEdit) {
      return;
    }
    const stage = e.currentTarget.dataset.stage;
    wx.chooseMedia({
      count: 9,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      success: (res) => {
        const valid = res.tempFiles.filter((f) => ALLOWED_EXT.test(f.tempFilePath));
        const skipped = res.tempFiles.length - valid.length;
        if (skipped > 0) {
          wx.showToast({ title: "已跳过 " + skipped + " 张不支持格式", icon: "none" });
        }
        valid.forEach((f) => {
          const key =
            Date.now() + "-" + Math.random().toString(36).slice(2, 8);
          this.addUploadingPlaceholder(stage, key, f.tempFilePath);
          this.uploadPhoto(stage, f.tempFilePath, key);
        });
      },
    });
  },

  addUploadingPlaceholder(stage, key, localPath) {
    const stages = this.data.stages.map((s) =>
      s.value === stage
        ? Object.assign({}, s, {
            uploading: s.uploading.concat([{ key: key, localPath: localPath, percent: 0, failed: false }]),
          })
        : s,
    );
    this.setData({ stages: stages });
  },

  removeUploadingPlaceholder(stage, key) {
    const stages = this.data.stages.map((s) =>
      s.value === stage
        ? Object.assign({}, s, {
            uploading: s.uploading.filter((u) => u.key !== key),
          })
        : s,
    );
    this.setData({ stages: stages });
  },

  markUploadFailed(stage, key) {
    const stages = this.data.stages.map((s) => {
      if (s.value !== stage) {
        return s;
      }
      return Object.assign({}, s, {
        uploading: s.uploading.map((u) =>
          u.key === key ? Object.assign({}, u, { failed: true }) : u,
        ),
      });
    });
    this.setData({ stages: stages });
  },

  updateUploadPercent(stage, key, percent) {
    const stages = this.data.stages.map((s) => {
      if (s.value !== stage) {
        return s;
      }
      return Object.assign({}, s, {
        uploading: s.uploading.map((u) =>
          u.key === key ? Object.assign({}, u, { percent: percent }) : u,
        ),
      });
    });
    this.setData({ stages: stages });
  },

  uploadPhoto(stage, localPath, key) {
    const token = this.getToken();
    if (!token) {
      this.setData({ state: "needLogin" });
      return;
    }
    const fail = () => {
      this.markUploadFailed(stage, key);
      wx.showToast({ title: "上传失败", icon: "none" });
    };
    const uploadTask = wx.uploadFile({
      url: BASE_URL + "/files/upload",
      filePath: localPath,
      name: "file",
      header: { Authorization: "Bearer " + token },
      success: async (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          fail();
          return;
        }
        try {
          const file = JSON.parse(res.data);
          await request({
            url:
              "/projects/" +
              this.projectId +
              "/renovation/photos?stage=" +
              encodeURIComponent(stage) +
              "&url=" +
              encodeURIComponent(file.url) +
              "&thumbnail_url=" +
              (file.thumbnail_url ? encodeURIComponent(file.thumbnail_url) : "") +
              "&filename=" +
              (file.filename ? encodeURIComponent(file.filename) : "") +
              "&media_type=image",
            method: "POST",
            header: { Authorization: "Bearer " + token },
          });
          this.removeUploadingPlaceholder(stage, key);
          this.loadAll();
        } catch (err) {
          fail();
        }
      },
      fail: () => fail(),
    });
    uploadTask.onProgressUpdate((p) => {
      this.updateUploadPercent(stage, key, p.progress);
    });
  },

  onRetryUpload(e) {
    const stage = e.currentTarget.dataset.stage;
    const key = e.currentTarget.dataset.key;
    const path = e.currentTarget.dataset.path;
    this.removeUploadingPlaceholder(stage, key);
    const newKey =
      Date.now() + "-" + Math.random().toString(36).slice(2, 8);
    this.addUploadingPlaceholder(stage, newKey, path);
    this.uploadPhoto(stage, path, newKey);
  },

  onPreviewPhoto(e) {
    const stage = e.currentTarget.dataset.stage;
    const current = e.currentTarget.dataset.url;
    const stageObj = this.data.stages.find((s) => s.value === stage);
    if (!stageObj) {
      return;
    }
    const urls = stageObj.photos.map((p) => p.url);
    wx.previewImage({ current: current, urls: urls });
  },

  onDeletePhoto(e) {
    if (this.data.deletingPhoto) {
      return;
    }
    const photoId = e.currentTarget.dataset.id;
    wx.showModal({
      title: "删除照片",
      content: "确定删除这张施工照片吗？",
      confirmColor: "#5d2a1a",
      success: (res) => {
        if (res.confirm) {
          this.doDeletePhoto(photoId);
        }
      },
    });
  },

  doDeletePhoto(photoId) {
    const token = this.getToken();
    if (!token) {
      this.setData({ state: "needLogin" });
      return;
    }
    this.setData({ deletingPhoto: photoId });
    request({
      url: "/projects/" + this.projectId + "/renovation/photos/" + photoId,
      method: "DELETE",
      header: { Authorization: "Bearer " + token },
    })
      .then(() => {
        wx.showToast({ title: "删除成功", icon: "success" });
        this.loadAll();
      })
      .catch((err) => {
        const statusCode = err && err.statusCode;
        if (statusCode === 401) {
          this.clearToken();
          this.setData({ state: "needLogin" });
        } else {
          const msg = (err && err.body && err.body.message) || "";
          wx.showToast({
            title:
              statusCode === 403 ? msg || "无权限操作" : msg || "删除失败，请重试",
            icon: "none",
          });
        }
      })
      .finally(() => this.setData({ deletingPhoto: "" }));
  },

  onDateChange(e) {
    const stage = e.currentTarget.dataset.stage;
    const date = e.detail.value;
    const stages = this.data.stages.map((s) =>
      s.value === stage ? Object.assign({}, s, { completeDate: date }) : s,
    );
    this.setData({ stages: stages });
  },

  onCompleteStage(e) {
    if (this.data.submittingStage) {
      return;
    }
    const stage = e.currentTarget.dataset.stage;
    const stageObj = this.data.stages.find((s) => s.value === stage);
    if (!stageObj) {
      return;
    }
    this.doCompleteStage(stage, stageObj.completeDate || todayStr());
  },

  doCompleteStage(stage, date) {
    const token = this.getToken();
    if (!token) {
      this.setData({ state: "needLogin" });
      return;
    }
    this.setData({ submittingStage: stage });
    const body = {
      completed_stage: stage,
      stage_completed_at: date + "T12:00:00",
    };
    request({
      url: "/projects/" + this.projectId + "/renovation",
      method: "PUT",
      data: body,
      header: { Authorization: "Bearer " + token },
    })
      .then(() => {
        wx.showToast({ title: "已完成" + toStageLabel(stage), icon: "success" });
        this.loadAll();
      })
      .catch((err) => {
        const statusCode = err && err.statusCode;
        if (statusCode === 401) {
          this.clearToken();
          this.setData({ state: "needLogin" });
        } else {
          const msg = (err && err.body && err.body.message) || "";
          wx.showToast({
            title:
              statusCode === 403 ? msg || "无权限操作" : msg || "操作失败，请重试",
            icon: "none",
          });
        }
      })
      .finally(() => this.setData({ submittingStage: "" }));
  },

  onRetry() {
    this.loadAll();
  },

  onGoBack() {
    wx.navigateBack({ delta: 1 });
  },
});
