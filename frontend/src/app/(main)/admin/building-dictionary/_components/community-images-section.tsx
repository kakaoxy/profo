"use client";

/**
 * 户型图库区块（FR-20 v2.0：抽屉内唯一图片管理界面）.
 *
 * 复用现有端点零改动：GET/POST /admin/communities/{id}/images ·
 * PATCH/DELETE /admin/community-images/{id}；上传 / 悬停改描述 / 调排序 / 软删；
 * 无图占位兜底。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { client } from "@/lib/api-client";
import { cn } from "@/lib/utils";

import type { BdCommunityImageItem } from "./types";

interface CommunityImagesSectionProps {
  communityId: string;
}

export function CommunityImagesSection({ communityId }: CommunityImagesSectionProps) {
  const [images, setImages] = useState<BdCommunityImageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDesc, setEditDesc] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await client.GET("/api/v1/admin/communities/{community_id}/images", {
        params: { path: { community_id: communityId }, query: { page: 1, page_size: 50 } },
      });
      if (data) {
        setImages(data.items.filter((i) => !i.is_deleted));
      }
    } finally {
      setLoading(false);
    }
  }, [communityId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleUpload = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        const fd = new FormData();
        fd.append("file", file);
        const { error } = await client.POST("/api/v1/admin/communities/{community_id}/images", {
          params: { path: { community_id: communityId } },
          // @ts-expect-error openapi-fetch multipart 走 bodySerializer
          body: { file },
          bodySerializer: (bd: Record<string, unknown>) => {
            const form = new FormData();
            for (const [k, v] of Object.entries(bd)) form.append(k, v as Blob | string);
            return form;
          },
        });
        if (error) {
          toast.error("上传失败");
          return;
        }
        toast.success("图片已上传");
        await load();
      } finally {
        setUploading(false);
      }
    },
    [communityId, load],
  );

  const saveDesc = useCallback(
    async (imageId: number) => {
      const { error } = await client.PATCH("/api/v1/admin/community-images/{image_id}", {
        params: { path: { image_id: imageId } },
        body: { description: editDesc || null },
      });
      if (error) {
        toast.error("描述保存失败");
        return;
      }
      setEditingId(null);
      toast.success("描述已更新");
      await load();
    },
    [editDesc, load],
  );

  const move = useCallback(
    async (image: BdCommunityImageItem, dir: -1 | 1) => {
      const sorted = [...images].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
      const idx = sorted.findIndex((i) => i.id === image.id);
      const swapWith = sorted[idx + dir];
      if (!swapWith) return;
      const { error } = await client.PATCH("/api/v1/admin/community-images/{image_id}", {
        params: { path: { image_id: image.id } },
        body: { sort_order: swapWith.sort_order },
      });
      if (!error) {
        await client.PATCH("/api/v1/admin/community-images/{image_id}", {
          params: { path: { image_id: swapWith.id } },
          body: { sort_order: image.sort_order },
        });
      }
      if (error) {
        toast.error("排序调整失败");
        return;
      }
      await load();
    },
    [images, load],
  );

  const remove = useCallback(
    async (imageId: number) => {
      const { error } = await client.DELETE("/api/v1/admin/community-images/{image_id}", {
        params: { path: { image_id: imageId } },
      });
      if (error) {
        toast.error("删除失败");
        return;
      }
      toast.success("图片已删除");
      await load();
    },
    [load],
  );

  return (
    <div>
      {/* 设计稿 sec-t：左标题 + mono 计数 / 右侧 mono 说明 */}
      <div className="mb-2.5 flex items-baseline justify-between">
        <h3 className="text-[14px] font-semibold text-ink">
          户型图库 <span className="font-mono text-[11px] font-normal text-graphite">({images.length})</span>
        </h3>
        <span className="font-mono text-[11px] text-graphite">小区图片库 · 复用现有图片端点（FR-20）</span>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleUpload(f);
          e.target.value = "";
        }}
      />
      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="size-5 animate-spin text-graphite" />
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {images.map((img, idx) => (
            <div
              key={img.id}
              className="group relative aspect-[4/3] overflow-hidden rounded-[10px] border border-dove/40 bg-fog"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.thumbnail_url || img.url}
                alt={img.description || "户型图"}
                className="size-full object-cover"
              />
              {/* 悬停操作层：改描述 / 排序 / 删除（FR-20） */}
              <div className="absolute inset-0 hidden flex-col justify-between bg-black/50 p-1.5 group-hover:flex">
                <div className="flex justify-end gap-1">
                  <button
                    type="button"
                    aria-label="上移"
                    disabled={idx === 0}
                    className={cn(
                      "flex size-5 items-center justify-center rounded bg-white/90 text-[10px] text-ink",
                      idx === 0 && "opacity-40",
                    )}
                    onClick={() => void move(img, -1)}
                  >
                    <ArrowUp className="size-3" />
                  </button>
                  <button
                    type="button"
                    aria-label="下移"
                    disabled={idx === images.length - 1}
                    className={cn(
                      "flex size-5 items-center justify-center rounded bg-white/90 text-[10px] text-ink",
                      idx === images.length - 1 && "opacity-40",
                    )}
                    onClick={() => void move(img, 1)}
                  >
                    <ArrowDown className="size-3" />
                  </button>
                  <button
                    type="button"
                    aria-label="删除"
                    className="flex size-5 items-center justify-center rounded bg-white/90 text-rose-600"
                    onClick={() => void remove(img.id)}
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
                {editingId === img.id ? (
                  <div className="flex gap-1">
                    <Input
                      autoFocus
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void saveDesc(img.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      placeholder="描述"
                      className="h-6 bg-white text-[11px]"
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    className="truncate text-left text-[10px] leading-tight text-white/90 hover:underline"
                    onClick={() => {
                      setEditingId(img.id);
                      setEditDesc(img.description ?? "");
                    }}
                  >
                    {img.description || "点击添加描述"}
                  </button>
                )}
              </div>
            </div>
          ))}
          {/* 设计稿：网格内 4:3 虚线「＋ 上传」卡（空态时即唯一卡片） */}
          <button
            type="button"
            disabled={uploading}
            className="flex aspect-[4/3] flex-col items-center justify-center gap-0.5 rounded-[10px] border-[1.5px] border-dashed border-dove text-[12px] text-dove hover:border-ash hover:text-graphite disabled:opacity-60"
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            上传
          </button>
        </div>
      )}
      <p className="mt-1.5 text-[10.5px] text-dove">悬停单图可改描述 / 调排序 / 删除</p>
    </div>
  );
}
