"use client";

import * as React from "react";
import { Search, X, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { ProjectListItem } from "./ProjectListItem";
import { fetchAvailableProjects } from "./api";
import type { ProjectSelectorProps, L3ProjectBrief } from "./types";

const PAGE_SIZE = 20;

/**
 * 项目选择器组件
 * 用于从L3项目中选择关联项目
 */
export function ProjectSelector({
  open,
  onClose,
  onSelect,
  selectedId,
}: ProjectSelectorProps) {
  const [projects, setProjects] = React.useState<L3ProjectBrief[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [selectedProjectId, setSelectedProjectId] = React.useState<string | undefined>(selectedId);

  // 加载项目列表
  const loadProjects = React.useCallback(
    async (currentPage: number, query: string, signal?: AbortSignal) => {
      setLoading(true);
      try {
        const response = await fetchAvailableProjects({
          community_name: query || undefined,
          page: currentPage,
          page_size: PAGE_SIZE,
        });
        // 检查是否已取消
        if (signal?.aborted) return;
        setProjects((prev) =>
          currentPage === 1 ? response.items : [...prev, ...response.items]
        );
        setTotal(response.total);
      } catch (error) {
        if (signal?.aborted) return;
        toast.error(error instanceof Error ? error.message : "加载项目失败");
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    []
  );

  // 初始加载
  React.useEffect(() => {
    if (!open) return;

    const abortController = new AbortController();
    loadProjects(1, "", abortController.signal);

    return () => {
      abortController.abort();
    };
  }, [open, loadProjects]);

  // 搜索防抖
  React.useEffect(() => {
    if (!open) return;

    const abortController = new AbortController();
    const timer = setTimeout(() => {
      setPage(1);
      loadProjects(1, searchQuery, abortController.signal);
    }, 300);

    return () => {
      clearTimeout(timer);
      abortController.abort();
    };
  }, [searchQuery, open, loadProjects]);

  // 加载更多
  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    // 加载更多不需要取消，因为用户明确触发了操作
    loadProjects(nextPage, searchQuery);
  };

  // 选择项目
  const handleSelect = (project: L3ProjectBrief) => {
    setSelectedProjectId(project.id);
  };

  // 确认选择
  const handleConfirm = () => {
    const selected = projects.find((p) => p.id === selectedProjectId);
    if (selected) {
      onSelect(selected);
      onClose();
    }
  };

  // 清除搜索
  const handleClearSearch = () => {
    setSearchQuery("");
    setPage(1);
  };

  const hasMore = projects.length < total;
  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] sm:max-h-[80vh] grid-rows-[auto_auto_1fr_auto] gap-0 overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>选择关联项目</DialogTitle>
        </DialogHeader>

        <div className="relative px-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="搜索小区名称..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-10"
          />
          {searchQuery && (
            <button
              onClick={handleClearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <ScrollArea className="min-h-0 overflow-hidden py-2 px-6">
          <div className="space-y-3">
            {projects.map((project) => (
              <ProjectListItem
                key={project.id}
                project={project}
                selected={project.id === selectedProjectId}
                onClick={() => handleSelect(project)}
              />
            ))}

            {loading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              </div>
            )}

            {!loading && projects.length === 0 && (
              <div className="text-center py-8 text-slate-500">
                {searchQuery ? "未找到匹配的项目" : "暂无项目"}
              </div>
            )}

            {!loading && hasMore && (
              <Button
                variant="outline"
                className="w-full"
                onClick={handleLoadMore}
              >
                加载更多 ({projects.length}/{total})
              </Button>
            )}
          </div>
        </ScrollArea>

        <div className="flex items-center justify-between gap-2 px-6 py-3 border-t bg-white">
          <div className="text-sm text-slate-500 truncate min-w-0 flex-1">
            {selectedProject ? (
              <span>
                已选择: <span className="font-medium text-slate-900">{selectedProject.name}</span>
              </span>
            ) : (
              "请选择项目"
            )}
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Button variant="outline" onClick={onClose} size="sm">
              取消
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={!selectedProjectId}
              size="sm"
              className="bg-blue-600 hover:bg-blue-700"
            >
              确认选择
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
