"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Plus,
  FileText,
  RotateCcw,
  Save,
  Loader2,
  FileCheck,
  FileImage,
  Banknote,
  ClipboardCheck,
  File,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import type { Project, AttachmentInfo } from "../../../../../types";
import {
  getProjectDocumentsAction,
  createProjectDocumentAction,
  updateProjectDocumentAction,
  deleteProjectDocumentAction,
  initializeDocumentsAction,
  type DocumentResponse,
} from "../../../../../actions/documents";
import { DOCUMENT_CATEGORIES, type DocumentCategory } from "../../../constants";
import { DocumentCard, type DraftMap } from "./document-card";
import { DocumentCreateForm } from "./document-create-form";

interface DocumentsTabProps {
  project: Project;
  onUploadAttachment?: (attachment: AttachmentInfo) => void;
  /** 项目附件列表（用于已归档行 attach-chip 的附件计数） */
  attachments?: AttachmentInfo[];
  /** 打开上传弹窗（弹窗由 DefaultView 统一挂载，供附件库入口复用） */
  onOpenUpload: (doc: DocumentResponse) => void;
}

/** 6 类文书分组图标（对齐原型 .doc-group-head .ic） */
const CATEGORY_ICONS: Record<DocumentCategory, LucideIcon> = {
  contract_agreement: FileText,
  property_rights: FileCheck,
  identity_account: FileImage,
  finance_tax: Banknote,
  handover: ClipboardCheck,
  other: File,
};

/**
 * 文书签收 Tab（V4.2 · 设计稿 1:1）— 文书签收清单卡
 * 卡头（标题/副题/新增文书/保存 textlink）→ 三态图例 → 6 类 doc-group 分组
 * （图标 + 名称 + 计数 pill + 行内编辑行），空分组渲染虚线提示行。
 * 行内编辑：三个状态 pill 按钮 + 日期 input，右上角统一保存（textlink 形态）。
 */
export function DocumentsTab({
  project,
  onUploadAttachment,
  attachments,
  onOpenUpload,
}: DocumentsTabProps) {
  const [docs, setDocs] = useState<DocumentResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [saving, setSaving] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<DocumentCategory>("contract_agreement");
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

  return (
    <section className="rounded-cards bg-pure-white p-6 font-sohne shadow-steep">
      {/* 卡头（原型 .card-head）：标题 + 副题 + 新增文书 / 保存 textlink */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-medium text-ink">文书签收清单</h3>
          <p className="mt-0.5 text-[13px] font-[430] text-graphite">
            6 类要件 · 归档后可挂附件 · 变更后批量保存
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-[450] text-ink hover:underline hover:underline-offset-4"
          >
            <Plus className="h-3.5 w-3.5" />
            新增文书
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!hasDirty || saving}
            className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-[450] text-ink hover:underline hover:underline-offset-4 disabled:cursor-default disabled:text-dove disabled:hover:no-underline"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>

      {/* 三态图例（原型 .doc-legend / .doc-state）：pill + 说明文字 */}
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 pb-2.5 text-[13px] font-[430] text-graphite">
        <span className="inline-flex items-center rounded-full bg-[#f0f0f2] px-2.5 py-1 text-[13px] font-[450] whitespace-nowrap text-ash">
          未签署
        </span>
        <span>待业主签署</span>
        <span className="inline-flex items-center rounded-full bg-sky-wash px-2.5 py-1 text-[13px] font-[450] whitespace-nowrap text-[#2c4a78]">
          已签署
        </span>
        <span>待归档登记</span>
        <span className="inline-flex items-center rounded-full bg-apricot-wash px-2.5 py-1 text-[13px] font-[450] whitespace-nowrap text-rust">
          已归档
        </span>
        <span>可上传附件文件</span>
      </div>

      {loading ? (
        <div className="py-16 text-center text-muted-foreground">加载中...</div>
      ) : docs.length === 0 ? (
        // 空状态（保留初始化默认清单功能）
        <div className="space-y-4 py-12 text-center text-muted-foreground">
          <FileText className="mx-auto h-16 w-16 opacity-30" />
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
      ) : (
        <>
          {/* 新增表单（内联折叠） */}
          {isCreateOpen && (
            <div className="mb-3 space-y-2 rounded-[16px] border border-[#e2e2e5] p-4">
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

          {/* 文书列表：按 6 类分组（doc-group 容器），行内编辑；空分组渲染虚线提示行 */}
          <div className="space-y-3">
            {DOCUMENT_CATEGORIES.map((cat) => {
              const items = docs
                .filter((d) => d.category === cat.value)
                .sort((a, b) => a.display_order - b.display_order);
              const GroupIcon = CATEGORY_ICONS[cat.value] ?? File;
              return (
                <div
                  key={cat.value}
                  className="rounded-[16px] border border-[#efeff1] px-[18px] py-4"
                >
                  {/* 分组头（原型 .doc-group-head）：图标块 + 标题 + 计数 pill */}
                  <div className="mb-1.5 flex items-center gap-2.5">
                    <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[10px] bg-fog text-ash">
                      <GroupIcon className="h-[15px] w-[15px]" />
                    </span>
                    <span className="flex-1 text-[14.5px] font-medium text-ink">{cat.label}</span>
                    <span className="shrink-0 rounded-full bg-fog px-2.5 py-[3px] text-xs font-[430] text-graphite">
                      {items.length} 份
                    </span>
                  </div>

                  {items.length === 0 ? (
                    // 空分组提示（原型虚线 doc-row）：房屋交接文件组给专属文案
                    <div className="border-b border-dashed border-[#ececef] py-[9px] text-sm font-[430] text-graphite">
                      {cat.value === "handover"
                        ? "交房确认后自动生成「物业交割单」要件"
                        : "暂无要件 · 可「新增文书」或初始化默认清单"}
                    </div>
                  ) : (
                    items.map((doc) => {
                      const draft = drafts[doc.id];
                      if (!draft) return null;
                      const showUpload =
                        draft.signoff_status === "archived" && Boolean(onUploadAttachment);
                      const attachmentCount =
                        attachments?.filter((a) => a.category === doc.category).length ?? 0;
                      return (
                        <DocumentCard
                          key={doc.id}
                          doc={doc}
                          draft={draft}
                          showUpload={showUpload}
                          attachmentCount={attachmentCount}
                          onStatusChange={handleStatusChange}
                          onUpdateDraft={updateDraft}
                          onDelete={setDeleteTarget}
                          onUpload={onOpenUpload}
                        />
                      );
                    })
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

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
    </section>
  );
}
