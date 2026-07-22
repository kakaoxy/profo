"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, FileText, RotateCcw, Save, Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileUploader as CommonFileUploader, compressImage } from "@/components/common/upload";
import type { UploadResponse } from "@/components/common/upload";
import type { Project, AttachmentInfo } from "../../../../../types";
import {
  ATTACHMENT_CATEGORIES,
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
  getFileType,
  type AttachmentCategory,
} from "../../../../create-project/attachment-types";
import {
  getProjectDocumentsAction,
  createProjectDocumentAction,
  updateProjectDocumentAction,
  deleteProjectDocumentAction,
  initializeDocumentsAction,
  type DocumentResponse,
} from "../../../../../actions/documents";

interface DocumentsTabProps {
  project: Project;
  onUploadAttachment?: (attachment: AttachmentInfo) => void;
}

const STATUS_OPTIONS = [
  { value: "unsigned", label: "未签署" },
  { value: "signed", label: "签署" },
  { value: "archived", label: "归档" },
] as const;

/** 行内编辑状态：记录每行 draft 值，按 document.id 索引 */
type DraftMap = Record<string, { signoff_status: string; archive_date: string }>;

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
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<AttachmentCategory>("signing_contract");
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
      draft.signoff_status !== d.signoff_status ||
      draft.archive_date !== (d.archive_date || "")
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

  const handleSave = async () => {
    const dirty = docs.filter((d) => {
      const draft = drafts[d.id];
      return (
        draft &&
        (draft.signoff_status !== d.signoff_status ||
          draft.archive_date !== (d.archive_date || ""))
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
      });
      toast.success("新增成功");
      setNewName("");
      setIsCreateOpen(false);
      loadDocs();
    } catch {
      toast.error("新增失败");
    }
  };

  const handleDelete = (doc: DocumentResponse) => {
    setDeleteTarget(doc);
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
      category: uploadCategory,
      fileType: fileType || "other",
      size: response.size || 0,
    };
    onUploadAttachment?.(attachment);
    // 不调 loadDocs()：上传文件只更新 signing_materials（附件），
    // 不影响文书签收清单。loadDocs() 会重置 drafts，导致用户未保存的
    // 归档状态丢失。
    setIsUploadOpen(false);
  };

  if (loading) {
    return (
      <div className="text-center py-16 text-muted-foreground">加载中...</div>
    );
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
          <div className="mx-auto max-w-sm space-y-2 rounded-md border p-4 text-left">
            <Label>文书名称</Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="如：补充协议"
              autoFocus
            />
            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setNewName("");
                  setIsCreateOpen(false);
                }}
              >
                取消
              </Button>
              <Button type="button" size="sm" onClick={handleCreate}>
                新增
              </Button>
            </div>
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
        <Button
          type="button"
          size="sm"
          onClick={handleSave}
          disabled={!hasDirty || saving}
        >
          <Save className="mr-1 h-4 w-4" />
          {saving ? "保存中..." : "保存"}
        </Button>
      </div>

      {/* 新增表单（内联折叠） */}
      {isCreateOpen && (
        <div className="space-y-2 rounded-md border p-4">
          <Label>文书名称</Label>
          <div className="flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="如：补充协议"
              autoFocus
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setNewName("");
                setIsCreateOpen(false);
              }}
            >
              取消
            </Button>
            <Button type="button" size="sm" onClick={handleCreate}>
              新增
            </Button>
          </div>
        </div>
      )}

      {/* 文书列表：行内编辑（网格布局，固定列宽） */}
      <div className="space-y-2">
        {docs.map((doc, index) => {
          const draft = drafts[doc.id];
          if (!draft) return null;
          const isDirty =
            draft.signoff_status !== doc.signoff_status ||
            draft.archive_date !== (doc.archive_date || "");
          const isArchived = draft.signoff_status === "archived";
          const showUpload = isArchived && Boolean(onUploadAttachment);
          return (
            <div
              key={doc.id}
              className={cn(
                "grid items-center gap-3 rounded-md border px-4 py-3 transition-colors",
                isDirty ? "border-ink/40 bg-fog/30" : "hover:bg-accent/50",
                showUpload
                  ? "[grid-template-columns:24px_minmax(120px,1fr)_auto_160px_auto_32px]"
                  : isArchived
                    ? "[grid-template-columns:24px_minmax(120px,1fr)_auto_160px_32px]"
                    : "[grid-template-columns:24px_minmax(120px,1fr)_auto_120px_32px]",
              )}
            >
              {/* 序号 */}
              <span className="text-muted-foreground text-sm">
                {index + 1}.
              </span>

              {/* 名称 */}
              <span className="font-medium truncate" title={doc.document_name}>
                {doc.document_name}
              </span>

              {/* 三个状态 pill 按钮 */}
              <div className="flex gap-1.5">
                {STATUS_OPTIONS.map((opt) => {
                  const active = draft.signoff_status === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleStatusChange(doc.id, opt.value)}
                      className={`inline-flex items-center rounded-full px-3 py-1 text-[12px] font-medium cursor-pointer transition-all border whitespace-nowrap ${
                        active
                          ? "bg-ink text-pure-white border-ink"
                          : "bg-pure-white text-graphite border-dove/50 hover:border-dove hover:bg-fog/50"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              {/* 归档日期：archived 时显示 date input，其他状态显示文本 */}
              {isArchived ? (
                <Input
                  type="date"
                  value={draft.archive_date}
                  onChange={(e) =>
                    updateDraft(doc.id, { archive_date: e.target.value })
                  }
                  className="h-8 text-[13px] w-full"
                />
              ) : (
                <span className="text-sm text-muted-foreground text-right truncate">
                  {doc.archive_date || "—"}
                </span>
              )}

              {/* 上传文件（仅归档文书） */}
              {showUpload && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => setIsUploadOpen(true)}
                >
                  <Upload className="mr-1 h-3.5 w-3.5" />
                  上传文件
                </Button>
              )}

              {/* 删除 */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => handleDelete(doc)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          );
        })}
      </div>

      {/* 文件上传弹窗（归档文书） */}
      <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>上传文件</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground">选择分类：</span>
            <Select
              value={uploadCategory}
              onValueChange={(v) => setUploadCategory(v as AttachmentCategory)}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="选择附件分类" />
              </SelectTrigger>
              <SelectContent>
                {ATTACHMENT_CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <CommonFileUploader
            options={{
              maxSize: MAX_FILE_SIZE,
              allowedTypes: ALLOWED_MIME_TYPES,
              multiple: true,
              validateFile: (file) => {
                const ext = file.name
                  .toLowerCase()
                  .slice(file.name.lastIndexOf("."));
                const allowedExts = ALLOWED_EXTENSIONS.split(",");
                if (!allowedExts.includes(ext)) {
                  return "不支持的文件格式";
                }
                return null;
              },
              beforeUpload: (file) =>
                file.type.startsWith("image/") ? compressImage(file) : file,
            }}
            onUploadComplete={handleUploadComplete}
            title="点击或拖拽文件到此处上传"
            description="支持多文件上传，Excel、图片、PDF、Word 格式，单文件最大 10MB"
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
            <AlertDialogDescription>
              此操作将删除该文书，删除后不可恢复。
            </AlertDialogDescription>
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
