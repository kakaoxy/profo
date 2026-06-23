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

/**
 * 附件上传 Tab
 * 包含文件上传区域和已上传文件列表
 */
export function AttachmentsTab({ form }: TabProps) {
  // Use useWatch for proper subscription to form field changes
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
        <h3 className="mb-3 text-sm font-medium">上传附件</h3>
        <FileUploader onUploadComplete={handleUploadComplete} />
      </div>

      <Separator />

      {/* 已上传文件列表 */}
      <div>
        <h3 className="mb-3 text-sm font-medium">
          已上传附件
          {attachments.length > 0 && (
            <span className="ml-2 text-muted-foreground">
              （共 {attachments.length} 个）
            </span>
          )}
        </h3>
        <ScrollArea className="h-[300px] w-full rounded-md border p-4">
          <div className="pr-4">
            <FileList attachments={attachments} onRemove={handleRemove} />
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
