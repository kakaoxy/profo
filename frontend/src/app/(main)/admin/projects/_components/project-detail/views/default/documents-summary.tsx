"use client";

import { useEffect, useState } from "react";
import { ChevronRight, FileText } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getProjectDocumentsAction, type DocumentResponse } from "../../../../actions/documents";
import { CATEGORY_LABELS } from "../../constants";
import { DocumentsTab } from "./tabs/documents-tab";
import { AttachmentsTab } from "./tabs/attachments-tab";
import type { AttachmentHandlers, AttachmentInfo, Project } from "../../../../types";
import { PROJECT_SECTION_IDS } from "../../../../[projectId]/_components/page-shell/config";

interface DocumentsSummaryProps {
  project: Project;
  attachments: AttachmentInfo[];
  handlers: AttachmentHandlers;
  readOnly?: boolean;
  onUploadAttachment?: (attachment: AttachmentInfo) => void;
  onOpenUpload: (doc: DocumentResponse) => void;
  onUpload?: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  unsigned: "待签署",
  signed: "已签署",
  archived: "已归档",
};

export function DocumentsSummary({
  project,
  attachments,
  handlers,
  readOnly = false,
  onUploadAttachment,
  onOpenUpload,
  onUpload,
}: DocumentsSummaryProps) {
  const [docs, setDocs] = useState<DocumentResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getProjectDocumentsAction(project.id)
      .then((result) => {
        if (!cancelled) setDocs(result || []);
      })
      .catch(() => {
        if (!cancelled) setDocs([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  const signedCount = docs.filter(
    (doc) => doc.signoff_status === "signed" || doc.signoff_status === "archived",
  ).length;

  return (
    <section id={PROJECT_SECTION_IDS.documents} className="scroll-mt-28 md:scroll-mt-24">
      <div className="rounded-cards bg-pure-white p-6 font-sohne shadow-steep">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-medium text-ink">文书与附件</h3>
            <p className="mt-0.5 text-[13px] font-[430] text-graphite">
              {loading ? "正在读取要件..." : `${docs.length} 份要件 · ${signedCount} 份已签收`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex shrink-0 items-center gap-1 text-[13px] font-[450] text-ink transition-colors hover:text-rust"
          >
            查看全部
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-11 animate-pulse rounded-[12px] bg-fog" />
            ))}
          </div>
        ) : docs.length > 0 ? (
          <div className="divide-y divide-[#f0f0f2]">
            {docs.slice(0, 4).map((doc) => (
              <div key={doc.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-fog text-graphite">
                  <FileText className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-[480] text-ink">
                    {doc.document_name}
                  </span>
                  <span className="mt-0.5 block text-[9.5px] text-dove">
                    {CATEGORY_LABELS[doc.category] ?? doc.category}
                    {doc.archive_date ? ` · ${doc.archive_date}` : ""}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-[450] ${
                    doc.signoff_status === "archived"
                      ? "bg-apricot-wash text-rust"
                      : doc.signoff_status === "signed"
                        ? "bg-sky-wash text-[#2c4a78]"
                        : "bg-fog text-dove"
                  }`}
                >
                  {STATUS_LABELS[doc.signoff_status] ?? "待签署"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-[14px] border border-dashed border-dove/50 py-8 text-center text-[13px] text-graphite">
            暂无文书要件
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88vh] max-w-[1000px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>文书与附件</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <DocumentsTab
              project={project}
              readOnly={readOnly}
              attachments={attachments}
              onUploadAttachment={onUploadAttachment}
              onOpenUpload={onOpenUpload}
            />
            <AttachmentsTab attachments={attachments} handlers={handlers} onUpload={onUpload} />
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
