"use client";

import { useEffect, useMemo, useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import type { AttachmentInfo, AttachmentHandlers, AttachmentSaveOptions } from "../types";
import { mapLegacyAttachmentCategory } from "../constants";

interface UseProjectAttachmentsOptions {
  signingMaterials: unknown;
  onUpdateAttachments?: (
    attachments: AttachmentInfo[],
    options?: AttachmentSaveOptions,
  ) => void | Promise<void>;
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

  // 当前附件列表的镜像 ref：串行队列任务从这里读取最新值。
  // 直接在任务里读 attachments 闭包会拿到任务创建时的旧值（正是本次 bug 的根因），
  // 而 setOverride 更新函数必须为纯函数（StrictMode 会双调用），不能在里面发请求。
  const currentRef = useRef<AttachmentInfo[]>([]);
  currentRef.current = override ?? baseAttachments;

  // 附件写操作串行队列（bug 修复）：多文件上传时每个文件完成后都会调用 onUpload，
  // 若并发执行，各回调闭包中的 attachments 均为旧值，后完成的 PUT 会整体
  // 覆写 signing_materials，导致先上传的附件丢失（日志实证：连发 7 个 PUT
  // 后 7 张图只落库 4 张）。队列化后写操作串行执行且始终基于最新列表；
  // 任务内 await 保存动作（server action），保证服务端按提交顺序落库，
  // 旧快照不会反超。删除走同一队列并携带显式删除信号（后端按 url 移除，
  // 避免旧快照覆写复活已删项）；组件卸载后待执行任务静默丢弃（仅内存态）。
  const mutationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      mutationQueueRef.current = Promise.resolve();
    };
  }, []);

  const enqueueMutation = useCallback(
    (
      mutate: (current: AttachmentInfo[]) => {
        next: AttachmentInfo[];
        options?: AttachmentSaveOptions;
      },
    ) => {
      const run = async () => {
        // 卸载后不再触发保存请求
        if (!aliveRef.current) return;
        const { next, options } = mutate(currentRef.current);
        currentRef.current = next;
        setOverride(next);
        await onUpdateAttachments?.(
          next.map((a) => ({
            filename: a.filename,
            url: a.url,
            category: a.category,
            fileType: a.fileType,
            size: a.size || 0,
          })),
          options,
        );
      };
      const task = mutationQueueRef.current.then(run, run);
      // 任务失败不阻塞后续任务，但控制台保留错误便于排查
      mutationQueueRef.current = task.catch((err: unknown) => {
        console.error("[useProjectAttachments] 附件保存失败:", err);
      });
    },
    [onUpdateAttachments],
  );

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
            enqueueMutation((current) => ({
              next: current.filter((att) => att.url !== url),
              options: { removedUrls: [url] },
            }));
            toast.success("附件已删除");
          }
        : undefined,
    }),
    [enqueueMutation, onUpdateAttachments],
  );

  const onUpload = useCallback(
    (attachment: AttachmentInfo) => {
      if (!onUpdateAttachments) {
        toast.error("当前无法保存附件");
        return;
      }
      enqueueMutation((current) => ({ next: [...current, attachment] }));
    },
    [enqueueMutation, onUpdateAttachments],
  );

  return { attachments, createHandlers, onUpload };
}
