import { PageContainer, PageHeader } from "@/app/(main)/admin/_components";

/** 骨架条：宽度随机感 + 主/次两行，与真实行同构（无固定行高魔法值） */
function SkeletonLine({ w, h = 11 }: { w: string; h?: number }) {
  return <div className="animate-pulse rounded-[6px] bg-fog" style={{ width: w, height: h }} />;
}

/** 单个骨架单元格：主条 11px + 次条 9px，padding 对齐真实 td（py-2.5 px-2.5） */
function SkeletonCell({ w1, w2 }: { w1: string; w2: string }) {
  return (
    <td className="whitespace-nowrap px-2.5 py-2.5 align-middle">
      <SkeletonLine w={w1} />
      <div className="mt-1.5 opacity-70">
        <SkeletonLine w={w2} h={9} />
      </div>
    </td>
  );
}

/** 表格骨架：表头保留 + 6 行与真实行同构的占位（motion-reduce 时静态） */
function TableSkeleton() {
  const widths: [string, string][] = [
    ["72%", "44%"],
    ["86%", "38%"],
    ["62%", "50%"],
    ["78%", "34%"],
    ["66%", "46%"],
    ["90%", "40%"],
    ["70%", "52%"],
    ["58%", "36%"],
    ["74%", "48%"],
    ["64%", "42%"],
    ["82%", "38%"],
  ];
  return (
    <div className="overflow-hidden rounded-cards bg-pure-white shadow-steep">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1224px] table-fixed border-collapse">
          <thead className="border-b border-dove">
            <tr className="text-left text-[12.5px] font-medium tracking-wide text-graphite">
              <th className="w-[196px] px-2.5 py-3 pl-5 font-medium">小区 / 房源</th>
              <th className="hidden w-[84px] px-2.5 py-3 font-medium lg:table-cell">区域</th>
              <th className="w-[120px] px-2.5 py-3 font-medium">户型 / 楼层</th>
              <th className="w-[102px] px-2.5 py-3 font-medium">业主报价 / 单价</th>
              <th className="w-[102px] px-2.5 py-3 font-medium">评估价 / 单价</th>
              <th className="w-[82px] px-2.5 py-3 font-medium">状态</th>
              <th className="hidden w-[142px] px-2.5 py-3 font-medium md:table-cell">跟进结论</th>
              <th className="hidden px-2.5 py-3 font-medium md:table-cell">最后一条跟进内容</th>
              <th className="hidden w-[96px] px-2.5 py-3 font-medium xl:table-cell">录入人</th>
              <th className="hidden w-[88px] px-2.5 py-3 font-medium xl:table-cell">创建 / 更新</th>
              <th className="w-[78px] px-2.5 py-3 pr-4 font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dove/30">
            {[0, 1, 2, 3, 4, 5].map((row) => (
              <tr key={row}>
                {widths.map(([w1, w2], col) => (
                  <SkeletonCell key={col} w1={w1} w2={w2} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** 统计卡骨架：5 格，label + 大数字占位 */
function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="rounded-cards bg-pure-white p-5 shadow-steep-sm">
          <div className="flex items-center justify-between">
            <SkeletonLine w="56px" h={12} />
            <SkeletonLine w="16px" h={16} />
          </div>
          <div className="mt-4">
            <SkeletonLine w="64px" h={24} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Loading() {
  return (
    <div className="min-h-screen bg-fog">
      <PageContainer className="flex flex-col gap-8">
        <PageHeader title="线索中心" description="初筛评估 → 上门实勘 → 商务谈判 → 签约收房。" />
        <StatsSkeleton />
        <TableSkeleton />
      </PageContainer>
    </div>
  );
}
