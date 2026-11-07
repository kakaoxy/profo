"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/** 营销列表页页级动作：导出报表与新建房源。 */
export function MarketingPageActions() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        className="h-11 rounded-full border-dove bg-white px-5 text-ink hover:bg-fog"
        onClick={() => toast.success("正在生成营销报表...")}
      >
        导出报表
      </Button>
      <Link
        href="/admin/marketing/new"
        className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-ink px-5 text-sm font-medium text-white transition-colors hover:bg-ink/90"
      >
        <Plus className="h-4 w-4" />
        新建房源
      </Link>
    </div>
  );
}
