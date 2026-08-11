"use client";

/**
 * 户型图网格组件.
 *
 * 以响应式网格展示户型图卡片：缩略图 + 来源标签 + 描述 + 创建时间。
 * 支持点击预览大图，canWrite 时显示编辑/删除按钮。
 */

import { useState } from "react";
import { Pencil, Trash2, Check, X } from "lucide-react";
import { getThumbnailUrl } from "@/lib/config";
import type { components } from "@/lib/api-types";

type CommunityImageResponse = components["schemas"]["CommunityImageResponse"];

interface ImageGridProps {
  images: CommunityImageResponse[];
  canWrite: boolean;
  loading: boolean;
  onImageClick: (index: number) => void;
  onDelete: (imageId: number) => void;
  onEdit: (imageId: number, description: string) => Promise<boolean>;
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

export function ImageGrid({
  images,
  canWrite,
  loading,
  onImageClick,
  onDelete,
  onEdit,
}: ImageGridProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  const startEdit = (img: CommunityImageResponse) => {
    setEditingId(img.id);
    setEditValue(img.description ?? "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue("");
  };

  const saveEdit = async (imageId: number) => {
    setSaving(true);
    const ok = await onEdit(imageId, editValue.trim());
    setSaving(false);
    if (ok) {
      setEditingId(null);
      setEditValue("");
    }
  };

  const handleDelete = (img: CommunityImageResponse) => {
    if (window.confirm("确认删除该户型图？")) {
      onDelete(img.id);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
        <span className="animate-pulse">加载中...</span>
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <span className="text-sm">该小区暂无户型图</span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {images.map((img, index) => (
        <div
          key={img.id}
          className="group relative rounded-xl overflow-hidden border border-border bg-muted"
        >
          {/* 缩略图 */}
          <button
            onClick={() => onImageClick(index)}
            className="block w-full aspect-[4/3] overflow-hidden cursor-pointer"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={getThumbnailUrl(img.thumbnail_url, img.url)}
              alt={img.description ?? "户型图"}
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
            />
          </button>

          {/* 来源标签 */}
          <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-black/60 text-white">
            {img.source === "scraped" ? "抓取" : "上传"}
          </span>

          {/* 操作按钮 */}
          {canWrite && (
            <div className="absolute top-2 right-2 flex gap-1">
              <button
                onClick={() => startEdit(img)}
                className="rounded p-1 bg-black/60 text-white hover:bg-black/80 transition-colors"
                aria-label="编辑描述"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => handleDelete(img)}
                className="rounded p-1 bg-black/60 text-white hover:bg-red-600/80 transition-colors"
                aria-label="删除"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* 底部信息 */}
          <div className="p-2 space-y-1">
            {editingId === img.id ? (
              <div className="flex items-center gap-1">
                <input
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEdit(img.id);
                    if (e.key === "Escape") cancelEdit();
                  }}
                  placeholder="输入描述..."
                  maxLength={200}
                  className="flex-1 min-w-0 px-1.5 py-1 text-xs rounded border border-input bg-background outline-none focus:ring-1 focus:ring-primary/30"
                  autoFocus
                />
                <button
                  onClick={() => saveEdit(img.id)}
                  disabled={saving}
                  className="shrink-0 rounded p-1 text-primary hover:bg-primary/10 disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={cancelEdit}
                  className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <>
                {img.description && (
                  <p className="text-xs text-foreground line-clamp-1">
                    {img.description}
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground">
                  {formatDate(img.created_at)}
                </p>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
