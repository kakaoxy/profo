"use client";

/**
 * 户型图上传 Dialog.
 *
 * 支持选择多张图片，逐张上传到指定小区。每张图片可选填描述。
 * 全部上传完成后回调 onSuccess 刷新网格。
 */

import { useState, useRef, useCallback } from "react";
import { Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { uploadCommunityImageAction } from "../actions/upload-image";

interface ImageUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  communityId: string;
  onSuccess: () => void;
}

interface UploadItem {
  file: File;
  description: string;
  status: "pending" | "uploading" | "done" | "error";
  message?: string;
}

export function ImageUploadDialog({
  open,
  onOpenChange,
  communityId,
  onSuccess,
}: ImageUploadDialogProps) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setItems((prev) => [
      ...prev,
      ...files.map((file) => ({ file, description: "", status: "pending" as const })),
    ]);
    // 重置 input 允许重复选择同一文件
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const updateDescription = (index: number, description: string) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, description } : item)),
    );
  };

  const handleUpload = async () => {
    const pending = items.filter((item) => item.status === "pending");
    if (pending.length === 0) return;

    setUploading(true);
    let successCount = 0;
    let errorCount = 0;

    for (const item of pending) {
      const index = items.indexOf(item);
      setItems((prev) =>
        prev.map((it, i) => (i === index ? { ...it, status: "uploading" } : it)),
      );

      const res = await uploadCommunityImageAction(
        communityId,
        item.file,
        item.description || undefined,
      );

      if (res.success) {
        successCount++;
        setItems((prev) =>
          prev.map((it, i) => (i === index ? { ...it, status: "done" } : it)),
        );
      } else {
        errorCount++;
        setItems((prev) =>
          prev.map((it, i) =>
            i === index ? { ...it, status: "error", message: res.message } : it,
          ),
        );
      }
    }

    setUploading(false);

    if (successCount > 0) {
      toast.success(`成功上传 ${successCount} 张户型图`);
      onSuccess();
    }

    // 全部完成（无 error）则关闭弹窗
    if (errorCount === 0) {
      onOpenChange(false);
      setItems([]);
    } else {
      // 保留 error 项供用户查看，清除 done 项
      setItems((prev) => prev.filter((it) => it.status !== "done"));
    }
  };

  const handleClose = (open: boolean) => {
    if (!open && !uploading) {
      setItems([]);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col gap-0 p-0">
        <DialogHeader className="p-4 border-b">
          <DialogTitle>上传户型图</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* 文件选择 */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed border-border rounded-xl hover:bg-muted/50 transition-colors disabled:opacity-50"
          >
            <Upload className="h-6 w-6 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">点击选择户型图</span>
            <span className="text-xs text-muted-foreground/70">支持 JPG / PNG / WebP / GIF</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* 已选文件列表 */}
          {items.map((item, index) => (
            <div
              key={`${item.file.name}-${index}`}
              className="flex flex-col gap-1.5 p-3 rounded-lg border border-border bg-muted/30"
            >
              <div className="flex items-center gap-2">
                <span className="flex-1 min-w-0 truncate text-xs font-medium">
                  {item.file.name}
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {(item.file.size / 1024).toFixed(0)} KB
                </span>
                {item.status === "pending" && !uploading && (
                  <button
                    onClick={() => removeItem(index)}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    ✕
                  </button>
                )}
                {item.status === "uploading" && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                )}
                {item.status === "done" && (
                  <span className="shrink-0 text-xs text-green-600">✓</span>
                )}
                {item.status === "error" && (
                  <span className="shrink-0 text-xs text-red-500">✕</span>
                )}
              </div>
              {item.status === "pending" && (
                <Input
                  value={item.description}
                  onChange={(e) => updateDescription(index, e.target.value)}
                  placeholder="描述（可选）"
                  maxLength={200}
                  className="h-8 text-xs"
                />
              )}
              {item.status === "error" && item.message && (
                <p className="text-[10px] text-red-500">{item.message}</p>
              )}
            </div>
          ))}
        </div>

        <DialogFooter className="p-4 border-t">
          <Button
            variant="outline"
            onClick={() => handleClose(false)}
            disabled={uploading}
          >
            取消
          </Button>
          <Button
            onClick={handleUpload}
            disabled={uploading || items.filter((i) => i.status === "pending").length === 0}
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                上传中...
              </>
            ) : (
              `上传 ${items.filter((i) => i.status === "pending").length || ""} 张`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
