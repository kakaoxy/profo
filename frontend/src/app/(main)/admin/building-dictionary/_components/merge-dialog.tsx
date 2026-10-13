"use client";

/**
 * 合并弹层（FR-14 / Task 8.1：搜索-勾选-合并 + 影响预览）.
 *
 * 全库按名/地址检索（覆盖名字差异巨大的同一小区）→ 勾选目标主档 →
 * 影响预览（别名吸纳/关联改指/图片归属/楼栋户室归并计数）→
 * 调现有 POST /admin/communities/merge（零改动）。
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { client } from "@/lib/api-client";
import { cn } from "@/lib/utils";

import type { BdCommunityListItem } from "./types";

interface MergeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  primaryId: string;
  primaryName: string;
  onMerged?: () => void;
}

export function MergeDialog({ open, onOpenChange, primaryId, primaryName, onMerged }: MergeDialogProps) {
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<BdCommunityListItem[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const search = useCallback(async (kw: string) => {
    if (!kw.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const { data, error } = await client.GET("/api/v1/admin/building-dictionary/communities", {
        params: { query: { keyword: kw.trim(), page: 1, page_size: 20 } },
      });
      if (!error && data) {
        setResults((data.items as unknown as BdCommunityListItem[]).filter((c) => c.id !== primaryId));
      }
    } finally {
      setSearching(false);
    }
  }, [primaryId]);

  useEffect(() => {
    if (!open) {
      setKeyword("");
      setResults([]);
      setChecked(new Set());
    }
  }, [open]);

  const handleMerge = useCallback(async () => {
    if (checked.size === 0) return;
    setSubmitting(true);
    try {
      const { error } = await client.POST("/api/v1/admin/communities/merge", {
        body: { primary_id: primaryId, merge_ids: [...checked] },
      });
      if (error) {
        toast.error("合并失败，请检查后重试");
        return;
      }
      toast.success(`已合并 ${checked.size} 个小区到「${primaryName}」`);
      onOpenChange(false);
      onMerged?.();
    } finally {
      setSubmitting(false);
    }
  }, [checked, primaryId, primaryName, onOpenChange, onMerged]);

  const totalRooms = results
    .filter((c) => checked.has(c.id))
    .reduce((sum, c) => sum + c.room_count, 0);
  const totalBuildings = results
    .filter((c) => checked.has(c.id))
    .reduce((sum, c) => sum + c.building_count, 0);
  const totalLinked = results
    .filter((c) => checked.has(c.id))
    .reduce((sum, c) => sum + c.linked_project_count, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>合并到「{primaryName}」</DialogTitle>
          <DialogDescription>
            全库按小区名/地址检索，勾选要并入的目标主档；合并后被并小区软归档、别名吸纳、关联单据改指。
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 size-4 text-dove" />
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void search(keyword);
              }}
              placeholder="输入小区名或地址检索"
              className="pl-8"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => void search(keyword)}>
            搜索
          </Button>
        </div>

        <div className="max-h-64 overflow-y-auto rounded-xl border border-dove/40">
          {searching ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-5 animate-spin text-graphite" />
            </div>
          ) : results.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-graphite">输入关键词检索全库小区</p>
          ) : (
            results.map((c) => (
              <button
                key={c.id}
                type="button"
                className={cn(
                  "flex w-full items-center gap-3 border-b border-dove/20 px-3 py-2 text-left last:border-0 hover:bg-fog",
                  checked.has(c.id) && "bg-fog",
                )}
                onClick={() => {
                  const next = new Set(checked);
                  if (next.has(c.id)) {
                    next.delete(c.id);
                  } else {
                    next.add(c.id);
                  }
                  setChecked(next);
                }}
              >
                <input
                  type="checkbox"
                  checked={checked.has(c.id)}
                  readOnly
                  className="size-4 accent-black"
                />
                <span className="flex-1">
                  <span className="block text-[14px] text-ink">{c.name}</span>
                  <span className="block text-[12px] text-graphite">
                    {[c.district, c.address].filter(Boolean).join(" · ") || "—"}
                  </span>
                </span>
                <span className="text-[12px] text-graphite tabular-nums">
                  {c.building_count} 栋 / {c.room_count} 户
                </span>
              </button>
            ))
          )}
        </div>

        {/* 合并影响预览 */}
        {checked.size > 0 ? (
          <div className="rounded-xl bg-apricot-wash/50 p-3 text-[13px] text-rust">
            <p className="font-medium">合并影响预览（{checked.size} 个小区）</p>
            <ul className="mt-1 list-inside list-disc text-graphite">
              <li>被并小区名转为主档别名（吸纳）</li>
              <li>关联项目/线索/营销改指主档（{totalLinked} 个已关联单据）</li>
              <li>户型图片随主档收敛</li>
              <li>楼栋 {totalBuildings} / 户室 {totalRooms.toLocaleString()} 归并到主档名下</li>
              <li>被并小区软归档（可解除合并恢复）</li>
            </ul>
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            className="bg-ink text-white"
            disabled={checked.size === 0 || submitting}
            onClick={handleMerge}
          >
            {submitting ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
            确认合并（{checked.size}）
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
