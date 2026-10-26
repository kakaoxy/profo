"use client";

/**
 * 合并弹层（FR-14 / Task 8.1：搜索-勾选-合并 + 影响预览）.
 *
 * 全库按名/地址检索（覆盖名字差异巨大的同一小区）→ 勾选要并入的档案 →
 * **真实影响预览**（调 POST /admin/communities/merge/preview，与合并共用同一套
 * 画像并集纯函数，保证「预览说补什么」＝「实际补什么」）→ 确认合并。
 *
 * 修复背景（SPEC community-merge-union）：原实现预览是 5 条**静态文案**，
 * 而「画像取最大合集 / 图片随主档收敛」后端根本没做，运营在「b 信息完整、
 * a 名字正确」场景下合并后看不到 b 的画像，误判为数据丢失。
 */

import { useCallback, useEffect, useRef, useState } from "react";
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

import type { BdCommunityListItem, CommunityMergePreview } from "./types";

interface MergeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  primaryId: string;
  primaryName: string;
  onMerged?: () => void;
}

/** 画像字段的中文名（仅本弹层使用，不抽 util） */
const PROFILE_LABELS: Record<string, string> = {
  district: "行政区",
  business_circle: "板块",
  ring: "环线",
  property_types: "物业类型",
  era_from: "建成年代起",
  era_to: "建成年代止",
  developer: "开发商",
  property_mgmt: "物业公司",
  address: "地址",
  lng: "经度",
  lat: "纬度",
  city_id: "城市ID",
};

/** 预览值 → 可读文本（数组拼接、空值置「—」） */
function formatPreviewValue(value: unknown): string {
  if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) return "—";
  if (Array.isArray(value)) return value.join("、");
  return String(value);
}

export function MergeDialog({ open, onOpenChange, primaryId, primaryName, onMerged }: MergeDialogProps) {
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<BdCommunityListItem[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  /** 合并影响预览（真实数据；null=未加载/加载失败 → 降级为静态文案） */
  const [preview, setPreview] = useState<CommunityMergePreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const previewSeq = useRef(0);

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
        // 生成类型收敛：property_types 可选 → 收敛为必有数组
        setResults(
          data.items
            .map((c): BdCommunityListItem => ({ ...c, property_types: c.property_types ?? [] }))
            .filter((c) => c.id !== primaryId),
        );
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
      setPreview(null);
    }
  }, [open]);

  /** 勾选变化 → 防抖拉取真实影响预览（失败静默降级为静态文案，不阻塞合并） */
  useEffect(() => {
    if (!open || checked.size === 0) {
      setPreview(null);
      return;
    }
    const ids = [...checked];
    const seq = ++previewSeq.current;
    setPreviewing(true);
    const timer = setTimeout(async () => {
      const { data, error } = await client.POST("/api/v1/admin/communities/merge/preview", {
        body: { primary_id: primaryId, merge_ids: ids },
      });
      // 过期响应（用户又改了勾选）直接丢弃
      if (seq !== previewSeq.current) return;
      setPreviewing(false);
      if (error || !data) {
        setPreview(null);
        return;
      }
      setPreview(data);
    }, 300);
    return () => clearTimeout(timer);
  }, [checked, open, primaryId]);

  const handleMerge = useCallback(async () => {
    if (checked.size === 0) return;
    setSubmitting(true);
    try {
      const { data, error } = await client.POST("/api/v1/admin/communities/merge", {
        body: { primary_id: primaryId, merge_ids: [...checked] },
      });
      if (error) {
        toast.error("合并失败，请检查后重试");
        return;
      }
      // 回执带上「实际补入」，与预览同口径
      const filled = data?.profile_filled?.length ?? 0;
      const movedImages = data?.images_moved ?? 0;
      const summary = [
        filled > 0 ? `补入画像 ${filled} 项` : null,
        movedImages > 0 ? `迁移户型图 ${movedImages} 张` : null,
      ]
        .filter(Boolean)
        .join("、");
      toast.success(
        `已合并 ${checked.size} 个小区到「${primaryName}」${summary ? `（${summary}）` : ""}`,
      );
      for (const warning of data?.warnings ?? []) {
        toast.warning(warning);
      }
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

        {/* 合并影响预览（SPEC community-merge-union §6.1：真实数据优先，失败降级静态文案） */}
        {checked.size > 0 ? (
          <div className="max-h-72 overflow-y-auto rounded-xl bg-apricot-wash/50 p-3 text-[13px] text-rust">
            <p className="flex items-center gap-1.5 font-medium">
              合并影响预览（{checked.size} 个小区）
              {previewing ? <Loader2 className="size-3.5 animate-spin text-graphite" /> : null}
            </p>
            {preview ? (
              <div className="mt-1.5 flex flex-col gap-2">
                {/* ① 将补入的画像——报障场景的关键：让用户合并前就看清「b 的信息会不会进 a」 */}
                {(() => {
                  const changed = (preview.profile ?? []).filter(
                    (row) => row.source !== "kept" && row.source !== "unchanged",
                  );
                  if (changed.length === 0) {
                    return (
                      <p className="text-[12px] text-graphite">
                        画像：主档已有信息将全部保留，子档无可补入项（主档非空值不被覆盖）。
                      </p>
                    );
                  }
                  return (
                    <div>
                      <p className="text-[12px] font-medium text-ink">
                        将补入画像 {changed.length} 项（主档已有值不覆盖）
                      </p>
                      <ul className="mt-1 flex flex-col gap-0.5">
                        {changed.map((row) => (
                          <li key={row.field} className="text-[12px] leading-relaxed text-graphite">
                            <span className="text-ink">{PROFILE_LABELS[row.field] ?? row.field}</span>
                            ：{formatPreviewValue(row.before)}
                            <span className="mx-1 text-dove">→</span>
                            <span className="text-ink">{formatPreviewValue(row.after)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })()}
                {/* ② 将随迁/改指的资产 */}
                {(() => {
                  const counts = preview.counts;
                  if (!counts) return null;
                  const lines = [
                    `楼栋 ${counts.buildings} / 户室 ${counts.rooms.toLocaleString()} 归并到主档名下`,
                    `户型图 ${counts.images} 张随主档收敛`,
                    `关联单据 ${counts.documents} 张改指主档（房源 ${counts.properties} 套）`,
                    `待审楼栋/户室 ${counts.pending_entries} 条改指主档`,
                    `竞品关系 ${counts.competitor_edges} 条改指主档`,
                    counts.archived_children > 0
                      ? `已并入这 ${checked.size} 个小区的 ${counts.archived_children} 个后代一并改指主档`
                      : null,
                    `被并小区名转为主档别名 ${counts.aliases} 个（旧名仍可搜索）`,
                  ].filter(Boolean);
                  return (
                    <ul className="list-inside list-disc gap-0.5 text-[12px] leading-relaxed text-graphite">
                      {lines.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                      <li>被并小区软归档（可解除合并恢复）</li>
                    </ul>
                  );
                })()}
                {/* ③ 告警（超长地址、年代交叉、坐标越界） */}
                {(preview.warnings?.length ?? 0) > 0 ? (
                  <ul className="list-inside list-disc text-[12px] leading-relaxed">
                    {preview.warnings?.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : (
              <ul className="mt-1 list-inside list-disc text-graphite">
                <li>被并小区名转为主档别名（吸纳）</li>
                <li>关联项目/线索/营销改指主档（{totalLinked} 个已关联单据）</li>
                <li>户型图片随主档收敛</li>
                <li>楼栋 {totalBuildings} / 户室 {totalRooms.toLocaleString()} 归并到主档名下</li>
                <li>被并小区软归档（可解除合并恢复）</li>
              </ul>
            )}
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
