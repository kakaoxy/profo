import { AlertCircle } from "lucide-react";

interface AlertCardProps {
  count: number;
}

export function AlertCard({ count }: AlertCardProps) {
  return (
    <div className="col-span-12 lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-card p-3 lg:p-4 flex items-center gap-2 lg:gap-3 h-40 min-w-0">
      <div className="w-12 h-12 bg-error-container rounded-xl flex items-center justify-center shrink-0">
        <AlertCircle className="w-6 h-6 text-error" />
      </div>
      <div className="min-w-0">
        <p className="text-3xl font-black text-error leading-none">{count}</p>
        <p className="text-xs font-medium text-slate-600 mt-1 truncate">
          待评估事项
        </p>
        <p className="text-[10px] text-error font-bold mt-1 bg-error/10 px-1.5 py-0.5 rounded inline-block">
          评估预警
        </p>
      </div>
    </div>
  );
}
