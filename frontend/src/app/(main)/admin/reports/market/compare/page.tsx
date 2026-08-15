/**
 * 多商圈对比分析页（Server Component）。
 *
 * 路由：/admin/reports/market/compare?ids=商圈A,商圈B&range=4w
 *
 * - ids < 2：渲染空状态 Alert，提示返回商圈总览
 * - ids >= 2：调用 GET /api/v1/reports/market/compare 聚合后传给客户端组件渲染图表与表格
 */
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { fetchClient } from "@/lib/api-server";
import { logger } from "@/lib/logger";
import type { ComparisonData, Granularity, RangeOption } from "../../_lib/types";
import { ComparisonSummaryTable } from "../_components/comparison-summary-table";
import { ComparisonChart } from "../_components/comparison-chart";

interface PageProps {
  searchParams: Promise<{ ids?: string; range?: string }>;
}

const VALID_RANGES: RangeOption[] = ["4w", "8w", "6m", "12m", "24m"];

function parseRange(raw: string | undefined): RangeOption {
  if (raw && VALID_RANGES.includes(raw as RangeOption)) {
    return raw as RangeOption;
  }
  return "4w";
}

function granularityFromRange(range: RangeOption): Granularity {
  return range === "4w" || range === "8w" ? "week" : "month";
}

function parseIds(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export default async function ComparePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const ids = parseIds(params.ids);
  const range = parseRange(params.range);
  const granularity = granularityFromRange(range);

  if (ids.length < 2) {
    return (
      <div className="min-h-screen bg-muted">
        <div className="w-full max-w-400 mx-auto flex flex-col gap-8 py-8 px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-1">
            <Link
              href="/admin/reports/market"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
              退出对比
            </Link>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">多商圈对比分析</h1>
          </div>
          <Alert>
            <AlertTitle>需要至少 2 个商圈</AlertTitle>
            <AlertDescription>
              请先在商圈总览添加至少 2 个商圈，再进入对比分析。
              <Link href="/admin/reports/market" className="ml-1 underline underline-offset-2">
                返回商圈总览
              </Link>
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  const client = await fetchClient();
  const { data: rawData, error } = await client.GET("/api/v1/reports/market/compare", {
    params: { query: { ids: ids.join(","), range } },
  });
  if (error || !rawData) {
    logger.error("Failed to fetch comparison data", { error, ids });
    throw new Error("Failed to fetch comparison data");
  }

  // F1: ComparisonData 已是生成类型别名，与 client.GET 返回类型一致，无需断言
  const data: ComparisonData = rawData;

  return (
    <div className="min-h-screen bg-muted">
      <div className="w-full max-w-400 mx-auto flex flex-col gap-8 py-8 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-1">
          <Link
            href="/admin/reports/market"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            退出对比
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            多商圈对比分析 · {ids.length}个商圈
          </h1>
        </div>
        <ComparisonSummaryTable data={data} />
        <ComparisonChart type="volume" data={data} granularity={granularity} />
        <ComparisonChart type="price" data={data} granularity={granularity} />
        <ComparisonChart type="floor" data={data} granularity={granularity} />
        <ComparisonChart type="room" data={data} granularity={granularity} />
      </div>
    </div>
  );
}
