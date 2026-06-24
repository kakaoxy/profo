"use client";

import Image from "next/image";
import Link from "next/link";
import { getFileUrl } from "@/lib/config";
import { isValidUrl } from "@/lib/validators";

const isDev = process.env.NODE_ENV === "development";

interface ProjectCardProps {
  id: number;
  communityName: string | null;
  layout: string;
  orientation: string;
  area: number;
  totalPrice: number;
  unitPrice: number;
  title: string;
  coverImage: string | null;
  tags: string[];
  projectStatus: string;
  decorationStyle: string | null;
}

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  "在售": {
    label: "在售",
    className: "bg-c-status-onsale/10 text-c-status-onsale",
  },
  "在途": {
    label: "在途",
    className: "bg-c-status-upcoming/10 text-c-status-upcoming",
  },
  "已售": {
    label: "已售",
    className: "bg-c-status-sold/10 text-c-status-sold",
  },
};

export function ProjectCard({
  id,
  communityName,
  layout,
  orientation,
  area,
  totalPrice,
  unitPrice,
  coverImage,
  tags,
  projectStatus,
}: ProjectCardProps) {
  const status = STATUS_MAP[projectStatus] ?? STATUS_MAP["已售"];

  return (
    <Link href={`/projects/${id}`}>
      <div className="bg-white rounded-cards overflow-hidden shadow-steep-sm hover:shadow-steep transition-all">
        <div className="relative aspect-video bg-fog">
          {coverImage && isValidUrl(getFileUrl(coverImage)) ? (
            isDev ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={getFileUrl(coverImage)}
                alt={communityName ?? layout}
                className="w-full h-full object-cover"
              />
            ) : (
              <Image
                src={getFileUrl(coverImage)}
                alt={communityName ?? layout}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
              />
            )
          ) : (
            <div className="flex items-center justify-center h-full text-graphite text-sm">
              暂无图片
            </div>
          )}
          <span
            className={`absolute top-3 left-3 px-2.5 py-0.5 rounded-full text-xs font-medium ${status.className}`}
          >
            {status.label}
          </span>
        </div>

        <div className="p-5 space-y-2.5">
          <h3 className="text-lg font-medium text-ink truncate">
            {communityName ?? "未知小区"} · {layout}
          </h3>

          <p className="text-sm text-graphite">
            {area}㎡ · {orientation}
          </p>

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2.5 py-0.5 rounded-full text-xs bg-fog text-graphite"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div className="border-t border-dove/30 pt-2.5">
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-medium text-ink">
                {totalPrice}
              </span>
              <span className="text-sm text-ink">万</span>
            </div>
            <p className="text-xs text-graphite">
              {unitPrice}元/㎡
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}
