"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { 
  MiniProject, 
  Consultant, 
  MiniProjectPhoto
} from "../types";
import { 
  updateMiniProjectAction, 
  addMiniPhotoAction, 
  deleteMiniPhotoAction 
} from "../actions";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { toast } from "sonner";

import { formSchema, FormValues } from "./_components/schema";
import { BasicInfoSection } from "./_components/basic-info-section";
import { SEOSection } from "./_components/seo-section";
import { ConsultantSection } from "./_components/consultant-section";
import { StatusSection } from "./_components/status-section";
import { PhotosSection } from "./_components/photos-section";

interface MiniProjectEditFormProps {
  project: MiniProject;
  consultants: Consultant[];
  initialPhotos: MiniProjectPhoto[];
}

export function MiniProjectEditForm({ project, consultants, initialPhotos }: MiniProjectEditFormProps) {
  const router = useRouter();
  const [photos, setPhotos] = useState<MiniProjectPhoto[]>(initialPhotos);
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: project.title || "",
      cover_image: project.cover_image || null,
      style: project.style || null,
      description: project.description || null,
      marketing_tags: Array.isArray(project.marketing_tags) ? project.marketing_tags : [],
      share_title: project.share_title || null,
      share_image: project.share_image || null,
      consultant_id: project.consultant_id || null,
      is_published: !!project.is_published,
      sort_order: project.sort_order ?? 0,
    },
  });

  const onSubmit = async (values: FormValues) => {
    try {
      // Ensure consultant_id "none" is sent as null
      const submitValues = {
        ...values,
        consultant_id: (values.consultant_id === "none" || !values.consultant_id) ? null : values.consultant_id
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
  }

  const handleAddPhotoFromSource = async (sourcePhoto: { url: string; renovation_stage?: string }) => {
    try {
      const result = await addMiniPhotoAction(project.id, sourcePhoto.url, sourcePhoto.renovation_stage || "other");
      if (result.success && result.data) {
        setPhotos(prev => [...prev, result.data as MiniProjectPhoto]);
        toast.success("照片已添加");
      } else {
        toast.error(result.error || "添加照片失败");
      }
    } catch {
      toast.error("添加照片失败");
    }
  };

  const handleAddPhotoByUrl = async () => {
    const url = prompt("请输入图片URL");
    if (!url) return;
    try {
      const result = await addMiniPhotoAction(project.id, url, "other");
      if (result.success && result.data) {
        setPhotos(prev => [...prev, result.data as MiniProjectPhoto]);
        toast.success("照片已添加");
      } else {
        toast.error(result.error || "添加照片失败");
      }
    } catch {
       toast.error("添加照片失败");
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    if (!confirm("确定删除这张照片吗？")) return;
    try {
      const result = await deleteMiniPhotoAction(photoId);
      if (result.success) {
        setPhotos(prev => prev.filter(p => p.id !== photoId));
        toast.success("照片已删除");
      } else {
        toast.error(result.error || "删除照片失败");
      }
    } catch {
      toast.error("删除照片失败");
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-6">
            <BasicInfoSection form={form} />
            <SEOSection form={form} />
            <ConsultantSection form={form} consultants={consultants} />
          </div>

          <div className="space-y-6">
            <StatusSection form={form} />
            <PhotosSection 
              projectId={project.id}
              photos={photos}
              onAddByUrl={handleAddPhotoByUrl}
              onSelectFromSource={handleAddPhotoFromSource}
              onDelete={handleDeletePhoto}
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Button type="submit" size="lg">保存修改</Button>
          <Button type="button" variant="outline" size="lg" onClick={() => router.back()}>取消</Button>
        </div>
      </form>
    </Form>
  );
}
