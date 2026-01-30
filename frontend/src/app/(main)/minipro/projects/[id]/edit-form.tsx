"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MiniProject, Consultant, MiniProjectPhoto } from "../types";
import { updateMiniProjectAction, refreshMiniProjectAction } from "../actions";
import { Form } from "@/components/ui/form";
import { PhotoManager } from "./_components/photo-manager";
import { MarketingInfoSection } from "./_components/marketing-info-section";
import { PropertyHardInfoSection } from "./_components/property-hard-info-section";
import { RightColumn } from "./_components/right-column";
import { FormHeader } from "./_components/form-header";
import { FooterActions } from "./_components/footer-actions";
import { formSchema, FormValues } from "./schema";

interface MiniProjectEditFormProps {
  project: MiniProject;
  consultants: Consultant[];
  initialPhotos: MiniProjectPhoto[];
}

export function MiniProjectEditForm({
  project,
  consultants,
  initialPhotos,
}: MiniProjectEditFormProps) {
  const router = useRouter();
  const [photos, setPhotos] = useState<MiniProjectPhoto[]>(initialPhotos);
  const [tagInput, setTagInput] = useState("");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: project.title || "",
      cover_image: project.cover_image || null,
      style: project.style || null,
      description: project.description || null,
      marketing_tags: Array.isArray(project.marketing_tags)
        ? project.marketing_tags
        : [],
      share_title: project.share_title || null,
      share_image: project.share_image || null,
      consultant_id: project.consultant_id || null,
      is_published: !!project.is_published,
      sort_order: project.sort_order ?? 0,
    },
  });

  const onSubmit = async (values: FormValues) => {
    try {
      const submitValues = {
        ...values,
        consultant_id:
          values.consultant_id === "none" || !values.consultant_id
            ? null
            : values.consultant_id,
      };
      const result = await updateMiniProjectAction(project.id, submitValues);
      if (result.success) {
        toast.success("项目更新成功");
        router.refresh();
      } else {
        toast.error(result.error || "更新失败");
      }
    } catch {
      toast.error("更新失败");
    }
  };

  const handleSaveDraft = async () => {
    form.setValue("is_published", false);
    const values = form.getValues();
    await onSubmit(values);
  };

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const val = tagInput.trim().replace(/,$/, "");
      const currentTags = form.getValues("marketing_tags") || [];
      if (val && !currentTags.includes(val)) {
        form.setValue("marketing_tags", [...currentTags, val], {
          shouldDirty: true,
        });
      }
      setTagInput("");
    }
  };

  const handleRemoveTag = (tag: string) => {
    const currentTags = form.getValues("marketing_tags") || [];
    form.setValue(
      "marketing_tags",
      currentTags.filter((t) => t !== tag),
      { shouldDirty: true },
    );
  };

  const handleRefresh = async () => {
    try {
      const result = await refreshMiniProjectAction(project.id);
      if (result.success) {
        toast.success("项目数据已重刷新");
        router.refresh();
      } else {
        toast.error(result.error || "刷新失败");
      }
    } catch {
      toast.error("刷新失败");
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col h-full"
        >
          <FormHeader
            project={project}
            onSaveDraft={handleSaveDraft}
            onGoBack={() => router.back()}
          />
          <main className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
            <div className="grid grid-cols-12 gap-6">
              <div className="col-span-12 lg:col-span-7 space-y-6">
                <MarketingInfoSection
                  tagInput={tagInput}
                  onTagInputChange={setTagInput}
                  onAddTag={handleAddTag}
                  onRemoveTag={handleRemoveTag}
                />
                <PropertyHardInfoSection
                  project={project}
                  onRefresh={handleRefresh}
                />
              </div>
              <div className="col-span-12 lg:col-span-5 space-y-6">
                <RightColumn consultants={consultants} />
                <PhotoManager
                  projectId={project.id}
                  photos={photos}
                  onPhotosChange={setPhotos}
                />
              </div>
            </div>
            <FooterActions onGoBack={() => router.back()} />
          </main>
        </form>
      </Form>
    </div>
  );
}
