"use client";

import { Building2, LayoutGrid, Maximize, Compass, MessageSquare, Calendar } from "lucide-react";

interface LeadInfoCardProps {
  communityName: string;
  layout: string | null;
  area: number | null;
  floorInfo: string | null;
  orientation: string | null;
  remarks: string | null;
  createdAt: string;
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fog text-graphite">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-[12px] uppercase tracking-[0.5px] text-graphite">{label}</span>
        <p className="mt-0.5 text-[15px] font-medium tracking-[-0.009em] text-ink truncate">{value}</p>
      </div>
    </div>
  );
}

export function LeadInfoCard({
  communityName,
  layout,
  area,
  floorInfo,
  orientation,
  remarks,
  createdAt,
}: LeadInfoCardProps) {
  return (
    <div className="rounded-cards bg-white p-6 shadow-steep-sm border border-dove/30">
      <h2 className="text-[18px] font-medium leading-[1.35] tracking-[-0.16px] text-ink mb-1">
        房源信息
      </h2>
      <p className="text-[14px] text-graphite mb-4">提交的房源基本信息</p>

      <div className="divide-y divide-dove/20">
        <InfoRow
          icon={<Building2 className="h-4 w-4" aria-hidden="true" />}
          label="小区"
          value={communityName}
        />

        {layout && (
          <InfoRow
            icon={<LayoutGrid className="h-4 w-4" aria-hidden="true" />}
            label="户型"
            value={layout}
          />
        )}

        {area != null && (
          <InfoRow
            icon={<Maximize className="h-4 w-4" aria-hidden="true" />}
            label="面积"
            value={`${area}㎡`}
          />
        )}

        {(floorInfo || orientation) && (
          <InfoRow
            icon={<Compass className="h-4 w-4" aria-hidden="true" />}
            label="楼层/朝向"
            value={[floorInfo, orientation].filter(Boolean).join(" · ")}
          />
        )}

        {remarks && (
          <InfoRow
            icon={<MessageSquare className="h-4 w-4" aria-hidden="true" />}
            label="留言"
            value={remarks}
          />
        )}

        <InfoRow
          icon={<Calendar className="h-4 w-4" aria-hidden="true" />}
          label="提交时间"
          value={createdAt}
        />
      </div>
    </div>
  );
}
