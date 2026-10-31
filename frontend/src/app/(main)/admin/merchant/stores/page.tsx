"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";

import { PageContainer } from "@/app/(main)/admin/_components/page-container";
import { PageHeader } from "@/app/(main)/admin/_components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { components } from "@/lib/api-types";
import { merchantApi, queryString } from "../_components/merchant-api";

type StoreList = components["schemas"]["MerchantStoreListResponse"];
type StoreItem = components["schemas"]["MerchantStoreListItem"];

const REVIEW_LABELS: Record<string, string> = { pending: "待审核", approved: "已转正", merged: "已合并" };
const STATUS_LABELS: Record<string, string> = { normal: "正常", disabled: "停用", merged: "已合并", relocated: "已搬迁" };

export default function MerchantStoresPage() {
  const [data, setData] = useState<StoreList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("all");
  const [reviewStatus, setReviewStatus] = useState("all");
  const [page, setPage] = useState(1);

  const load = async (nextPage = page) => {
    setLoading(true);
    setError("");
    try {
      const result = await merchantApi<StoreList>(
        `/admin/merchant/stores${queryString({
          page: nextPage,
          page_size: 20,
          keyword: keyword.trim() || undefined,
          status: status === "all" ? undefined : status,
          review_status: reviewStatus === "all" ? undefined : reviewStatus,
        })}`,
      );
      setData(result);
      setPage(nextPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div className="min-h-screen bg-fog">
      <PageContainer className="flex flex-col gap-6">
        <PageHeader title="门店列表" description="按区域、合作状态、审核状态查看与维护全部门店" />

        <Card className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-64">
              <Input
                placeholder="门店名称 / 地址 / 公司 / 电话"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && void load(1)}
              />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="门店状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="normal">正常</SelectItem>
                <SelectItem value="disabled">停用</SelectItem>
                <SelectItem value="merged">已合并</SelectItem>
                <SelectItem value="relocated">已搬迁</SelectItem>
              </SelectContent>
            </Select>
            <Select value={reviewStatus} onValueChange={setReviewStatus}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="审核状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部审核</SelectItem>
                <SelectItem value="pending">待审核</SelectItem>
                <SelectItem value="approved">已转正</SelectItem>
                <SelectItem value="merged">已合并</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => void load(1)} disabled={loading}>
              <RefreshCw className="mr-1 h-4 w-4" /> 查询
            </Button>
            <Button variant="outline" asChild>
              <a
                href={`/api/v1/admin/merchant/stores/export${queryString({
                  keyword: keyword.trim() || undefined,
                  status: status === "all" ? undefined : status,
                  review_status: reviewStatus === "all" ? undefined : reviewStatus,
                })}`}
              >
                导出 CSV
              </a>
            </Button>
            <Button asChild className="ml-auto">
              <Link href="/admin/merchant/stores/new">
                <Plus className="mr-1 h-4 w-4" /> 新建门店
              </Link>
            </Button>
          </div>
        </Card>

        {error ? <Card className="p-6 text-sm text-error">{error}</Card> : null}
        {loading ? <Card className="p-6 text-sm text-muted-foreground">加载中...</Card> : null}

        {!loading && data ? (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-mist text-left text-xs text-graphite">
                <tr>
                  <th className="px-4 py-3">门店</th>
                  <th className="px-4 py-3">公司</th>
                  <th className="px-4 py-3">区域/商圈</th>
                  <th className="px-4 py-3">合作状态</th>
                  <th className="px-4 py-3">审核</th>
                  <th className="px-4 py-3">负责人</th>
                  <th className="px-4 py-3">最近拜访</th>
                  <th className="px-4 py-3">门店状态</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item: StoreItem) => (
                  <tr key={item.id} className="border-t border-mist">
                    <td className="px-4 py-3">
                      <Link className="font-medium text-ink hover:text-rust" href={`/admin/merchant/stores/${item.id}`}>
                        {item.store_name}
                      </Link>
                      <div className="text-xs text-graphite">{item.address}</div>
                    </td>
                    <td className="px-4 py-3">{item.company_name}</td>
                    <td className="px-4 py-3">
                      {item.district}
                      <div className="text-xs text-graphite">{item.business_circle}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={item.cooperation_status === "cooperated" ? "default" : "secondary"}>
                        {item.cooperation_status_label}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={item.review_status === "pending" ? "destructive" : "secondary"}>
                        {REVIEW_LABELS[item.review_status] || item.review_status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">{item.owner_employee_name || "—"}</td>
                    <td className="px-4 py-3 text-xs text-graphite">
                      {item.last_visit_at ? new Date(item.last_visit_at).toLocaleString("zh-CN") : "—"}
                    </td>
                    <td className="px-4 py-3">{STATUS_LABELS[item.status] || item.status}</td>
                  </tr>
                ))}
                {data.items.length === 0 ? (
                  <tr>
                    <td className="px-4 py-10 text-center text-sm text-graphite" colSpan={8}>
                      没有符合条件的门店
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </Card>
        ) : null}

        <div className="flex items-center justify-between text-sm text-graphite">
          <span>共 {data?.total ?? 0} 家门店</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => void load(page - 1)}>
              上一页
            </Button>
            <span>
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => void load(page + 1)}
            >
              下一页
            </Button>
          </div>
        </div>
      </PageContainer>
    </div>
  );
}
