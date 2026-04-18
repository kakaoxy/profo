"use client";

import { useMemo, useCallback } from "react";
import { toast } from "sonner";
import type { AttachmentInfo, AttachmentHandlers } from "../types";

interface UseProjectAttachmentsOptions {
  signingMaterials: unknown;
  onUpdateAttachments?: (attachments: AttachmentInfo[]) => void;
}

export function useProjectAttachments({
  signingMaterials,
  onUpdateAttachments,
}: UseProjectAttachmentsOptions) {
  const attachments = useMemo<AttachmentInfo[]>(() => {
    if (!signingMaterials) return [];

    if (Array.isArray(signingMaterials)) {
      return signingMaterials.map((item: unknown) => {
        if (typeof item === "string") {
          const url = item;
          const ext = url.split(".").pop()?.toLowerCase() || "";
          let fileType: AttachmentInfo["fileType"] = "other";
          if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext))
            fileType = "image";
          else if (["pdf"].includes(ext)) fileType = "pdf";
          else if (["xlsx", "xls", "csv"].includes(ext)) fileType = "excel";
          else if (["doc", "docx"].includes(ext)) fileType = "word";

          return {
            filename: url.split("/").pop() || "unknown",
            url,
            category: "other",
            fileType,
          };
        }
        const att = item as AttachmentInfo;
        return {
          filename: att.filename || "unknown",
          url: att.url,
          category: att.category || "other",
          fileType: att.fileType || "other",
          size: att.size,
        };
      });
    }

    if (
      typeof signingMaterials === "object" &&
      signingMaterials !== null &&
      "attachments" in signingMaterials
    ) {
      return (
        (signingMaterials as { attachments?: AttachmentInfo[] }).attachments ||
        []
      );
    }
    return [];
  }, [signingMaterials]);

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

  return { attachments, createHandlers };
}
