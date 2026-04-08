"use client";

import * as React from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { InfoCard } from "../ui/InfoCard";
import { MarketingInfoFields } from "./MarketingInfoFields";
import { BasicConfigFields } from "./BasicConfigFields";
import { useMiniProjectForm } from "./useMiniProjectForm";
import type { EditModeProps } from "../form-types";
import { DualPhotoManager } from "../../[id]/_components/dual-photo-manager";
import Link from "next/link";

export function EditMode({ mode, project, photos, actions }: EditModeProps) {
  const [localPhotos, setLocalPhotos] = React.useState(photos);
  const { form, onSubmit, isSubmitting } = useMiniProjectForm({
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
      : "保存并发布";

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* 左侧：主要信息 */}
          <div className="lg:col-span-8 space-y-6">
            <MarketingInfoFields />
          </div>

          {/* 右侧：配置和照片 */}
          <div className="lg:col-span-4 space-y-6">
            <BasicConfigFields />

            {mode === "edit" && project ? (
              <DualPhotoManager
                projectId={project.id}
                photos={localPhotos}
                onPhotosChange={setLocalPhotos}
              />
            ) : (
              <InfoCard title="照片">
                <div className="text-sm text-[#707785]">
                  创建完成后可在编辑页管理照片。
                </div>
              </InfoCard>
            )}
          </div>
        </div>

        {/* Fixed Bottom Actions */}
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-[#0b1c30]/90 backdrop-blur-xl px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-8 z-50">
          <div className="flex flex-col">
            <span className="text-[#707785]/60 text-[10px] uppercase font-bold tracking-widest">当前状态</span>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-[#85fa51] rounded-full animate-pulse"></div>
              <span className="text-white text-sm font-bold">
                {mode === "create" ? "正在创建新项目" : `正在编辑: 房源 #${project?.id}`}
              </span>
            </div>
          </div>
          <div className="h-8 w-px bg-white/10"></div>
          <div className="flex gap-4">
            <Link
              href="/l4-marketing/projects"
              className="text-white/60 text-xs font-bold hover:text-white transition-colors px-3 py-2"
            >
              取消修改
            </Link>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-[#005daa] hover:bg-[#0075d5] text-white text-xs font-black px-6 py-2 rounded-lg transition-all shadow-lg shadow-[#005daa]/20"
            >
              {submitButtonText}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
