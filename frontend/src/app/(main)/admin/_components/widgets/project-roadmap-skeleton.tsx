/**
 * 「项目全流程」加载骨架（SPEC §4.7）。
 *
 * 该卡终态高度约 600px（轴 46 + 10 行 × 40 + 工具条/页脚），
 * 通用 168px 的 `WidgetSkeleton` 会造成明显 CLS，因此单独给一条骨架。
 */

const BAR_WIDTHS = [46, 62, 38, 71, 54, 33, 58, 44, 66, 40];

export function ProjectRoadmapSkeleton() {
  return (
    <div className="flex min-w-0 flex-1 flex-col rounded-cards bg-white px-[22px] py-5 shadow-steep-sm">
      <div className="h-[18px] w-[104px] animate-pulse rounded bg-fog" />
      <div className="mt-2.5 flex items-center gap-2">
        {[44, 44, 44, 44].map((width, index) => (
          <span
            key={index}
            className="h-[22px] animate-pulse rounded-full bg-fog"
            style={{ width }}
          />
        ))}
      </div>
      <div className="mt-4 space-y-2.5">
        {BAR_WIDTHS.map((width, index) => (
          <div key={index} className="flex items-center gap-3">
            <span className="h-2.5 w-[118px] shrink-0 animate-pulse rounded bg-fog" />
            <span
              className="h-3.5 animate-pulse rounded-[5px] bg-fog"
              style={{ width: `${width}%` }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
