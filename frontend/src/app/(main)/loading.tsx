import { LayoutDashboard, Loader2 } from "lucide-react";

export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-4 md:p-8 min-w-0 overflow-x-hidden">
      {/* Header */}
      <div className="mb-8 flex items-center gap-3">
        <div className="p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
          <LayoutDashboard className="w-6 h-6 text-slate-700 dark:text-slate-200" />
        </div>
        <div>
          <div className="h-8 w-32 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
          <div className="h-4 w-48 bg-slate-200 dark:bg-slate-700 rounded mt-1 animate-pulse" />
        </div>
      </div>

      {/* Top Row - Skeleton Cards */}
      <div className="grid grid-cols-12 gap-4 lg:gap-6 mb-8 min-w-0">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="col-span-12 md:col-span-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 h-40 animate-pulse"
          >
            <div className="h-4 w-24 bg-slate-200 dark:bg-slate-700 rounded mb-4" />
            <div className="h-8 w-16 bg-slate-200 dark:bg-slate-700 rounded" />
          </div>
        ))}
      </div>

      {/* Loading Indicator */}
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
        <span className="ml-3 text-slate-500">加载中...</span>
      </div>
    </div>
  );
}
