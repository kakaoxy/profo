/**
 * 单项目装修进度详情页（profile「装修记录」→ 装修记录列表 → 详情）.
 *
 * 功能对等后台 MobileRenovationView：阶段时间线 + 按阶段分组的照片网格 +
 * 上传/删除施工照片 + 标记阶段完成。仅内部员工（admin 令牌）可访问；
 * 401 → 清令牌提示登录失效；403 → 无权限态；写权限由
 * project.renovation.can_edit_renovation 门控，后端双通道最终校验。
 * 常量与纯函数拆分自 ./constants.ts 以控制本文件行数 < 500。
 */
import type { components } from "../../../../types/api-types";
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
import type {
  RenovationPhotoResponse,
  RenovationStage,
  DisplayStage,
} from "./constants";

type ProjectResponse = components["schemas"]["ProjectResponse"];
type RenovationPhotoListResponse = components["schemas"]["RenovationPhotoListResponse"];
type FileUploadResponse = components["schemas"]["FileUploadResponse"];

/** 页面 data. */
interface PageData {
  state: "loading" | "error" | "needLogin" | "noPermission" | "ready";
  projectName: string;
  currentStageText: string;
  progressText: string;
  canEdit: boolean;
  stages: DisplayStage[];
  expandedStage: string;
  submittingStage: string;
  deletingPhoto: string;
}

/** 页面自定义方法. */
interface PageCustom {
  projectId: string;
  getToken(): string;
  clearToken(): void;
  loadAll(): void;
  loadProject(token: string): Promise<ProjectResponse>;
  loadPhotos(token: string): Promise<RenovationPhotoResponse[]>;
  applyProject(project: ProjectResponse): void;
  applyPhotos(photos: RenovationPhotoResponse[]): void;
  buildStages(project: ProjectResponse): DisplayStage[];
  firstIncompleteStage(stages: DisplayStage[]): string;
  addUploadingPlaceholder(stage: string, key: string, localPath: string): void;
  removeUploadingPlaceholder(stage: string, key: string): void;
  markUploadFailed(stage: string, key: string): void;
  updateUploadPercent(stage: string, key: string, percent: number): void;
  uploadPhoto(stage: string, localPath: string, key: string): void;
  doCompleteStage(stage: string, date: string): void;
  onToggleStage(e: WechatMiniprogram.BaseEvent): void;
  onChoosePhoto(e: WechatMiniprogram.BaseEvent): void;
  onRetryUpload(e: WechatMiniprogram.BaseEvent): void;
  onPreviewPhoto(e: WechatMiniprogram.BaseEvent): void;
  onDeletePhoto(e: WechatMiniprogram.BaseEvent): void;
  doDeletePhoto(photoId: string): void;
  onDateChange(e: WechatMiniprogram.PickerChange): void;
  onCompleteStage(e: WechatMiniprogram.BaseEvent): void;
  onRetry(): void;
  onGoBack(): void;
}

Page<PageData, PageCustom>({
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
    return wx.getStorageSync("access_token") as string;
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
    });
    this.loadAll();
  },

  loadProject(token: string): Promise<ProjectResponse> {
    return request<ProjectResponse>({
      url: `/projects/${this.projectId}`,
      header: { Authorization: `Bearer ${token}` },
    });
  },

  loadPhotos(token: string): Promise<RenovationPhotoResponse[]> {
    return request<RenovationPhotoListResponse>({
      url: `/projects/${this.projectId}/renovation/photos`,
      header: { Authorization: `Bearer ${token}` },
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
      const statusCode = (err as { statusCode?: number } | undefined)?.statusCode;
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

  buildStages(project: ProjectResponse): DisplayStage[] {
    const dates = project.renovationStageDates ?? {};
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
        isCompleted,
        isCurrent,
        isFuture: !isCompleted && !isCurrent,
        finishDate: formatMonthDay(dates[cfg.value] || ""),
        completeDate: todayStr(),
        photos: [],
        uploading: prev?.uploading ?? [],
      };
    });
  },

  firstIncompleteStage(stages: DisplayStage[]): string {
    const first = stages.find((s) => !s.isCompleted);
    return first ? first.value : stages[stages.length - 1].value;
  },

  applyProject(project: ProjectResponse) {
    const stages = this.buildStages(project);
    const dates = project.renovationStageDates ?? {};
    const completed = RENOVATION_STAGES.filter((s) => dates[s.value]).length;
    const percent = Math.round((completed / RENOVATION_STAGES.length) * 100);
    this.setData({
      projectName: project.community_name ?? project.name ?? "项目详情",
      currentStageText: toStageLabel(project.renovation_stage),
      progressText: `${percent}%`,
      canEdit: project.renovation?.can_edit_renovation === true,
      stages,
      expandedStage: this.firstIncompleteStage(stages),
      submittingStage: "",
      deletingPhoto: "",
    });
  },

  applyPhotos(photos: RenovationPhotoResponse[]) {
    const groups: Record<string, DisplayStage["photos"]> = {};
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
    const stages = this.data.stages.map((s) => ({
      ...s,
      photos: groups[s.value] ?? [],
    }));
    this.setData({ stages, state: "ready" });
  },

  onToggleStage(e: WechatMiniprogram.BaseEvent) {
    const stage = e.currentTarget.dataset.stage as string;
    this.setData({
      expandedStage: this.data.expandedStage === stage ? "" : stage,
    });
  },

  onChoosePhoto(e: WechatMiniprogram.BaseEvent) {
    if (!this.data.canEdit) {
      return;
    }
    const stage = e.currentTarget.dataset.stage as string;
    wx.chooseMedia({
      count: 9,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      success: (res) => {
        const valid = res.tempFiles.filter((f) => ALLOWED_EXT.test(f.tempFilePath));
        const skipped = res.tempFiles.length - valid.length;
        if (skipped > 0) {
          wx.showToast({ title: `已跳过 ${skipped} 张不支持格式`, icon: "none" });
        }
        valid.forEach((f) => {
          const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          this.addUploadingPlaceholder(stage, key, f.tempFilePath);
          this.uploadPhoto(stage, f.tempFilePath, key);
        });
      },
    });
  },

  addUploadingPlaceholder(stage: string, key: string, localPath: string) {
    const stages = this.data.stages.map((s) =>
      s.value === stage
        ? { ...s, uploading: [...s.uploading, { key, localPath, percent: 0, failed: false }] }
        : s,
    );
    this.setData({ stages });
  },

  removeUploadingPlaceholder(stage: string, key: string) {
    const stages = this.data.stages.map((s) =>
      s.value === stage
        ? { ...s, uploading: s.uploading.filter((u) => u.key !== key) }
        : s,
    );
    this.setData({ stages });
  },

  markUploadFailed(stage: string, key: string) {
    const stages = this.data.stages.map((s) => {
      if (s.value !== stage) {
        return s;
      }
      return {
        ...s,
        uploading: s.uploading.map((u) =>
          u.key === key ? { ...u, failed: true } : u,
        ),
      };
    });
    this.setData({ stages });
  },

  updateUploadPercent(stage: string, key: string, percent: number) {
    const stages = this.data.stages.map((s) => {
      if (s.value !== stage) {
        return s;
      }
      return {
        ...s,
        uploading: s.uploading.map((u) =>
          u.key === key ? { ...u, percent } : u,
        ),
      };
    });
    this.setData({ stages });
  },

  uploadPhoto(stage: string, localPath: string, key: string) {
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
      url: `${BASE_URL}/files/upload`,
      filePath: localPath,
      name: "file",
      header: { Authorization: `Bearer ${token}` },
      success: async (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          fail();
          return;
        }
        try {
          const file = JSON.parse(res.data) as FileUploadResponse;
          await request<RenovationPhotoResponse>({
            url: `/projects/${this.projectId}/renovation/photos?stage=${encodeURIComponent(stage)}&url=${encodeURIComponent(file.url)}&thumbnail_url=${file.thumbnail_url ? encodeURIComponent(file.thumbnail_url) : ""}&filename=${file.filename ? encodeURIComponent(file.filename) : ""}&media_type=image`,
            method: "POST",
            header: { Authorization: `Bearer ${token}` },
          });
          this.removeUploadingPlaceholder(stage, key);
          this.loadAll();
        } catch {
          fail();
        }
      },
      fail: () => fail(),
    });
    uploadTask.onProgressUpdate((p) => {
      this.updateUploadPercent(stage, key, p.progress);
    });
  },

  onRetryUpload(e: WechatMiniprogram.BaseEvent) {
    const stage = e.currentTarget.dataset.stage as string;
    const key = e.currentTarget.dataset.key as string;
    const path = e.currentTarget.dataset.path as string;
    this.removeUploadingPlaceholder(stage, key);
    const newKey = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.addUploadingPlaceholder(stage, newKey, path);
    this.uploadPhoto(stage, path, newKey);
  },

  onPreviewPhoto(e: WechatMiniprogram.BaseEvent) {
    const stage = e.currentTarget.dataset.stage as string;
    const current = e.currentTarget.dataset.url as string;
    const stageObj = this.data.stages.find((s) => s.value === stage);
    if (!stageObj) {
      return;
    }
    const urls = stageObj.photos.map((p) => p.url);
    wx.previewImage({ current, urls });
  },

  onDeletePhoto(e: WechatMiniprogram.BaseEvent) {
    if (this.data.deletingPhoto) {
      return;
    }
    const photoId = e.currentTarget.dataset.id as string;
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

  doDeletePhoto(photoId: string) {
    const token = this.getToken();
    if (!token) {
      this.setData({ state: "needLogin" });
      return;
    }
    this.setData({ deletingPhoto: photoId });
    request<void>({
      url: `/projects/${this.projectId}/renovation/photos/${photoId}`,
      method: "DELETE",
      header: { Authorization: `Bearer ${token}` },
    })
      .then(() => {
        wx.showToast({ title: "删除成功", icon: "success" });
        this.loadAll();
      })
      .catch((err) => {
        const statusCode = (err as { statusCode?: number } | undefined)?.statusCode;
        if (statusCode === 401) {
          this.clearToken();
          this.setData({ state: "needLogin" });
        } else {
          const msg = (err as { body?: { message?: string } } | undefined)?.body?.message;
          wx.showToast({
            title: statusCode === 403 ? msg || "无权限操作" : msg || "删除失败，请重试",
            icon: "none",
          });
        }
      })
      .finally(() => this.setData({ deletingPhoto: "" }));
  },

  onDateChange(e: WechatMiniprogram.PickerChange) {
    const stage = e.currentTarget.dataset.stage as string;
    const date = e.detail.value as string;
    const stages = this.data.stages.map((s) =>
      s.value === stage ? { ...s, completeDate: date } : s,
    );
    this.setData({ stages });
  },

  onCompleteStage(e: WechatMiniprogram.BaseEvent) {
    if (this.data.submittingStage) {
      return;
    }
    const stage = e.currentTarget.dataset.stage as string;
    const stageObj = this.data.stages.find((s) => s.value === stage);
    if (!stageObj) {
      return;
    }
    this.doCompleteStage(stage, stageObj.completeDate || todayStr());
  },

  doCompleteStage(stage: string, date: string) {
    const token = this.getToken();
    if (!token) {
      this.setData({ state: "needLogin" });
      return;
    }
    this.setData({ submittingStage: stage });
    const body: components["schemas"]["RenovationUpdate"] = {
      completed_stage: stage as RenovationStage,
      stage_completed_at: `${date}T12:00:00`,
    };
    request<ProjectResponse>({
      url: `/projects/${this.projectId}/renovation`,
      method: "PUT",
      data: body,
      header: { Authorization: `Bearer ${token}` },
    })
      .then(() => {
        wx.showToast({ title: `已完成${toStageLabel(stage as RenovationStage)}`, icon: "success" });
        this.loadAll();
      })
      .catch((err) => {
        const statusCode = (err as { statusCode?: number } | undefined)?.statusCode;
        if (statusCode === 401) {
          this.clearToken();
          this.setData({ state: "needLogin" });
        } else {
          const msg = (err as { body?: { message?: string } } | undefined)?.body?.message;
          wx.showToast({
            title: statusCode === 403 ? msg || "无权限操作" : msg || "操作失败，请重试",
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
