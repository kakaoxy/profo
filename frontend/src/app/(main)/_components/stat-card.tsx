import { LucideIcon, ArrowUp } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
  iconColor?: string;
  trend?: string;
  className?: string;
}

export function StatCard({
  title,
  value,
  sub,
  icon: Icon,
  iconColor = "text-slate-400",
  trend,
  className,
}: StatCardProps) {
  return (
    <div
      className={`bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 flex flex-col justify-between ${
        className || ""
      }`}
    >
      <div>
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">
            {title}
          </h3>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
        <div className="flex items-end gap-2">
          <span className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            {value}
          </span>
        </div>
      </div>
      {(sub || trend) && (
        <div className="mt-4 pt-4 border-t border-slate-50 dark:border-slate-700/50 text-xs flex items-center font-medium justify-between">
          {sub && (
            <span className="text-slate-500 dark:text-slate-400 truncate">
              {sub}
            </span>
          )}
          {trend && (
            <span className="text-green-600 dark:text-green-400 flex items-center bg-green-50 dark:bg-green-900/20 px-1.5 py-0.5 rounded">
              <ArrowUp className="h-3 w-3 mr-0.5" />
              {trend}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
