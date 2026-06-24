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
    <Link
      href={`/projects/${id}`}
      className="group block transition-all duration-300 hover:-translate-y-0.5"
    >
      <div className="flex h-full flex-col overflow-hidden rounded-cards bg-white shadow-steep-sm transition-shadow duration-300 group-hover:shadow-steep">
        <div className="relative aspect-video overflow-hidden bg-fog">
          {coverImage && isValidUrl(getFileUrl(coverImage)) ? (
            isDev ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={getFileUrl(coverImage)}
                alt={communityName ?? layout}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            ) : (
              <Image
                src={getFileUrl(coverImage)}
                alt={communityName ?? layout}
                fill
                className="object-cover transition-transform duration-500 group-hover:scale-105"
                sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
              />
            )
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-graphite">
              暂无图片
            </div>
          )}
          <span
            className={`absolute top-3 left-3 rounded-full px-3 py-1 text-xs font-medium backdrop-blur-sm ${status.className}`}
          >
            {status.label}
          </span>
        </div>

        <div className="flex flex-1 flex-col p-5">
          <h3 className="text-lg font-medium text-ink truncate">
            {communityName ?? "未知小区"} · {layout}
          </h3>

          <p className="mt-1.5 text-sm text-graphite">
            {area}㎡ · {orientation}
          </p>

          {tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-fog px-2.5 py-0.5 text-xs text-graphite"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div className="mt-auto border-t border-dove/30 pt-3">
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-semibold text-ink">
                {totalPrice}
              </span>
              <span className="text-sm text-graphite">万</span>
            </div>
            <p className="mt-0.5 text-xs text-graphite">{unitPrice}元/㎡</p>
          </div>
        </div>
      </div>
    </Link>
  );
}
