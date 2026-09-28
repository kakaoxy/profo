import Link from "next/link";
import { ArrowRight } from "lucide-react";

interface AlertCardProps {
  count: number;
}

/** 工作台「待评估事项」暖卡（Steep：整屏唯一 Apricot 暖卡 + Signifier 大数字，设计稿决策 04/05/09） */
export function AlertCard({ count }: AlertCardProps) {
  return (
    <div
      className="col-span-12 lg:col-span-3 bg-apricot-wash rounded-cards px-6 py-[22px] flex flex-col min-w-0"
      role="region"
      aria-label="待评估事项预警"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[15px] font-medium text-rust">待评估事项</span>
        <span className="inline-flex shrink-0 items-center rounded-full bg-rust px-[11px] py-[3.5px] text-[12.5px] font-[450] leading-[1.35] text-white">
          评估预警
        </span>
      </div>

      <div
        className="font-display mt-4 text-[52px] leading-none text-rust tabular-nums"
        aria-live="polite"
        aria-atomic="true"
      >
        {count}
      </div>

      <p className="mt-3 text-[13px] leading-[1.55] text-rust/75">
        有 {count} 条线索等待初筛评估，请尽快安排处理
      </p>

      <Link
        href="/admin/leads"
        className="mt-2.5 inline-flex items-center gap-1 self-start text-sm font-[450] text-rust transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
      >
        去处理
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}
