"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import type { L4MarketingProject } from "../../types";
import type { L4MarketingProjectCreate, L4MarketingProjectUpdate } from "../../types";
import type { MiniProjectFormActions } from "../form-types";
import { formSchema, formValuesToCreateRequest, formValuesToUpdateRequest, projectToFormValues } from "../form-schema";
import type * as z from "zod";

type FormValues = z.infer<typeof formSchema>;

interface UseMiniProjectFormProps {
  mode: "create" | "edit";
  project?: L4MarketingProject;
  actions: MiniProjectFormActions;
}

export function useMiniProjectForm({ mode, project, actions }: UseMiniProjectFormProps) {
  const router = useRouter();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: getDefaultValues(mode, project),
  });

  const { formState } = form;
  const isSubmitting = formState.isSubmitting;
  const dirtyFields = formState.dirtyFields;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (mode === "create") {
        const createBody = formValuesToCreateRequest(values) as L4MarketingProjectCreate;

        const result = await actions.createL4MarketingProject(createBody);
        if (result.success && result.data?.id) {
          toast.success("项目创建成功");
          router.push("/minipro/projects");
          return;
        }
        toast.error(result.error || "创建失败");
        return;
      }

      if (!project) return;

      const dirty = dirtyFields as Partial<Record<keyof FormValues, boolean>>;
      const patch: Partial<L4MarketingProjectUpdate> = {};

      // 只收集变更的字段
      (Object.keys(dirty) as (keyof FormValues)[]).forEach((key) => {
        if (!dirty[key]) return;
        const updateData = formValuesToUpdateRequest({ [key]: values[key] });
        Object.assign(patch, updateData);
      });

      if (Object.keys(patch).length === 0) {
        toast("没有需要保存的变更");
        return;
      }

      const result = await actions.updateL4MarketingProject(project.id, patch);
      if (result.success) {
        toast.success("项目更新成功");
        router.push("/minipro/projects");
        return;
      }
      toast.error(result.error || "更新失败");
    } catch {
      toast.error(mode === "create" ? "创建失败" : "更新失败");
    }
  });

  return {
    form,
    onSubmit,
    isSubmitting,
  };
}

/**
 * 获取表单默认值
 */
function getDefaultValues(
  mode: "create" | "edit",
  project?: L4MarketingProject
): FormValues {
  if (mode === "create") {
    return {
      community_id: 0,
      layout: "",
      orientation: "",
      floor_info: "",
      area: 0,
      total_price: 0,
      title: "",
      images: [],
      sort_order: 0,
      tags: [],
      decoration_style: "",
      publish_status: "草稿",
      project_status: "在途",
      consultant_id: undefined,
    };
  }

  // 编辑模式：从项目数据初始化
  if (!project) {
    return {
      community_id: 0,
      layout: "",
      orientation: "",
      floor_info: "",
      area: 0,
      total_price: 0,
      title: "",
      images: [],
      sort_order: 0,
      tags: [],
      decoration_style: "",
      publish_status: "草稿",
      project_status: "在途",
      consultant_id: undefined,
    };
  }

  return projectToFormValues(project as unknown as Record<string, unknown>);
}
