"use client";

import { useWatch, UseFormReturn } from "react-hook-form";
import { FileUploader } from "./file-uploader";
import { FileList } from "./file-preview";
import { type FormValues } from "../schema";
import { type Attachment } from "../attachment-types";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

interface TabProps {
  form: UseFormReturn<FormValues>;
}

export function AttachmentsTab({ form }: TabProps) {
  const attachments = useWatch({
    control: form.control,
    name: "attachments",
    defaultValue: [],
  }) || [];

  const handleUploadComplete = (attachment: Attachment) => {
    const current = form.getValues("attachments") || [];
    form.setValue("attachments", [...current, attachment], {
      shouldDirty: true,
      shouldTouch: true,
    });
  };

  const handleRemove = (id: string) => {
    const current = form.getValues("attachments") || [];
    form.setValue(
      "attachments",
      current.filter((att) => att.id !== id),
      { shouldDirty: true, shouldTouch: true }
    );
  };

  return (
    <div className="space-y-6">
      {/* 上传区域 */}
      <div>
        <h3 className="mb-3 text-[14px] font-medium text-foreground tracking-tight">上传附件</h3>
        <FileUploader onUploadComplete={handleUploadComplete} />
      </div>

      <Separator className="bg-dove/20" />

      {/* 已上传文件列表 */}
      <div>
        <h3 className="mb-3 text-[14px] font-medium text-foreground tracking-tight">
          已上传附件
          {attachments.length > 0 && (
            <span className="ml-2 text-[13px] text-graphite font-normal">
              （共 {attachments.length} 个）
            </span>
          )}
        </h3>
        <ScrollArea className="h-[300px] w-full rounded-inputs border border-dove/40 p-5 bg-pure-white">
          <div className="pr-4">
            <FileList attachments={attachments} onRemove={handleRemove} />
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
