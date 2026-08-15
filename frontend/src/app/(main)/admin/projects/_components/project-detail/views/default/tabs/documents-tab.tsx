"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, FileText, RotateCcw, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { FileUploader as CommonFileUploader, compressImage } from "@/components/common/upload";
import type { UploadResponse } from "@/components/common/upload";
import type { Project, AttachmentInfo } from "../../../../../types";
import { ALLOWED_MIME_TYPES, attachmentValidateFile, getFileType } from "../../../attachment-types";
import { CATEGORY_LABELS, type DocumentCategory } from "../../../constants";
import {
  getProjectDocumentsAction,
  createProjectDocumentAction,
  updateProjectDocumentAction,
  deleteProjectDocumentAction,
  initializeDocumentsAction,
  type DocumentResponse,
} from "../../../../../actions/documents";
import { DOCUMENT_CATEGORIES } from "../../../constants";
import { DocumentCard, type DraftMap } from "./document-card";
import { DocumentCreateForm } from "./document-create-form";

interface DocumentsTabProps {
  project: Project;
  onUploadAttachment?: (attachment: AttachmentInfo) => void;
}

/**
 * 文书签收 Tab - 管理项目文书签收清单
 * 行内编辑：三个状态 pill 按钮 + 日期 input，右上角统一保存
 */
export function DocumentsTab({ project, onUploadAttachment }: DocumentsTabProps) {
  const [docs, setDocs] = useState<DocumentResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [saving, setSaving] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<DocumentCategory>("contract_agreement");
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadTargetDoc, setUploadTargetDoc] = useState<DocumentResponse | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocumentResponse | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadDocs = useCallback(async () => {
    try {
      const result = await getProjectDocumentsAction(project.id);
      setDocs(result || []);
      // 重置 draft 为已保存值
      const next: DraftMap = {};
      (result || []).forEach((d) => {
        next[d.id] = {
          signoff_status: d.signoff_status,
          archive_date: d.archive_date || "",
        };
      });
      setDrafts(next);
    } catch {
      toast.error("加载文书列表失败");
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  const businessForm = project.business_form;
  const hasBusinessForm = Boolean(businessForm);

  /** 当前是否有未保存的改动 */
  const hasDirty = docs.some((d) => {
    const draft = drafts[d.id];
    if (!draft) return false;
    return (
      draft.signoff_status !== d.signoff_status || draft.archive_date !== (d.archive_date || "")
    );
  });

  const updateDraft = (docId: string, patch: Partial<DraftMap[string]>) => {
    setDrafts((prev) => ({
      ...prev,
      [docId]: { ...prev[docId], ...patch },
    }));
  };

  /** 切换状态：归档时若 archive_date 为空则默认今天；切回未签署则清空日期 */
  const handleStatusChange = (docId: string, newStatus: string) => {
    const draft = drafts[docId];
    if (!draft) return;
    const patch: Partial<DraftMap[string]> = { signoff_status: newStatus };
    if (newStatus === "archived" && !draft.archive_date) {
      patch.archive_date = new Date().toISOString().slice(0, 10);
    }
    if (newStatus === "unsigned") {
      patch.archive_date = "";
    }
    updateDraft(docId, patch);
  };

  const resetCreateForm = () => {
    setNewName("");
    setNewCategory("contract_agreement");
    setIsCreateOpen(false);
  };

  const handleSave = async () => {
    const dirty = docs.filter((d) => {
      const draft = drafts[d.id];
      return (
        draft &&
        (draft.signoff_status !== d.signoff_status || draft.archive_date !== (d.archive_date || ""))
      );
    });
    if (dirty.length === 0) {
      toast.info("没有改动需要保存");
      return;
    }
    setSaving(true);
    try {
      await Promise.all(
        dirty.map((d) => {
          const draft = drafts[d.id];
          const payload: Record<string, string> = {
            signoff_status: draft.signoff_status,
          };
          if (draft.signoff_status === "archived" && draft.archive_date) {
            payload.archive_date = draft.archive_date;
          }
          return updateProjectDocumentAction(project.id, d.id, payload);
        }),
      );
      toast.success(`已保存 ${dirty.length} 项改动`);
      await loadDocs();
    } catch {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) {
      toast.error("请输入文书名称");
      return;
    }
    try {
      await createProjectDocumentAction(project.id, {
        document_name: newName.trim(),
        category: newCategory,
      });
      toast.success("新增成功");
      resetCreateForm();
      loadDocs();
    } catch {
      toast.error("新增失败");
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteProjectDocumentAction(project.id, deleteTarget.id);
      toast.success("删除成功");
      setDeleteTarget(null);
      loadDocs();
    } catch {
      toast.error("删除失败");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleInitialize = async () => {
    try {
      const result = await initializeDocumentsAction(project.id);
      toast.success(`已初始化 ${result.initialized_count} 项文书`);
      loadDocs();
    } catch {
      toast.error("初始化失败");
    }
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
    onUploadAttachment?.(attachment);
    // 不调 loadDocs()：上传文件只更新 signing_materials（附件），
    // 不影响文书签收清单。loadDocs() 会重置 drafts，导致用户未保存的
    // 归档状态丢失。
    setIsUploadOpen(false);
    setUploadTargetDoc(null);
  };

  if (loading) {
    return <div className="text-center py-16 text-muted-foreground">加载中...</div>;
  }

  // 空状态
  if (docs.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground space-y-4">
        <FileText className="h-16 w-16 mx-auto opacity-30" />
        <p className="text-lg">暂无文书</p>
        {hasBusinessForm ? (
          <div className="flex items-center justify-center gap-2">
            <Button type="button" variant="outline" onClick={handleInitialize}>
              <RotateCcw className="mr-2 h-4 w-4" />
              初始化默认清单
            </Button>
            <Button type="button" variant="outline" onClick={() => setIsCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              新增文书
            </Button>
          </div>
        ) : (
          <p className="text-sm">请先在基础信息设置业务形式</p>
        )}
        {isCreateOpen && (
          <div className="mx-auto max-w-md space-y-2 rounded-md border p-4 text-left">
            <DocumentCreateForm
              name={newName}
              category={newCategory}
              onNameChange={setNewName}
              onCategoryChange={setNewCategory}
              onSubmit={handleCreate}
              onCancel={resetCreateForm}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 顶部操作栏：新增 + 保存 */}
      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" size="sm" onClick={() => setIsCreateOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          新增文书
        </Button>
        <Button type="button" size="sm" onClick={handleSave} disabled={!hasDirty || saving}>
          <Save className="mr-1 h-4 w-4" />
          {saving ? "保存中..." : "保存"}
        </Button>
      </div>

      {/* 新增表单（内联折叠） */}
      {isCreateOpen && (
        <div className="space-y-2 rounded-md border p-4">
          <DocumentCreateForm
            name={newName}
            category={newCategory}
            onNameChange={setNewName}
            onCategoryChange={setNewCategory}
            onSubmit={handleCreate}
            onCancel={resetCreateForm}
          />
        </div>
      )}

      {/* 文书列表：按 6 类分组，行内编辑（网格布局，固定列宽） */}
      <div className="space-y-4">
        {DOCUMENT_CATEGORIES.map((cat) => {
          const items = docs
            .filter((d) => d.category === cat.value)
            .sort((a, b) => a.display_order - b.display_order);
          if (items.length === 0) return null;
          return (
            <div key={cat.value} className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                {cat.label}
                <Badge variant="secondary" className="text-xs">
                  {items.length}
                </Badge>
              </div>
              <div className="space-y-2">
                {items.map((doc, index) => {
                  const draft = drafts[doc.id];
                  if (!draft) return null;
                  const showUpload =
                    draft.signoff_status === "archived" && Boolean(onUploadAttachment);
                  return (
                    <DocumentCard
                      key={doc.id}
                      doc={doc}
                      index={index}
                      draft={draft}
                      showUpload={showUpload}
                      onStatusChange={handleStatusChange}
                      onUpdateDraft={updateDraft}
                      onDelete={setDeleteTarget}
                      onUpload={(d) => {
                        setUploadTargetDoc(d);
                        setIsUploadOpen(true);
                      }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* 文件上传弹窗（归档文书）：分类继承自目标文书 */}
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

      {/* 删除确认弹窗 */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除「{deleteTarget?.document_name}」？</AlertDialogTitle>
            <AlertDialogDescription>此操作将删除该文书，删除后不可恢复。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  删除中…
                </>
              ) : (
                "确认删除"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
