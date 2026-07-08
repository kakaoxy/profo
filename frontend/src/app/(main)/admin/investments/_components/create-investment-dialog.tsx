"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search, X, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  createInvestment,
  searchProjects,
  getProjectBriefById,
  type ProjectBrief,
} from "../actions";
import {
  getProjectStatusBadgeClass,
  getStatusLabel,
  DEFAULT_STATUS,
} from "@/lib/status-colors";

interface CreateInvestmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 预选项目ID（从资金账本跳转时传入） */
  prefillProjectId?: string;
}

export function CreateInvestmentDialog({
  open,
  onOpenChange,
  prefillProjectId,
}: CreateInvestmentDialogProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = React.useState("");
  const [projects, setProjects] = React.useState<ProjectBrief[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [selected, setSelected] = React.useState<ProjectBrief | null>(null);
  const [amount, setAmount] = React.useState("");
  const [remark, setRemark] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  // 搜索项目（防抖 300ms）
  React.useEffect(() => {
    if (!open) return;
    // 有预选项目时不执行搜索
    if (prefillProjectId) return;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await searchProjects(searchQuery);
        if (res.success) {
          setProjects(res.data);
        } else {
          setProjects([]);
        }
      } catch {
        setProjects([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, open, prefillProjectId]);

  // 预选项目（从资金账本跳转时）
  React.useEffect(() => {
    if (!open || !prefillProjectId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await getProjectBriefById(prefillProjectId);
        if (!cancelled && res.success && res.data) {
          setSelected(res.data);
        }
      } catch {
        // 忽略
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, prefillProjectId]);

  const handleSelect = (project: ProjectBrief) => {
    setSelected(project);
    setSearchQuery("");
    setProjects([]);
  };

  const handleClearSelected = () => {
    setSelected(null);
  };

  const handleSubmit = async () => {
    if (!selected) {
      toast.error("请选择项目");
      return;
    }
    const amountNum = parseFloat(amount);
    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      toast.error("投资总额必须大于 0");
      return;
    }

    setSubmitting(true);
    try {
      const res = await createInvestment({
        project_id: selected.id,
        total_investment: amountNum,
        remark: remark.trim() || undefined,
      });
      if (res.success) {
        toast.success("跟投记录创建成功");
        onOpenChange(false);
        router.push(`/admin/investments/${res.data.project_id}`);
      } else {
        toast.error(res.message || "创建失败");
      }
    } catch {
      toast.error("创建失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] grid-rows-[auto_auto_1fr_auto] gap-0 overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>新增跟投记录</DialogTitle>
          <DialogDescription className="text-xs">
            选择项目并填写投资总额，提交后跳转至详情页继续配置投资方
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0 px-6 py-4">
          <div className="space-y-4">
            {/* 项目选择器 */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                关联项目 <span className="text-red-500">*</span>
              </label>

              {selected ? (
                <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-foreground truncate">
                          {selected.name}
                        </span>
                        {selected.status && (
                          <Badge
                            variant="secondary"
                            className={`text-[10px] px-2 py-0 h-5 border-none rounded ${getProjectStatusBadgeClass(selected.status || DEFAULT_STATUS)}`}
                          >
                            {getStatusLabel(selected.status || DEFAULT_STATUS)}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        {selected.project_code && (
                          <div>编号: {selected.project_code}</div>
                        )}
                        {selected.community_name && (
                          <div>小区: {selected.community_name}</div>
                        )}
                        {selected.address && (
                          <div>地址: {selected.address}</div>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground shrink-0"
                      onClick={handleClearSelected}
                      aria-label="取消选择"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="搜索小区名称..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 pr-10"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="rounded-lg border border-border max-h-60 overflow-hidden">
                    {loading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : projects.length > 0 ? (
                      <ScrollArea className="h-60">
                        <div className="divide-y divide-border">
                          {projects.map((project) => (
                            <button
                              key={project.id}
                              type="button"
                              onClick={() => handleSelect(project)}
                              className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-sm text-foreground truncate">
                                      {project.name}
                                    </span>
                                    {project.status && (
                                      <Badge
                                        variant="secondary"
                                        className={`text-[10px] px-1.5 py-0 h-5 border-none rounded shrink-0 ${getProjectStatusBadgeClass(project.status || DEFAULT_STATUS)}`}
                                      >
                                        {getStatusLabel(project.status || DEFAULT_STATUS)}
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="text-xs text-muted-foreground mt-0.5 truncate">
                                    {project.community_name || "—"}
                                    {project.address ? ` · ${project.address}` : ""}
                                  </div>
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </ScrollArea>
                    ) : (
                      <div className="text-center py-8 text-sm text-muted-foreground">
                        {searchQuery ? "未找到匹配的项目" : "请输入小区名称搜索"}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* 投资总额 */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                投资总额(元) <span className="text-red-500">*</span>
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="请输入投资总额，如 8000000.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                两位小数，单位：元
              </p>
            </div>

            {/* 备注 */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">备注</label>
              <Textarea
                placeholder="选填，记录跟投相关说明"
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                rows={3}
              />
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="px-6 py-3 border-t border-border bg-card gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            取消
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !selected}
            className="bg-primary hover:bg-primary/90"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                提交中...
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                创建跟投
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
