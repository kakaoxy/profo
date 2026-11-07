"use client";

import { useMemo } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Eye, ImageIcon } from "lucide-react";

import { getThumbnailUrl } from "@/lib/config";
import { formatArea, formatUnitPrice } from "@/lib/formatters";
import type { L4MarketingMedia } from "../../types";
import type { FormValues } from "../form-schema";

interface ListingFormPreviewProps {
  photos: L4MarketingMedia[];
}

/** 表单右侧的客户端预览：用当前表单值实时渲染一张房源卡。 */
export function ListingFormPreview({ photos }: ListingFormPreviewProps) {
  const { control } = useFormContext<FormValues>();
  const values = useWatch({ control }) as Partial<FormValues>;

  const coverPhoto = useMemo(() => {
    const marketing = [...photos]
      .filter((photo) => photo.photo_category === "marketing")
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0];
    return marketing || photos[0];
  }, [photos]);

  const totalPrice = Number(values.total_price) || 0;
  const area = Number(values.area) || 0;
  const unitPrice = area > 0 ? (totalPrice * 10000) / area / 10000 : 0;
  const title = values.title?.trim() || "未填写房源标题";
  const tags = (values.tags ?? []).slice(0, 3);
  const isPublished = values.publish_status === "发布";

  const completionFields = [
    values.community_name,
    values.title,
    values.layout,
    values.area,
    values.total_price,
  ];
  const completion = Math.round(
    (completionFields.filter((value) => value !== undefined && value !== null && value !== "").length /
      completionFields.length) *
      100,
  );

  return (
    <section className="rounded-cards bg-white p-5 shadow-steep-sm">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-graphite">
          Client preview <span className="text-dove">/</span> 客户端预览
        </div>
        <span className="inline-flex h-7 items-center gap-1 rounded-full bg-fog px-2 text-[10px] text-graphite">
          <Eye className="h-3 w-3" />
          实时
        </span>
      </div>

      <div className="mt-3 overflow-hidden rounded-cards border border-dove/30">
        <div className="relative aspect-[4/3] bg-fog">
          {coverPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={getThumbnailUrl(coverPhoto.thumbnail_url, coverPhoto.file_url)}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-dove">
              <ImageIcon className="h-7 w-7" />
            </div>
          )}
          <span className="absolute top-3 left-3 rounded-full bg-ink/75 px-2.5 py-1 text-[9px] font-medium text-white">
            {isPublished ? "已发布" : "草稿预览"}
          </span>
        </div>
        <div className="p-4">
          <div className="truncate text-[15px] font-medium tracking-[-0.01em] text-ink">{title}</div>
          <div className="mt-1.5 text-[11px] text-graphite">
            {[values.community_name, values.layout, formatArea(values.area)].filter(Boolean).join(" · ") || "小区 · 户型 · 面积"}
          </div>
          <div className="mt-3 flex items-end justify-between">
            <div>
              <div className="font-display text-[22px] leading-none text-rust tabular-nums">
                ¥{totalPrice.toLocaleString()}
                <span className="ml-1 font-sans text-[10px] font-normal text-graphite">万</span>
              </div>
              <div className="mt-1 text-[10px] text-graphite tabular-nums">
                {unitPrice > 0 ? formatUnitPrice(unitPrice) : "单价将自动计算"}
              </div>
            </div>
            <span className="rounded-full bg-fog px-2.5 py-1 text-[10px] text-graphite">
              {values.project_status || "在途"}
            </span>
          </div>
          {tags.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1">
              {tags.map((tag) => (
                <span key={tag} className="rounded-full bg-fog px-2 py-0.5 text-[9px] text-graphite">
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-[10px] text-graphite">
          <span>资料完成度</span>
          <span className="tabular-nums">{completion}%</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-fog">
          <div className="h-full rounded-full bg-rust transition-all" style={{ width: `${completion}%` }} />
        </div>
        <div className="mt-3 space-y-1.5 text-[10px] leading-relaxed text-graphite">
          <div className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${values.title ? "bg-success" : "bg-dove"}`} />
            房源标题{values.title ? "已填写" : "待填写"}
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${totalPrice > 0 ? "bg-success" : "bg-dove"}`} />
            总价与单价{totalPrice > 0 ? "已确认" : "待确认"}
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${coverPhoto ? "bg-success" : "bg-dove"}`} />
            营销主图{coverPhoto ? "已上传" : "待上传"}
          </div>
        </div>
      </div>
    </section>
  );
}
