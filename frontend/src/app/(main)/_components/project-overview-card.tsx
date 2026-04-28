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
    <div className="col-span-12 lg:col-span-5 bg-white rounded-xl border border-slate-200 shadow-card p-6 flex flex-col justify-between h-40">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-slate-400 font-black uppercase tracking-widest">
          项目总览 Overview
        </span>
        <Link
          href="/projects"
          className="text-primary text-xs font-bold hover:underline"
        >
          详情 View Details
        </Link>
      </div>
      <div className="flex justify-between items-end">
        <div className="text-center px-4 border-r border-slate-100 flex-1">
          <p className="text-3xl font-black text-primary">{signingCount}</p>
          <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold">
            已签约 Signed
          </p>
        </div>
        <div className="text-center px-4 border-r border-slate-100 flex-1">
          <p className="text-3xl font-black text-on-surface">{renovatingCount}</p>
          <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold">
            装修中 Reno
          </p>
        </div>
        <div className="text-center px-4 border-r border-slate-100 flex-1">
          <p className="text-3xl font-black text-on-surface">{sellingCount}</p>
          <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold">
            在售中 On Sale
          </p>
        </div>
        <div className="text-center px-4 flex-1">
          <p className="text-3xl font-black text-tertiary">{soldCount}</p>
          <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold">
            已成交 Sold
          </p>
        </div>
      </div>
    </div>
  );
}
