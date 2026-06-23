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
    <Link href={`/leads/${id}`}>
      <div className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-[0px_4px_20px_rgba(15,23,42,0.05)] border border-c-border-subtle">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-c-text-primary truncate">
              {communityName}
            </span>
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium shrink-0"
              style={{
                backgroundColor: `${statusColor}20`,
                color: statusColor,
              }}
            >
              {statusDisplay}
            </span>
          </div>
          <div className="text-sm text-c-text-secondary">
            {layout && <span>{layout}</span>}
            {layout && area != null && <span> · </span>}
            {area != null && <span>{area}㎡</span>}
            {!layout && area == null && <span>暂无户型信息</span>}
          </div>
          <div className="text-xs text-c-text-secondary mt-1">
            {safeParseDate(createdAt)?.toLocaleDateString("zh-CN") ?? "-"}
          </div>
        </div>
        <ChevronRight className="h-5 w-5 text-c-text-secondary shrink-0" />
      </div>
    </Link>
  );
}
