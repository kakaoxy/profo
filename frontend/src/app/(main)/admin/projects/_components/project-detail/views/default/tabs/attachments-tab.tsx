"use client";

import { FileText, Upload } from "lucide-react";
import { AttachmentGroup } from "../../../components/attachment-group";
import { ATTACHMENT_GROUPS } from "../../../constants";
import type { AttachmentInfo, AttachmentHandlers } from "../../../types";

interface AttachmentsTabProps {
  attachments: AttachmentInfo[];
  handlers: AttachmentHandlers;
  /** 打开上传弹窗（由 DefaultView 统一挂载，无上传能力时不渲染入口） */
  onUpload?: () => void;
}

/**
 * 附件库 Tab（V4.2 · 设计稿 1:1）— 附件库卡
 * 卡头（标题 / 副题 / 上传附件 textlink）+ 按 6 类分组（doc-group 容器）。
 */
export function AttachmentsTab({ attachments, handlers, onUpload }: AttachmentsTabProps) {
  // 按分类分组附件
  const groupedAttachments = Object.entries(ATTACHMENT_GROUPS).reduce(
    (acc, [key, config]) => {
      acc[key] = attachments.filter((att) => config.categories.includes(att.category));
      return acc;
    },
    {} as Record<string, AttachmentInfo[]>,
  );

  return (
    <section className="rounded-cards bg-pure-white p-6 font-sohne shadow-steep">
      {/* 卡头（原型 .card-head）：标题 + 副题 + 上传入口（textlink 形态） */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-medium text-ink">附件库</h3>
          <p className="mt-0.5 text-[13px] font-[430] text-graphite">
            按 6 类分组 · 支持图片压缩上传 / 预览 / 下载 / 删除（100MB·图 500MB·视频）
          </p>
        </div>
        {onUpload && (
          <button
            type="button"
            onClick={onUpload}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 text-sm font-[450] text-ink hover:underline hover:underline-offset-4"
          >
            <Upload className="h-3.5 w-3.5" />
            上传附件
          </button>
        )}
      </div>

      {attachments.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <FileText className="mx-auto mb-4 h-16 w-16 opacity-30" />
          <p className="text-lg">暂无附件</p>
          <p className="mt-1 text-sm">此项目尚未上传任何附件</p>
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(ATTACHMENT_GROUPS).map(([key, config]) => (
            <AttachmentGroup
              key={key}
              groupKey={key}
              groupConfig={config}
              attachments={groupedAttachments[key] || []}
              handlers={handlers}
            />
          ))}
        </div>
      )}
    </section>
  );
}
