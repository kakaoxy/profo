"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProjectSummary } from "./summary";
import { InfoTab } from "./tabs/info-tab";
import { DocumentsAttachmentsTab } from "./tabs/documents-attachments-tab";
import { HandoverDialog } from "./handover-dialog";
import { Project, AttachmentHandlers, AttachmentInfo } from "../../../../types";

interface DefaultViewProps {
  project: Project;
  attachments: AttachmentInfo[];
  handlers: AttachmentHandlers;
  onUpdateAttachments?: (attachments: AttachmentInfo[]) => void;
  onHandoverSuccess: () => void;
}

export function DefaultView({
  project,
  attachments,
  handlers,
  onUpdateAttachments,
  onHandoverSuccess,
}: DefaultViewProps) {
  const showHandoverButton =
    project.status === "signing" || project.status === "签约";
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">
      <ProjectSummary project={project} />

      <Tabs defaultValue="info" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="info">项目信息</TabsTrigger>
          <TabsTrigger value="documents">
            文书与附件 {attachments.length > 0 ? `(${attachments.length})` : ""}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="mt-4 focus-visible:outline-none">
          <InfoTab project={project} />
        </TabsContent>

        <TabsContent value="documents" className="mt-4 focus-visible:outline-none">
          <DocumentsAttachmentsTab
            project={project}
            attachments={attachments}
            handlers={handlers}
            onUpdateAttachments={onUpdateAttachments}
          />
        </TabsContent>
      </Tabs>
      {/* [新增] 底部操作区 */}
      {showHandoverButton && (
        <div className="mt-8 pt-6 border-t border-dashed">
          <HandoverDialog project={project} onSuccess={onHandoverSuccess} />
        </div>
      )}
    </div>
  );
}
