/**
 * 主列整页刷新骨架屏（V4.1 · 加载状态规范）
 *
 * 触发条件：客户端全量刷新（refreshProjectData(true)，如编辑保存后）期间
 * 在主列位置渲染卡片级 skeleton 占位；局部刷新（非 isFull）不显示，避免闪烁。
 * 结构对应原型 screen-states「加载中 · 卡片级骨架屏」：标题行 + KPI 三联卡 + 大卡。
 */
export function RefreshSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="内容刷新中">
      {/* 卡片一：概览卡（标题 + Meta 行 + KPI 三联） */}
      <div className="rounded-cards bg-pure-white p-[18px] shadow-steep-sm">
        <div className="mb-1.5 h-5 w-[55%] animate-pulse rounded bg-[#ececed]" />
        <div className="mb-[18px] h-[13px] w-[38%] animate-pulse rounded bg-[#ececed]" />
        <div className="mb-3.5 grid grid-cols-3 gap-2.5">
          <div className="h-[74px] animate-pulse rounded-[18px] bg-[#f0f0f2]" />
          <div className="h-[74px] animate-pulse rounded-[18px] bg-[#f0f0f2]" />
          <div className="h-[74px] animate-pulse rounded-[18px] bg-[#f0f0f2]" />
        </div>
      </div>

      {/* 卡片二：内容大卡 */}
      <div className="h-[150px] animate-pulse rounded-cards bg-[#f0f0f2]" />

      {/* 卡片三：列表卡 */}
      <div className="rounded-cards bg-pure-white p-[18px] shadow-steep-sm">
        <div className="flex flex-col gap-3">
          <div className="h-4 w-[30%] animate-pulse rounded bg-[#ececed]" />
          <div className="h-4 w-full animate-pulse rounded bg-[#ececed]" />
          <div className="h-4 w-[72%] animate-pulse rounded bg-[#ececed]" />
        </div>
      </div>
    </div>
  );
}
