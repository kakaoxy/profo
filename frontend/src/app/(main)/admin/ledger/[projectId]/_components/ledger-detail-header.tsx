import Link from "next/link";
import { ArrowLeft, BarChart3 } from "lucide-react";

export function LedgerDetailHeader({ projectId }: { projectId: string }) {
  return (
    <div className="flex items-center justify-between">
      <Link
        href="/admin/ledger"
        className="text-sm font-medium text-graphite hover:text-ink transition-colors flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust focus-visible:ring-offset-2 rounded-sm"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        返回资金账本
      </Link>
      <Link
        href={`/admin/ledger/${projectId}/statistics`}
        className="text-sm font-medium text-graphite hover:text-ink transition-colors flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust focus-visible:ring-offset-2 rounded-sm"
      >
        <BarChart3 className="h-4 w-4" aria-hidden="true" />
        统计视图
      </Link>
    </div>
  );
}
