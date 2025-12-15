"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProjectSummary } from "../project-summary";
import { InfoTab } from "../tabs/info-tab";
import { AttachmentsTab } from "../tabs/attachments-tab";
// [修复] 引入 AttachmentInfo 和 AttachmentHandlers
import { Project, AttachmentHandlers, AttachmentInfo } from "../../../types";

interface DefaultViewProps {
  project: Project;
  // [修复] 将 any[] 替换为具体的 AttachmentInfo[]
  attachments: AttachmentInfo[];
  handlers: AttachmentHandlers;
}

export function DefaultView({
  project,
  attachments,
  handlers,
}: DefaultViewProps) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">
      <ProjectSummary project={project} />

      <Tabs defaultValue="info" className="w-full">
        {/* 方案 A: 恢复默认的“胶囊/方块”风格 */}
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="info">项目信息</TabsTrigger>
          <TabsTrigger value="attachments">
            附件 {attachments.length > 0 && `(${attachments.length})`}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="mt-4 focus-visible:outline-none">
          <InfoTab project={project} />
        </TabsContent>

        <TabsContent
          value="attachments"
          className="mt-4 focus-visible:outline-none"
        >
          <AttachmentsTab attachments={attachments} handlers={handlers} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
