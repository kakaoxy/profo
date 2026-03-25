"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import type { L4MarketingProject, L4MarketingMedia } from "../../types";
import type { L4MarketingProjectCreate, L4MarketingProjectUpdate } from "../../types";
import type { MiniProjectFormActions } from "../form-types";
import { createSchema, updateSchema, type CreateValues, type UpdateValues } from "../form-schema";

interface UseMiniProjectFormProps {
  mode: "create" | "edit";
  project?: L4MarketingProject;
  actions: MiniProjectFormActions;
}

export function useMiniProjectForm({ mode, project, actions }: UseMiniProjectFormProps) {
  const router = useRouter();
  const isCreate = mode === "create";

  const form = useForm<CreateValues | UpdateValues>({
    resolver: zodResolver(isCreate ? createSchema : updateSchema),
    defaultValues: getDefaultValues(mode, project),
  });

  const { formState } = form;
  const isSubmitting = formState.isSubmitting;
  const dirtyFields = formState.dirtyFields;

  const handleSubmit = async (values: CreateValues | UpdateValues) => {
    try {
      if (mode === "create") {
        const createValues = values as CreateValues;
        const createBody: L4MarketingProjectCreate = {
          title: createValues.title,
          cover_image: createValues.cover_image,
          style: createValues.style,
          description: createValues.description,
          marketing_tags: createValues.marketing_tags.join(","),
          share_title: createValues.share_title,
          share_image: createValues.share_image,
          consultant_id: createValues.consultant_id,
        };

        const result = await actions.createL4MarketingProject(createBody);
        if (result.success && result.data?.id) {
          const projectId = result.data.id;
          const updateBody: L4MarketingProjectUpdate = {};

          // 只有在非默认值时才更新
          if (createValues.project_status !== "在途") {
            updateBody.project_status = createValues.project_status;
          }
          if (createValues.sort_order !== 0) {
            updateBody.sort_order = createValues.sort_order;
          }
          if (createValues.is_published !== false) {
            updateBody.is_published = createValues.is_published;
          }

          // 如果有状态字段需要更新，执行二次更新
          if (Object.keys(updateBody).length > 0) {
            await actions.updateL4MarketingProject(projectId, updateBody);
          }

          toast.success("项目创建成功");
          router.replace(`/minipro/projects/${projectId}/edit`);
          return;
        }
        toast.error(result.error || "创建失败");
        return;
      }

      if (!project) return;

      const dirty = dirtyFields as Partial<Record<keyof UpdateValues, boolean>>;
      const allValues = values as UpdateValues;
      const patch: Partial<L4MarketingProjectUpdate> = {};

      (Object.keys(dirty) as (keyof UpdateValues)[]).forEach((key) => {
        if (!dirty[key]) return;
        if (key === "marketing_tags") {
          patch[key] = (allValues[key] as string[]).join(",") as never;
        } else {
          patch[key] = allValues[key] as never;
        }
      });

      if (Object.keys(patch).length === 0) {
        toast("没有需要保存的变更");
        return;
      }

      const result = await actions.updateL4MarketingProject(project.id, patch);
      if (result.success) {
        toast.success("项目更新成功");
        router.refresh();
        return;
      }
      toast.error(result.error || "更新失败");
    } catch {
      toast.error(mode === "create" ? "创建失败" : "更新失败");
    }
  };

  return {
    form,
    handleSubmit,
    isSubmitting,
  };
}

/**
 * 获取表单默认值
 */
function getDefaultValues(
  mode: "create" | "edit",
  project?: L4MarketingProject
): CreateValues | UpdateValues {
  if (mode === "create") {
    return {
      title: "",
      cover_image: null,
      style: null,
      description: null,
      marketing_tags: [],
      share_title: null,
      share_image: null,
      consultant_id: null,
      project_status: "在途",
      sort_order: 0,
      is_published: false,
    };
  }

  // 编辑模式：从项目数据初始化
  return {
    title: project?.title ?? "",
    cover_image: project?.cover_image ?? null,
    style: project?.style ?? null,
    description: project?.description ?? null,
    marketing_tags: parseMarketingTags(project?.marketing_tags),
    share_title: project?.share_title ?? null,
    share_image: project?.share_image ?? null,
    consultant_id: project?.consultant_id ?? null,
    project_status: (project?.project_status as "在途" | "在售" | "已售") ?? "在途",
    sort_order: project?.sort_order ?? 0,
    is_published: project?.is_published ?? false,
  };
}

/**
 * 解析营销标签（从逗号分隔字符串到数组）
 */
function parseMarketingTags(tags: string | null | undefined): string[] {
  if (!tags) return [];
  if (typeof tags !== "string") return [];
  return tags.split(",").map((t) => t.trim()).filter(Boolean);
}
