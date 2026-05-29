"use client";

interface LeadInfoCardProps {
  communityName: string;
  layout: string | null;
  area: number | null;
  floorInfo: string | null;
  orientation: string | null;
  remarks: string | null;
  createdAt: string;
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
    <div className="rounded-xl bg-white p-6 shadow-[0px_4px_20px_rgba(15,23,42,0.05)] border border-c-border-subtle space-y-4">
      <h3 className="text-lg font-bold text-c-trust-blue">房源信息</h3>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-c-text-secondary">小区</span>
          <span className="text-sm font-medium text-c-text-primary">
            {communityName}
            {layout && <span className="ml-2 text-c-text-secondary">· {layout}</span>}
            {area && <span className="ml-2 text-c-text-secondary">· {area}㎡</span>}
          </span>
        </div>

        {(floorInfo || orientation) && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-c-text-secondary">楼层/朝向</span>
            <span className="text-sm font-medium text-c-text-primary">
              {[floorInfo, orientation].filter(Boolean).join(" · ")}
            </span>
          </div>
        )}

        {remarks && (
          <div className="flex items-start justify-between">
            <span className="text-sm text-c-text-secondary shrink-0">留言</span>
            <span className="text-sm text-c-text-primary text-right ml-4">{remarks}</span>
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="text-sm text-c-text-secondary">提交时间</span>
          <span className="text-sm text-c-text-primary">{createdAt}</span>
        </div>
      </div>
    </div>
  );
}
