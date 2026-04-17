"use client";

import React, { memo, useMemo } from "react";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { ImageOff } from "lucide-react";
import { formatUnitPrice, formatArea } from "@/lib/formatters";
import { getFileUrl } from "./utils";
import type { MarketingInfoSectionProps } from "./types";
import type { L4MarketingMedia } from "../../types";

// 获取营销主图（MARKETING分类首图）
function getMarketingMainImage(project: any, photos: L4MarketingMedia[]): string | null {
  // 优先从 photos 中找 marketing 分类的第一张
  const marketingPhoto = photos
    .filter((p) => p.photo_category === "marketing")
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0];
  if (marketingPhoto) {
    return getFileUrl(marketingPhoto.file_url || marketingPhoto.thumbnail_url);
  }
  // 其次使用 project.images
  if (project.images) {
    const firstImage = project.images.split(",")[0];
    if (firstImage) return getFileUrl(firstImage.trim());
  }
  return null;
}

// 信息行组件
interface InfoRowProps {
  label: string;
  value?: React.ReactNode;
  highlight?: boolean;
}

function InfoRow({ label, value, highlight }: InfoRowProps) {
  if (value === undefined || value === null || value === "") return null;

  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-slate-500">{label}</span>
      <span className={`text-sm font-medium text-slate-800 ${highlight ? "font-bold text-slate-900" : ""}`}>
        {value}
      </span>
    </div>
  );
}

// 分隔线组件
function Divider() {
  return <div className="border-t border-slate-100 my-2" />;
}

// 使用 memo 避免不必要的重渲染
export const MarketingInfoSection = memo(function MarketingInfoSection({
  project,
  photos = [],
}: MarketingInfoSectionProps & { photos?: L4MarketingMedia[] }) {
  // 生成营销照片依赖签名：只包含影响主图选择的关键信息（ID和排序）
  // URL变化时不需要触发重计算，getMarketingMainImage会直接从photos读取最新URL
  const marketingPhotosSignature = useMemo(() => {
    return photos
      .filter((p) => p.photo_category === "marketing")
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((p) => `${p.id}:${p.sort_order ?? 0}`)
      .join("|");
  }, [photos]);

  const mainImage = useMemo(
    () => getMarketingMainImage(project, photos),
    [project.id, project.images, marketingPhotosSignature]
  );

  // 缓存标签渲染
  const tagsContent = useMemo(() => {
    if (typeof project.tags === "string" && project.tags) {
      const tags = project.tags.split(",").filter((t) => t.trim());
      return (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="bg-slate-100 text-slate-600 text-xs font-medium px-2 py-0.5 border-0"
            >
              {tag.trim()}
            </Badge>
          ))}
        </div>
      );
    }
    return null;
  }, [project.tags]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
      {/* 左侧：营销主图 */}
      <div className="relative">
        <div className="aspect-[4/3] rounded-lg overflow-hidden bg-slate-100 border border-slate-200 relative">
          {mainImage ? (
            <Image
              src={mainImage}
              alt="营销主图"
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 280px"
              priority
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
              <ImageOff className="w-12 h-12 mb-2 opacity-50" />
              <span className="text-sm">暂无主图</span>
            </div>
          )}
        </div>
        <div className="absolute bottom-2 left-2">
          <Badge className="bg-black/60 text-white text-xs border-0">
            营销主图
          </Badge>
        </div>
      </div>

      {/* 右侧：房源信息 */}
      <div className="space-y-2">
        {/* 第一行：总价和单价 */}
        <InfoRow
          label="总价"
          value={project.total_price ? `${project.total_price.toLocaleString()}万` : "-"}
          highlight
        />
        <InfoRow
          label="单价"
          value={formatUnitPrice(project.unit_price)}
        />

        <Divider />

        {/* 第二行：户型、面积、楼层、朝向 */}
        <InfoRow
          label="户型"
          value={project.layout}
        />
        <InfoRow
          label="建筑面积"
          value={formatArea(project.area)}
        />
        <InfoRow
          label="楼层"
          value={project.floor_info}
        />
        <InfoRow
          label="朝向"
          value={project.orientation}
        />

        <Divider />

        {/* 第三行：装修风格和标签 */}
        <InfoRow
          label="装修风格"
          value={project.decoration_style}
        />
        {tagsContent && (
          <div className="flex items-start justify-between py-2">
            <span className="text-sm text-slate-500 pt-0.5">标签</span>
            <div className="text-right max-w-[70%]">{tagsContent}</div>
          </div>
        )}

        <Divider />

        {/* 第四行：创建时间 */}
        <InfoRow
          label="创建时间"
          value={project.created_at ? new Date(project.created_at).toLocaleDateString("zh-CN") : "-"}
        />
      </div>
    </div>
  );
});
