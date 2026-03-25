"use client";

import * as React from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { InfoCard } from "../ui/InfoCard";
import { MarketingInfoFields } from "./MarketingInfoFields";
import { BasicConfigFields } from "./BasicConfigFields";
import { useMiniProjectForm } from "./useMiniProjectForm";
import type { EditModeProps } from "../form-types";
import { PhotoManager } from "../../[id]/_components/photo-manager";

export function EditMode({ mode, project, photos, consultants, actions }: EditModeProps) {
  const [localPhotos, setLocalPhotos] = React.useState(photos);
  const { form, handleSubmit, isSubmitting } = useMiniProjectForm({
    mode,
    project,
    actions,
  });

  const submitButtonText = isSubmitting
    ? mode === "create"
      ? "创建中..."
      : "保存中..."
    : mode === "create"
      ? "创建项目"
      : "保存更改";

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* 左侧：主要信息 */}
          <div className="lg:col-span-7 space-y-6">
            <MarketingInfoFields />

            {mode === "edit" ? (
              <InfoCard title="物理信息（只读）">
                <div className="text-sm text-slate-500">
                  物理信息来自主项目同步（刷新后覆盖），详情请查看只读详情页。
                </div>
              </InfoCard>
            ) : null}
          </div>

          {/* 右侧：配置和照片 */}
          <div className="lg:col-span-5 space-y-6">
            <BasicConfigFields consultants={consultants} />

            {mode === "edit" && project ? (
              <PhotoManager
                projectId={project.id}
                photos={localPhotos}
                onPhotosChange={setLocalPhotos}
              />
            ) : (
              <InfoCard title="照片">
                <div className="text-sm text-slate-500">
                  创建完成后可在编辑页管理照片。
                </div>
              </InfoCard>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4">
          <Button
            type="submit"
            disabled={isSubmitting}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {submitButtonText}
          </Button>
        </div>
      </form>
    </Form>
  );
}
