import Link from "next/link";

interface ProjectOverviewCardProps {
  signingCount: number;
  renovatingCount: number;
  sellingCount: number;
  soldCount: number;
}

export function ProjectOverviewCard({
  signingCount,
  renovatingCount,
  sellingCount,
  soldCount,
}: ProjectOverviewCardProps) {
  return (
    <div
      className="col-span-12 lg:col-span-4 bg-card rounded-xl border border-border shadow-card p-4 lg:p-6 flex flex-col justify-between h-40 min-w-0"
      role="region"
      aria-label="项目总览"
    >
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-muted-foreground font-black uppercase tracking-widest">
          项目总览
        </span>
        <Link
          href="/admin/projects"
          className="text-primary text-xs font-bold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
        >
          详情
        </Link>
      </div>
      <div className="flex justify-between items-end">
        <div className="text-center px-2 lg:px-3 border-r border-border flex-1 min-w-0">
          <p className="text-2xl lg:text-3xl font-black text-primary tabular-nums">{signingCount}</p>
          <p className="text-[10px] text-muted-foreground mt-1 uppercase font-bold truncate">
            已签约
          </p>
        </div>
        <div className="text-center px-2 lg:px-3 border-r border-border flex-1 min-w-0">
          <p className="text-2xl lg:text-3xl font-black text-on-surface tabular-nums">{renovatingCount}</p>
          <p className="text-[10px] text-muted-foreground mt-1 uppercase font-bold truncate">
            装修中
          </p>
        </div>
        <div className="text-center px-2 lg:px-3 border-r border-border flex-1 min-w-0">
          <p className="text-2xl lg:text-3xl font-black text-on-surface tabular-nums">{sellingCount}</p>
          <p className="text-[10px] text-muted-foreground mt-1 uppercase font-bold truncate">
            在售中
          </p>
        </div>
        <div className="text-center px-2 lg:px-3 flex-1 min-w-0">
          <p className="text-2xl lg:text-3xl font-black text-tertiary tabular-nums">{soldCount}</p>
          <p className="text-[10px] text-muted-foreground mt-1 uppercase font-bold truncate">
            已成交
          </p>
        </div>
      </div>
    </div>
  );
}
