"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { safeFormatDate } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { components } from "@/lib/api-types";

import { deleteSalesRecordAction } from "../../actions/sales";
import {
  validateSalesRecords,
  type ApiSalesRecord,
} from "../../../_components/project-card-types";
import { getListingDaysText } from "../../../_components/project-card-utils";
import { MobileRecordForm } from "./mobile-record-form";

type ProjectResponse = components["schemas"]["ProjectResponse"];

interface MobileSellingViewProps {
  projectId: string;
  project: ProjectResponse;
}

type TabType = "viewing" | "offer" | "negotiation";

const TAB_LABEL: Record<TabType, string> = {
  viewing: "带看",
  offer: "出价",
  negotiation: "面谈",
};

export function MobileSellingView({
  projectId,
  project,
}: MobileSellingViewProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>("viewing");
  const [isFormOpen, setIsFormOpen] = useState(false);

  const records = useMemo(
    () => validateSalesRecords(project.sales_records),
    [project.sales_records],
  );
  const viewings = useMemo(
    () => records.filter((r) => r.record_type === "viewing"),
    [records],
  );
  const offers = useMemo(
    () => records.filter((r) => r.record_type === "offer"),
    [records],
  );
  const negotiations = useMemo(
    () => records.filter((r) => r.record_type === "negotiation"),
    [records],
  );

  const communityName = project.community_name ?? project.name ?? "项目详情";

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除这条记录吗？")) return;
    try {
      const res = await deleteSalesRecordAction(projectId, id);
      if (res.success) {
        toast.success("删除成功");
        router.refresh();
      } else {
        const errorMsg =
          typeof res.message === "string" ? res.message : "删除失败";
        toast.error(errorMsg);
      }
    } catch {
      toast.error("删除失败");
    }
  };

  const handleAddSuccess = () => {
    router.refresh();
  };

  const isSelling = project.status === "selling";

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      {/* 1. 顶部导航栏 */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-border bg-card/80 px-2 backdrop-blur-xl">
        <button
          onClick={() => router.back()}
          className="flex h-10 w-10 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted"
          aria-label="返回"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <span className="flex-1 truncate text-base font-semibold text-foreground">
          {communityName}
        </span>
      </header>

      {/* 2. KPI 概览 */}
      <section className="grid grid-cols-4 gap-2 p-3">
        <KpiCell label="挂牌" value={getListingDaysText(project.listing_date)} />
        <KpiCell label="带看" value={String(viewings.length)} />
        <KpiCell label="出价" value={String(offers.length)} />
        <KpiCell label="面谈" value={String(negotiations.length)} />
      </section>

      {/* 3. 记录列表 (Tabs) */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as TabType)}
        className="flex flex-1 flex-col"
      >
        <TabsList className="mx-3 grid h-10 grid-cols-3 bg-muted">
          <TabsTrigger
            value="viewing"
            className="text-xs data-[state=active]:bg-card data-[state=active]:text-emerald-700"
          >
            带看记录
          </TabsTrigger>
          <TabsTrigger
            value="offer"
            className="text-xs data-[state=active]:bg-card data-[state=active]:text-emerald-700"
          >
            出价记录
          </TabsTrigger>
          <TabsTrigger
            value="negotiation"
            className="text-xs data-[state=active]:bg-card data-[state=active]:text-emerald-700"
          >
            面谈记录
          </TabsTrigger>
        </TabsList>

        <TabsContent value="viewing" className="mt-3 flex-1 px-3">
          <ViewingList data={viewings} onDelete={handleDelete} />
        </TabsContent>

        <TabsContent value="offer" className="mt-3 flex-1 px-3">
          <OfferList data={offers} onDelete={handleDelete} />
        </TabsContent>

        <TabsContent value="negotiation" className="mt-3 flex-1 px-3">
          <NegotiationList data={negotiations} onDelete={handleDelete} />
        </TabsContent>
      </Tabs>

      {/* 4. 底部新增按钮 (仅在售项目可新增) */}
      {isSelling && (
        <div className="sticky bottom-0 left-0 right-0 z-40 border-t border-border bg-card/80 p-3 backdrop-blur-xl">
          <Button
            onClick={() => setIsFormOpen(true)}
            className="h-14 w-full gap-2 bg-success text-base font-semibold text-white hover:bg-success"
          >
            <Plus className="h-5 w-5" />
            新增{TAB_LABEL[activeTab]}记录
          </Button>
        </div>
      )}

      {/* 5. 新增记录表单 */}
      <MobileRecordForm
        projectId={projectId}
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSuccess={handleAddSuccess}
        recordType={activeTab}
      />
    </div>
  );
}

// ---------- KPI 单元 ----------

function KpiCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-card px-1 py-2 text-center">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className="mt-0.5 text-sm font-semibold text-foreground">
        {value}
      </span>
    </div>
  );
}

// ---------- 记录列表 ----------

function sortByDateDesc(list: ApiSalesRecord[]): ApiSalesRecord[] {
  return [...list].sort(
    (a, b) =>
      new Date(b.record_date).getTime() - new Date(a.record_date).getTime(),
  );
}

function EmptyState({ type }: { type: TabType }) {
  return (
    <div className="flex items-center justify-center rounded-lg border border-dashed border-border bg-muted/40 py-12 text-sm text-muted-foreground">
      暂无{TAB_LABEL[type]}记录
    </div>
  );
}

function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-error"
      aria-label="删除"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

function ViewingList({
  data,
  onDelete,
}: {
  data: ApiSalesRecord[];
  onDelete: (id: string) => void;
}) {
  if (data.length === 0) return <EmptyState type="viewing" />;
  const sorted = sortByDateDesc(data);
  return (
    <div className="space-y-2">
      {sorted.map((item) => (
        <div
          key={item.id}
          className="flex items-center justify-between rounded-lg border border-border bg-card p-3"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-sm font-medium text-foreground">
              {item.customer_name || "-"}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {safeFormatDate(item.record_date, "MM-dd HH:mm")}
            </span>
          </div>
          <DeleteButton onClick={() => onDelete(item.id)} />
        </div>
      ))}
    </div>
  );
}

function OfferList({
  data,
  onDelete,
}: {
  data: ApiSalesRecord[];
  onDelete: (id: string) => void;
}) {
  if (data.length === 0) return <EmptyState type="offer" />;
  const sorted = sortByDateDesc(data);
  const prices = sorted
    .map((r) => Number(r.price))
    .filter((p) => !isNaN(p));
  const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;

  return (
    <div className="space-y-2">
      {sorted.map((item) => {
        const numPrice = Number(item.price);
        const isMax = !isNaN(numPrice) && numPrice === maxPrice && numPrice > 0;
        return (
          <div
            key={item.id}
            className={cn(
              "flex items-center justify-between rounded-lg border bg-card p-3",
              isMax ? "border-error/20 ring-1 ring-error/10" : "border-border",
            )}
          >
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span
                className={cn(
                  "text-sm font-bold",
                  isMax ? "text-error" : "text-foreground",
                )}
              >
                ¥{item.price ?? "-"}万
                {isMax && (
                  <span className="ml-1 rounded bg-error/10 px-1 text-[10px] font-normal text-error">
                    最高
                  </span>
                )}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {item.customer_name || "-"}
                {" · "}
                {safeFormatDate(item.record_date, "MM-dd HH:mm")}
              </span>
            </div>
            <DeleteButton onClick={() => onDelete(item.id)} />
          </div>
        );
      })}
    </div>
  );
}

function NegotiationList({
  data,
  onDelete,
}: {
  data: ApiSalesRecord[];
  onDelete: (id: string) => void;
}) {
  if (data.length === 0) return <EmptyState type="negotiation" />;
  const sorted = sortByDateDesc(data);
  return (
    <div className="space-y-2">
      {sorted.map((item) => (
        <div
          key={item.id}
          className="flex items-start justify-between rounded-lg border border-border bg-card p-3"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-medium text-foreground">
                {item.customer_name || "-"}
              </span>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                {safeFormatDate(item.record_date, "yyyy/MM/dd HH:mm")}
              </span>
            </div>
            {item.notes && (
              <p className="rounded border border-border bg-muted/50 p-2 text-xs text-muted-foreground">
                {item.notes}
              </p>
            )}
          </div>
          <DeleteButton onClick={() => onDelete(item.id)} />
        </div>
      ))}
    </div>
  );
}
