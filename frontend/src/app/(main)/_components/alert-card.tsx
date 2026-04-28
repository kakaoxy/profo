import { AlertCircle } from "lucide-react";

interface AlertCardProps {
  count: number;
}

export function AlertCard({ count }: AlertCardProps) {
  return (
    <div className="col-span-12 lg:col-span-3 bg-white rounded-xl border border-slate-200 shadow-card p-6 flex items-center gap-5 h-40">
      <div className="w-16 h-16 bg-error-container rounded-2xl flex items-center justify-center">
        <AlertCircle className="w-8 h-8 text-error" />
      </div>
      <div>
        <p className="text-4xl font-black text-error leading-none">{count}</p>
        <p className="text-sm font-medium text-slate-600 mt-1">
          待评估事项 Items
        </p>
        <p className="text-xs text-error font-bold mt-1 bg-error/10 px-2 py-0.5 rounded inline-block">
          评估预警 Evaluation Alert
        </p>
      </div>
    </div>
  );
}
