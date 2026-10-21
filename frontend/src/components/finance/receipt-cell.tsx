"use client";

/**
 * 凭证附件展示 + 补传（项目账本与资金账户流水共用）.
 *
 * 为什么抽出来：两处都要满足同一套要求——
 * 1. 有凭证 → 缩略图，点击可**预览**（图片大图查看 / PDF 等新标签打开）；
 * 2. 无凭证 → 「缺凭证」标签，且**可点击补传**（不是只显示一个红标就结束）；
 * 3. 补传只追加，不删除已上传的（避免误删历史凭证）。
 *
 * 「可预览的文件」判定：图片类用内置 lightbox（ImagePreview）放大查看；
 * 非图片（PDF/OFD 等发票常见格式）不强行渲染缩略图，用图标 + 新标签打开，
 * 由浏览器/系统阅读器预览——避免 next/image 或 img 对非图片 URL 报错。
 */

import * as React from "react";
import { FileText, Loader2, Paperclip, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ImageUpload } from "@/components/common/image-upload";
import type { ImageItem } from "@/components/common/image-upload";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** 可内联放大预览的图片扩展名白名单 */
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".avif"];

/** 判断 URL 是否为可直接渲染的图片（data:/blob: 视为图片；其余看扩展名） */
export function isPreviewableImage(url: string): boolean {
  const lower = url.toLowerCase().split("?")[0].split("#")[0];
  if (lower.startsWith("data:image/")) return true;
  if (lower.startsWith("blob:")) return true;
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

interface ReceiptCellProps {
  /** 已上传的凭证 URL 列表 */
  urls: string[];
  /** 传入则表示可补传（缺凭证时标签可点） */
  onSupplement?: () => void;
  /** 是否禁用操作（如已结算、无写权限） */
  disabled?: boolean;
  /** 无凭证时的文案，默认「缺凭证」 */
  emptyLabel?: string;
  className?: string;
}

/**
 * 表格内的凭证单元格：缩略图（可预览）或「缺凭证」（可点击补传）.
 */
export function ReceiptCell({
  urls,
  onSupplement,
  disabled = false,
  emptyLabel = "缺凭证",
  className,
}: ReceiptCellProps) {
  if (urls.length === 0) {
    if (!onSupplement || disabled) {
      return (
        <span
          className={cn(
            "rounded-md bg-apricot-wash/70 px-1.5 py-0.5 text-[11.5px] whitespace-nowrap text-rust",
            className,
          )}
        >
          {emptyLabel}
        </span>
      );
    }
    return (
      <button
        type="button"
        onClick={onSupplement}
        className={cn(
          "inline-flex items-center gap-1 rounded-md bg-apricot-wash/70 px-1.5 py-0.5 text-[11.5px] whitespace-nowrap text-rust transition-colors hover:bg-apricot-wash",
          className,
        )}
        title="点击补传凭证"
      >
        {emptyLabel}
        <Plus className="h-2.5 w-2.5" aria-hidden="true" />
      </button>
    );
  }

  return (
    <div className={cn("flex flex-nowrap items-center justify-center gap-1", className)}>
      {urls.map((url, idx) => {
        const isImage = isPreviewableImage(url);

        // 非图片（PDF/OFD 等）：不强行内联渲染，新标签交给系统阅读器打开
        if (!isImage) {
          return (
            <a
              key={`${url}-${idx}`}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              title={`打开凭证 ${idx + 1}（新标签）`}
              aria-label={`打开凭证 ${idx + 1}`}
              className="group relative inline-flex"
            >
              <span className="flex size-7 items-center justify-center rounded border border-dove bg-fog text-graphite transition-colors group-hover:text-ink">
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            </a>
          );
        }

        // 图片：**鼠标移上去放大预览**（不跳转、不下载）
        return (
          <HoverCard key={`${url}-${idx}`} openDelay={120} closeDelay={80}>
            <HoverCardTrigger asChild>
              <button
                type="button"
                title={`预览凭证 ${idx + 1}`}
                aria-label={`预览凭证 ${idx + 1}`}
                className="group relative inline-flex cursor-zoom-in"
                // 阻止冒泡：表格行有 onClick（跳详情），预览不应触发跳转
                onClick={(event) => event.stopPropagation()}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`凭证 ${idx + 1}`}
                  width={28}
                  height={28}
                  loading="lazy"
                  className="size-7 rounded border border-dove object-cover transition-opacity group-hover:opacity-80"
                />
              </button>
            </HoverCardTrigger>
            <HoverCardContent
              side="top"
              align="center"
              className="w-auto max-w-[min(560px,90vw)] rounded-images border-0 p-1.5 shadow-steep"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`凭证 ${idx + 1} 预览`}
                className="max-h-[70vh] w-auto rounded-[8px] object-contain"
              />
              <p className="px-1 pt-1 pb-0.5 text-center text-[11px] text-graphite">
                凭证 {idx + 1}
              </p>
            </HoverCardContent>
          </HoverCard>
        );
      })}
      {/* 已有凭证时仍允许继续补传（追加语义） */}
      {onSupplement && !disabled ? (
        <button
          type="button"
          onClick={onSupplement}
          className="flex size-7 items-center justify-center rounded border border-dashed border-dove text-graphite transition-colors hover:border-ink hover:text-ink"
          title="继续补充凭证"
          aria-label="继续补充凭证"
        >
          <Plus className="h-3 w-3" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

interface SupplementDialogProps {
  open: boolean;
  title?: string;
  /** 弹窗内的上下文说明（如「2026-10-21 · 管理费 · −¥100.00」） */
  context?: React.ReactNode;
  /** 已有凭证（只作展示，补传为追加） */
  existingUrls?: string[];
  submitting?: boolean;
  onOpenChange: (open: boolean) => void;
  /** 用户确认补传，参数为本次新上传的 URL */
  onConfirm: (urls: string[]) => void | Promise<void>;
}

/**
 * 补传凭证弹窗（与项目账本「补充凭证」同一交互）.
 *
 * 只提交**本次新上传**的 URL，服务端做增量追加（不覆盖历史凭证）。
 */
export function SupplementDialog({
  open,
  title = "补充凭证",
  context,
  existingUrls = [],
  submitting = false,
  onOpenChange,
  onConfirm,
}: SupplementDialogProps) {
  const [urls, setUrls] = React.useState<string[]>([]);
  // 每次打开重置上传组件内部状态
  const [uploadKey, setUploadKey] = React.useState(0);

  React.useEffect(() => {
    if (!open) return;
    setUrls([]);
    setUploadKey((k) => k + 1);
  }, [open]);

  const handleChange = React.useCallback((items: ImageItem[]) => {
    setUrls(items.filter((i) => i.status === "success" && i.url).map((i) => i.url as string));
  }, []);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && submitting) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-112.5 rounded-[20px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[17px] font-medium tracking-[-0.009em] text-ink">
            <Paperclip className="h-4 w-4" aria-hidden="true" />
            {title}
          </DialogTitle>
          {context ? (
            <DialogDescription className="text-[12.5px] leading-relaxed text-graphite">
              {context}
            </DialogDescription>
          ) : null}
        </DialogHeader>

        <div className="grid max-h-[60vh] gap-3 overflow-y-auto overscroll-contain px-1 py-2">
          {existingUrls.length > 0 ? (
            <div className="grid gap-1.5">
              <span className="text-[11.5px] text-graphite">已有凭证（点击可预览）</span>
              <div className="flex flex-wrap gap-1.5">
                {existingUrls.map((url, idx) => (
                  <a
                    key={`${url}-${idx}`}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-full bg-fog px-2 py-1 text-[11.5px] text-ash hover:text-ink"
                  >
                    {isPreviewableImage(url) ? (
                      <Paperclip className="h-3 w-3" aria-hidden="true" />
                    ) : (
                      <FileText className="h-3 w-3" aria-hidden="true" />
                    )}
                    凭证 {idx + 1}
                  </a>
                ))}
              </div>
            </div>
          ) : null}

          <ImageUpload
            key={uploadKey}
            maxCount={9}
            gridCols={3}
            aspectRatio="aspect-video"
            title="点击或拖拽上传凭证"
            onChange={handleChange}
          />
          <p className="text-[11.5px] text-graphite">
            补传为追加操作，不会覆盖已有凭证；金额与原因不可修改。
          </p>
        </div>

        <DialogFooter>
          <Button
            onClick={() => void onConfirm(urls)}
            disabled={submitting || urls.length === 0}
            className="w-full rounded-full bg-ink text-pure-white hover:bg-ink/90"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                提交中…
              </>
            ) : (
              "确认补充"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
