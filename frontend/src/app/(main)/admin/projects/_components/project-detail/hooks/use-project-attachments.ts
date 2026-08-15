"use client";

import { useMemo, useCallback, useState } from "react";
import { toast } from "sonner";
import type { AttachmentInfo, AttachmentHandlers } from "../types";
import { mapLegacyAttachmentCategory } from "../constants";

interface UseProjectAttachmentsOptions {
  signingMaterials: unknown;
  onUpdateAttachments?: (attachments: AttachmentInfo[]) => void;
}

export function useProjectAttachments({
  signingMaterials,
  onUpdateAttachments,
}: UseProjectAttachmentsOptions) {
  // 从 signingMaterials 派生的基础附件列表
  const baseAttachments = useMemo<AttachmentInfo[]>(() => {
    if (!signingMaterials) return [];

    if (Array.isArray(signingMaterials)) {
      return signingMaterials.map((item: unknown) => {
        if (typeof item === "string") {
          const url = item;
          const ext = url.split(".").pop()?.toLowerCase() || "";
          let fileType: AttachmentInfo["fileType"] = "other";
          if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) fileType = "image";
          else if (["pdf"].includes(ext)) fileType = "pdf";
          else if (["xlsx", "xls", "csv"].includes(ext)) fileType = "excel";
          else if (["doc", "docx"].includes(ext)) fileType = "word";

          return {
            filename: url.split("/").pop() || "unknown",
            url,
            category: mapLegacyAttachmentCategory("other"),
            fileType,
            size: 0,
          };
        }
        const att = item as AttachmentInfo;
        return {
          filename: att.filename || "unknown",
          url: att.url,
          category: mapLegacyAttachmentCategory(att.category || "other"),
          fileType: att.fileType || "other",
          size: att.size ?? 0,
        };
      });
    }

    if (
      typeof signingMaterials === "object" &&
      signingMaterials !== null &&
      "attachments" in signingMaterials
    ) {
      return (signingMaterials as { attachments?: AttachmentInfo[] }).attachments || [];
    }
    return [];
  }, [signingMaterials]);

  // 本地 override：跟踪删除/上传的乐观更新，避免连续操作时基于 stale 的
  // signingMaterials 派生值计算。
  const [override, setOverride] = useState<AttachmentInfo[] | null>(null);
  // 当 signingMaterials 引用变化（父组件刷新）时重置 override，
  // 以权威的后端数据为准。使用 render-phase setState 模式（非 useEffect），
  // 避免 cascading render。
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [prevSigningMaterials, setPrevSigningMaterials] = useState(signingMaterials);
  if (prevSigningMaterials !== signingMaterials) {
    setPrevSigningMaterials(signingMaterials);
    setOverride(null);
  }

  const attachments = override ?? baseAttachments;

  const createHandlers = useCallback(
    (setPreviewImage: (url: string | null) => void): AttachmentHandlers => ({
      onPreview: (url, fileType) => {
        if (fileType === "image") setPreviewImage(url);
        else if (fileType === "pdf") window.open(url, "_blank");
      },
      onDownload: (url, filename) => {
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        toast.success("开始下载", { description: filename });
      },
      onDelete: onUpdateAttachments
        ? (url) => {
            const newAttachments = attachments.filter((att) => att.url !== url);
            setOverride(newAttachments);
            onUpdateAttachments(
              newAttachments.map((att) => ({
                filename: att.filename,
                url: att.url,
                category: att.category,
                fileType: att.fileType,
                size: att.size || 0,
              })),
            );
            toast.success("附件已删除");
          }
        : undefined,
    }),
    [attachments, onUpdateAttachments],
  );

  const onUpload = useCallback(
    (attachment: AttachmentInfo) => {
      if (!onUpdateAttachments) {
        toast.error("当前无法保存附件");
        return;
      }
      const newAttachments = [...attachments, attachment];
      setOverride(newAttachments);
      onUpdateAttachments(
        newAttachments.map((a) => ({
          filename: a.filename,
          url: a.url,
          category: a.category,
          fileType: a.fileType,
          size: a.size || 0,
        })),
      );
    },
    [attachments, onUpdateAttachments],
  );

  return { attachments, createHandlers, onUpload };
}
