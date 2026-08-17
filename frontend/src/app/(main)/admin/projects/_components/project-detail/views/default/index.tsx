"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { FileUploader as CommonFileUploader, compressImage } from "@/components/common/upload";
import type { UploadResponse } from "@/components/common/upload";

import { ProjectSummary } from "./summary";
import { InfoTab } from "./tabs/info-tab";
import { DocumentsTab } from "./tabs/documents-tab";
import { AttachmentsTab } from "./tabs/attachments-tab";
import { ALLOWED_MIME_TYPES, attachmentValidateFile, getFileType } from "../../attachment-types";
import { CATEGORY_LABELS } from "../../constants";
import type { DocumentResponse } from "../../../../actions/documents";
import type { Project, AttachmentInfo, AttachmentHandlers } from "../../../../types";
import { PROJECT_SECTION_IDS } from "../../../../[projectId]/_components/page-shell/config";

interface DefaultViewProps {
  project: Project;
  attachments: AttachmentInfo[];
  handlers: AttachmentHandlers;
  onUpdateAttachments?: (attachments: AttachmentInfo[]) => void;
  onUploadAttachment?: (attachment: AttachmentInfo) => void;
  /** 项目信息卡「编辑」textlink（旧抽屉链路：联动页面级编辑弹窗；inlineEditable 时不使用） */
  onEditProject?: () => void;
  /**
   * V4.3 就地编辑能力标志 + 保存成功回调（页面层局部刷新数据）。
   * 传入后项目信息卡「编辑」切换为卡片内就地编辑（不再弹窗）；不传则保持旧抽屉弹窗链路。
   */
  onProjectSaved?: () => void;
  /** 页面级用户列表（userId → 展示名），就地编辑的项目负责人下拉复用 */
  usersById?: Map<string, string>;
  /** 外部触发进入项目信息卡编辑态（顶栏「编辑」：递增计数 + 滚动锚点） */
  editRequest?: number;
  /**
   * 交房成功回调（历史 prop）：交房 CTA 已由页面级 flowbar 驱动页面级受控弹窗实例，
   * 视图内不再消费；保留此 prop 兼容页面层传参。
   */
  onHandoverSuccess?: () => void;
}

/**
 * 签约阶段视图（V4.2 · 设计稿 1:1 还原）
 *
 * 顺序渲染（去掉 Tabs 双 tab 切换，对齐设计稿滚动式布局）：
 * 1. KPI 行（ProjectSummary，暖/冷 wash 数据卡）
 * 2. 项目信息卡（InfoTab 自带卡容器：房源 / 业主 / 合同要件 / 公用事业户号 + 交易数据兜底）
 * 3. 文书签收清单卡（DocumentsTab 自带卡容器，documents 锚点）
 * 4. 附件库卡（AttachmentsTab 自带卡容器）
 *
 * 文件上传弹窗统一挂载于此：文书行 attach-chip 与附件库卡头「上传附件」共用同一弹窗流程
 * （分类继承自目标文书，无目标时归入「其他文件」）。
 */
export function DefaultView({
  project,
  attachments,
  handlers,
  onUpdateAttachments,
  onUploadAttachment,
  onEditProject,
  onProjectSaved,
  usersById,
  editRequest,
}: DefaultViewProps) {
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadTargetDoc, setUploadTargetDoc] = useState<DocumentResponse | null>(null);

  // 当未提供 hook 管理的 onUploadAttachment 时，回退到直接拼接
  // （不维护 override，存在 stale 风险，仅用于兼容无 hook 场景）
  const handleUploadAttachment = (attachment: AttachmentInfo) => {
    if (!onUpdateAttachments) {
      toast.error("当前无法保存附件");
      return;
    }
    const newAttachments = [...attachments, attachment];
    onUpdateAttachments(
      newAttachments.map((a) => ({
        filename: a.filename,
        url: a.url,
        category: a.category,
        fileType: a.fileType,
        size: a.size || 0,
      })),
    );
  };

  const uploadHandler =
    onUploadAttachment ?? (onUpdateAttachments ? handleUploadAttachment : undefined);

  const openUploadDialog = (doc: DocumentResponse | null) => {
    setUploadTargetDoc(doc);
    setIsUploadOpen(true);
  };

  const handleUploadComplete = (response: UploadResponse, file: File) => {
    const fileType = getFileType(file.name);
    if (!response.url) return;
    const attachment: AttachmentInfo = {
      filename: file.name,
      url: response.url,
      category: uploadTargetDoc?.category ?? "other",
      fileType: fileType || "other",
      size: response.size || 0,
    };
    uploadHandler?.(attachment);
    setIsUploadOpen(false);
    setUploadTargetDoc(null);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">
      <ProjectSummary project={project} />

      {/* 项目信息卡（InfoTab 自带卡容器；V4.3 就地编辑：onProjectSaved 传入时卡片内编辑） */}
      <InfoTab
        project={project}
        onEdit={onEditProject}
        inlineEditable={!!onProjectSaved}
        onInlineSaved={onProjectSaved}
        usersById={usersById}
        editRequest={editRequest}
      />

      {/* 文书签收清单卡（分区导航「文书与附件」锚点） */}
      <section id={PROJECT_SECTION_IDS.documents} className="scroll-mt-28 md:scroll-mt-24">
        <DocumentsTab
          project={project}
          onUploadAttachment={uploadHandler}
          attachments={attachments}
          onOpenUpload={openUploadDialog}
        />
      </section>

      {/* 附件库卡 */}
      <AttachmentsTab
        attachments={attachments}
        handlers={handlers}
        onUpload={uploadHandler ? () => openUploadDialog(null) : undefined}
      />

      {/* 文件上传弹窗（归档文书 / 附件库卡头共用）：分类继承自目标文书 */}
      <Dialog
        open={isUploadOpen}
        onOpenChange={(open) => {
          setIsUploadOpen(open);
          if (!open) setUploadTargetDoc(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>上传文件</DialogTitle>
          </DialogHeader>
          {uploadTargetDoc && (
            <p className="text-sm text-muted-foreground">
              上传至「{uploadTargetDoc.document_name}」（分类：
              {CATEGORY_LABELS[uploadTargetDoc.category] ?? uploadTargetDoc.category}）
            </p>
          )}
          <CommonFileUploader
            options={{
              allowedTypes: ALLOWED_MIME_TYPES,
              multiple: true,
              validateFile: attachmentValidateFile,
              beforeUpload: (file) => (file.type.startsWith("image/") ? compressImage(file) : file),
            }}
            onUploadComplete={handleUploadComplete}
            title="点击或拖拽文件到此处上传"
            description="支持多文件上传，Excel、图片、PDF、Word、视频格式，文档/图片最大 100MB，视频最大 500MB"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
