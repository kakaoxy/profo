"use client";

import type { L4MarketingProject, L4MarketingMedia } from "@/app/(main)/admin/marketing/types";
import type {
  L4MarketingProjectCreate,
  L4MarketingProjectUpdate,
} from "@/app/(main)/admin/marketing/types";
import type { ActionResult } from "@/app/(main)/admin/marketing/actions/projects";

export type MiniProjectFormMode = "create" | "edit" | "view";
export interface MiniProjectFormActions {
  createL4MarketingProject: (
    body: L4MarketingProjectCreate,
  ) => Promise<ActionResult<L4MarketingProject>>;
  updateL4MarketingProject: (
    id: number,
    body: L4MarketingProjectUpdate,
  ) => Promise<ActionResult<L4MarketingProject>>;
}

export interface MiniProjectFormProps {
  mode: MiniProjectFormMode;
  initialProject?: L4MarketingProject;
  initialPhotos?: L4MarketingMedia[];
  actions?: MiniProjectFormActions;
  defaultConsultantId?: string;
}

export interface EditModeProps {
  mode: "create" | "edit";
  project?: L4MarketingProject;
  photos: L4MarketingMedia[];
  actions: MiniProjectFormActions;
  defaultConsultantId?: string;
  /** 详情抽屉嵌入模式：不渲染 fixed 底栏，保存/取消改由宿主回调（sticky 于 Sheet 滚动容器） */
  embedded?: boolean;
  /** embedded 模式保存成功回调（替代跳转列表） */
  onSaved?: () => void;
  /** embedded 模式取消回调（替代跳转列表） */
  onCancelEdit?: () => void;
  /** dirty 状态变化上报（详情抽屉据此拦截未保存关闭） */
  onDirtyChange?: (dirty: boolean) => void;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface MarketingInfoFieldsProps {
  // Form field props will be passed via react-hook-form context
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface BasicConfigFieldsProps {
  // Form field props will be passed via react-hook-form context
}

export interface TagInputFieldProps {
  value: string[];
  onChange: (value: string[]) => void;
}
