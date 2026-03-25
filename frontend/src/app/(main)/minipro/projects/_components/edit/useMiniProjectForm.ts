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
    defaultValues: {
      title: project?.title ?? "",
      cover_image: project?.cover_image ?? null,
      style: project?.style ?? null,
      description: project?.description ?? null,
      marketing_tags:
        typeof project?.marketing_tags === "string"
          ? project?.marketing_tags.split(",").map((t) => t.trim()).filter(Boolean)
          : [],
      share_title: project?.share_title ?? null,
      share_image: project?.share_image ?? null,
      consultant_id: project?.consultant_id ?? null,
      sort_order: project?.sort_order ?? 0,
      is_published: project?.is_published ?? false,
    },
  });

  const { formState } = form;
  const isSubmitting = formState.isSubmitting;
  const dirtyFields = formState.dirtyFields;

  const handleSubmit = async (values: CreateValues | UpdateValues) => {
    try {
      if (mode === "create") {
        const createValues = values as CreateValues;
        const { is_published, sort_order, marketing_tags, ...rest } = createValues;
        const createBody: L4MarketingProjectCreate = {
          ...rest,
          marketing_tags: marketing_tags.join(","),
        };

        const result = await actions.createL4MarketingProject(createBody);
        if (result.success && result.data?.id) {
          if (is_published !== false || sort_order !== 0) {
            await actions.updateL4MarketingProject(result.data.id, {
              is_published,
              sort_order,
            });
          }

          toast.success("项目创建成功");
          router.replace(`/minipro/projects/${result.data.id}/edit`);
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
