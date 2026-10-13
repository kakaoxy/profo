"use client";

/**
 * 审核池客户端（FR-11 / 设计稿 ARTBOARD 04 pageReview）.
 *
 * KPI：唯一 Apricot 暖卡（待审核 · 点击行开始审核）+ 三张 fog 卡（已处理/已并到已有/已驳回）；
 * 队列表：提交时间 / 提交人 / 来源单据 / 小区 / 提交内容（mono）/ 状态（已新增·已合并·已驳回）/ ›；
 * 点击行 → 审核弹层（review-resolve-modal，pending 才可审；已处理 toast 提示）。
 */

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { client } from "@/lib/api-client";
import { cn } from "@/lib/utils";

import { ReviewResolveModal, reviewContentLabel } from "./review-resolve-modal";

interface ReviewItem {
  id: number;
  kind?: string | null;
  name?: string | null;
  community_id?: string | null;
  community_name?: string | null;
  parent_kind?: string | null;
  parent_id?: number | null;
  payload?: Record<string, unknown> | null;
  source_type?: string | null;
  source_id?: string | null;
  submitter_name?: string | null;
  status?: string | null;
  created_at: string;
  reference_count?: number;
}

interface ReviewData {
  total: number;
  items: ReviewItem[];
  kpi: { pending: number; processed: number; merged_total: number; rejected_total: number };
}

const SOURCE_LABEL: Record<string, string> = {
  project: "项目",
  lead: "线索",
  marketing: "营销",
  property: "房源（机器链路）",
  admin: "后台",
};
/** 设计稿状态口径：待审核 / 已新增 / 已合并 / 已驳回 */
const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending: { label: "待审核", className: "bg-amber-100 text-amber-800" },
  created: { label: "已新增", className: "bg-emerald-100 text-emerald-800" },
  merged: { label: "已合并", className: "bg-sky-100 text-sky-800" },
  rejected: { label: "已驳回", className: "bg-rose-100 text-rose-800" },
};

export function ReviewClient({ initialData }: { initialData: ReviewData }) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [openItem, setOpenItem] = useState<ReviewItem | null>(null);

  const refresh = useCallback(async () => {
    const { data: d } = await client.GET("/api/v1/admin/building-dictionary/review", {
      params: { query: { page: 1, page_size: 20 } },
    });
    if (d) setData(d as unknown as ReviewData);
    router.refresh();
  }, [router]);

  const onRowClick = useCallback((item: ReviewItem) => {
    if (item.status !== "pending") {
      toast.error(`该条目已处理（${STATUS_BADGE[item.status ?? ""]?.label ?? item.status}），仅待审核条目可流转`);
      return;
    }
    setOpenItem(item);
  }, []);

  const kpi = data.kpi;
  const kpis = [
    { label: "待审核", value: kpi.pending, sub: "点击行开始审核", warm: true },
    { label: "已处理", value: kpi.processed, sub: "含样例数据", warm: false },
    { label: "已并到已有", value: kpi.merged_total, sub: "都指向了已有数据", warm: false },
    { label: "已驳回", value: kpi.rejected_total, sub: "都已改选地址", warm: false },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* KPI：唯一 Apricot 暖卡（DESIGN.md 决策） */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className={cn("rounded-3xl px-5 py-4", k.warm ? "bg-apricot-wash" : "bg-fog")}>
            <p className={cn("text-[13px]", k.warm ? "text-rust" : "text-graphite")}>{k.label}</p>
            <p className="mt-1 font-display text-[28px] leading-none text-ink tabular-nums">{k.value}</p>
            <p className={cn("mt-1 text-[10.5px]", k.warm ? "text-rust/70" : "text-dove")}>{k.sub}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-dove/40">
        <Table>
          <TableHeader>
            <TableRow className="bg-fog">
              <TableHead>提交时间</TableHead>
              <TableHead>提交人</TableHead>
              <TableHead>来源单据</TableHead>
              <TableHead>小区</TableHead>
              <TableHead>提交内容</TableHead>
              <TableHead className="text-right">引用</TableHead>
              <TableHead>状态</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((item) => {
              const badge = STATUS_BADGE[item.status ?? "pending"] ?? { label: item.status ?? "待审核", className: "" };
              const pending = item.status === "pending";
              return (
                <TableRow
                  key={item.id}
                  className={cn(pending && "cursor-pointer")}
                  onClick={() => onRowClick(item)}
                >
                  <TableCell className="text-[13px] tabular-nums">
                    {new Date(item.created_at).toLocaleString("zh-CN")}
                  </TableCell>
                  <TableCell className="text-[13px]">{item.submitter_name ?? "—"}</TableCell>
                  <TableCell className="text-[13px]">
                    {item.source_type ? SOURCE_LABEL[item.source_type] ?? item.source_type : "房源（机器链路）"}
                  </TableCell>
                  <TableCell className="text-[13px] font-medium text-ink">
                    {item.community_name ?? item.name ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono text-[12px]">{reviewContentLabel(item)}</TableCell>
                  <TableCell className="text-right text-[13px] tabular-nums">{item.reference_count}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={badge.className}>
                      {badge.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-dove">{pending ? "›" : ""}</TableCell>
                </TableRow>
              );
            })}
            {data.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center text-graphite">
                  暂无待审核条目
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      {openItem ? (
        <ReviewResolveModal item={openItem} onClose={() => setOpenItem(null)} onResolved={() => void refresh()} />
      ) : null}
    </div>
  );
}
