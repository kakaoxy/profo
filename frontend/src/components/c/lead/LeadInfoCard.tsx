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
    <div className="rounded-cards bg-white p-6 shadow-steep-sm border border-dove/30 space-y-4">
      <h3 className="text-lg font-medium text-ink">房源信息</h3>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-ash">小区</span>
          <span className="text-sm font-medium text-ink">
            {communityName}
            {layout && <span className="ml-2 text-ash">· {layout}</span>}
            {area && <span className="ml-2 text-ash">· {area}㎡</span>}
          </span>
        </div>

        {(floorInfo || orientation) && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-ash">楼层/朝向</span>
            <span className="text-sm font-medium text-ink">
              {[floorInfo, orientation].filter(Boolean).join(" · ")}
            </span>
          </div>
        )}

        {remarks && (
          <div className="flex items-start justify-between">
            <span className="text-sm text-ash shrink-0">留言</span>
            <span className="text-sm text-ink text-right ml-4">{remarks}</span>
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="text-sm text-ash">提交时间</span>
          <span className="text-sm text-ink">{createdAt}</span>
        </div>
      </div>
    </div>
  );
}
