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
    <div className="col-span-12 lg:col-span-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-card p-4 lg:p-6 flex flex-col justify-between h-40 min-w-0">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-slate-400 font-black uppercase tracking-widest">
          项目总览
        </span>
        <Link
          href="/projects"
          className="text-primary text-xs font-bold hover:underline"
        >
          详情
        </Link>
      </div>
      <div className="flex justify-between items-end">
        <div className="text-center px-2 lg:px-3 border-r border-slate-100 flex-1 min-w-0">
          <p className="text-2xl lg:text-3xl font-black text-primary">{signingCount}</p>
          <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold truncate">
            已签约
          </p>
        </div>
        <div className="text-center px-2 lg:px-3 border-r border-slate-100 flex-1 min-w-0">
          <p className="text-2xl lg:text-3xl font-black text-on-surface">{renovatingCount}</p>
          <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold truncate">
            装修中
          </p>
        </div>
        <div className="text-center px-2 lg:px-3 border-r border-slate-100 flex-1 min-w-0">
          <p className="text-2xl lg:text-3xl font-black text-on-surface">{sellingCount}</p>
          <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold truncate">
            在售中
          </p>
        </div>
        <div className="text-center px-2 lg:px-3 flex-1 min-w-0">
          <p className="text-2xl lg:text-3xl font-black text-tertiary">{soldCount}</p>
          <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold truncate">
            已成交
          </p>
        </div>
      </div>
    </div>
  );
}
