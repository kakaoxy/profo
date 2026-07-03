"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, FileText, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { Project } from "../../../../../types";
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
export function DocumentsTab({ project }: DocumentsTabProps) {
  const [docs, setDocs] = useState<DocumentResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [saving, setSaving] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");

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

  const handleDelete = async (doc: DocumentResponse) => {
    if (!confirm(`确认删除「${doc.document_name}」？`)) return;
    try {
      await deleteProjectDocumentAction(project.id, doc.id);
      toast.success("删除成功");
      loadDocs();
    } catch {
      toast.error("删除失败");
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
            <Button variant="outline" onClick={handleInitialize}>
              <RotateCcw className="mr-2 h-4 w-4" />
              初始化默认清单
            </Button>
            <Button variant="outline" onClick={() => setIsCreateOpen(true)}>
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
                variant="outline"
                size="sm"
                onClick={() => {
                  setNewName("");
                  setIsCreateOpen(false);
                }}
              >
                取消
              </Button>
              <Button size="sm" onClick={handleCreate}>
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
        <Button variant="outline" size="sm" onClick={() => setIsCreateOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          新增文书
        </Button>
        <Button
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
              variant="outline"
              size="sm"
              onClick={() => {
                setNewName("");
                setIsCreateOpen(false);
              }}
            >
              取消
            </Button>
            <Button size="sm" onClick={handleCreate}>
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
          return (
            <div
              key={doc.id}
              className={`grid items-center gap-3 rounded-md border px-4 py-3 transition-colors ${
                isDirty ? "border-ink/40 bg-fog/30" : "hover:bg-accent/50"
              }`}
              style={{
                gridTemplateColumns: `24px minmax(120px, 1fr) auto ${isArchived ? "160px" : "120px"} 32px`,
              }}
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

              {/* 删除 */}
              <Button
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
    </div>
  );
}
