"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { safeParseDate } from "@/lib/validators";

interface LeadListItemProps {
  id: string;
  communityName: string;
  layout: string | null;
  area: number | null;
  status: string;
  statusDisplay: string;
  statusColor: string;
  createdAt: string;
}

export function LeadListItem({
  id,
  communityName,
  layout,
  area,
  statusDisplay,
  statusColor,
  createdAt,
}: LeadListItemProps) {
  return (
    <Link
      href={`/leads/${id}`}
      className="block rounded-cards bg-white p-5 shadow-steep-sm border border-dove/30 transition-shadow hover:shadow-steep"
    >
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-[16px] tracking-[-0.14px] text-ink truncate">
              {communityName}
            </span>
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-medium shrink-0"
              style={{
                backgroundColor: `${statusColor}20`,
                color: statusColor,
              }}
            >
              {statusDisplay}
            </span>
          </div>
          <div className="text-[14px] leading-[1.5] text-ash">
            {layout && <span>{layout}</span>}
            {layout && area != null && <span>&nbsp;·&nbsp;</span>}
            {area != null && <span>{area}㎡</span>}
            {!layout && area == null && <span>暂无户型信息</span>}
          </div>
          <div className="mt-1 text-[12px] text-graphite">
            {safeParseDate(createdAt)?.toLocaleDateString("zh-CN") ?? "-"}
          </div>
        </div>
        <ChevronRight className="h-5 w-5 text-dove shrink-0" aria-hidden="true" />
      </div>
    </Link>
  );
}
