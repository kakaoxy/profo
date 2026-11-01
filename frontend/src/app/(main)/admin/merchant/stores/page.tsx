"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";

import { PageContainer } from "@/app/(main)/admin/_components/page-container";
import { PageHeader } from "@/app/(main)/admin/_components/page-header";
import { StatusBadge } from "@/app/(main)/admin/_components/status-badge";
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
const SOURCE_LABELS: Record<string, string> = {
  employee: "员工建档",
  backoffice: "后台新增",
  import: "批量导入",
  broker: "经纪人创建",
};

export default function MerchantStoresPage() {
  const [data, setData] = useState<StoreList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("all");
  const [reviewStatus, setReviewStatus] = useState("all");
  const [district, setDistrict] = useState("");
  const [businessCircle, setBusinessCircle] = useState("");
  const [source, setSource] = useState("all");
  const [brokerCountMin, setBrokerCountMin] = useState("");
  const [brokerCountMax, setBrokerCountMax] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [ownerId, setOwnerId] = useState("all");
  const [employees, setEmployees] = useState<components["schemas"]["UserSimpleResponse"][]>([]);
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
          district: district.trim() || undefined,
          business_circle: businessCircle.trim() || undefined,
          owner_employee_id: ownerId === "all" ? undefined : ownerId,
          source: source === "all" ? undefined : source,
          broker_count_min: brokerCountMin.trim() || undefined,
          broker_count_max: brokerCountMax.trim() || undefined,
          created_from: createdFrom || undefined,
          created_to: createdTo || undefined,
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

  useEffect(() => {
    merchantApi<components["schemas"]["UserSimpleListResponse"]>("/users/simple?page=1&page_size=200")
      .then((result) => setEmployees(result.items))
      .catch(() => setEmployees([]));
  }, []);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div className="min-h-screen bg-fog">
      <PageContainer className="flex flex-col gap-6">
        <PageHeader
          title="门店列表"
          description="按区域、合作状态、审核状态查看与维护全部门店"
          actions={
            <>
              <Button variant="outline" asChild>
                <a
                  href={`/api/v1/admin/merchant/stores/export${queryString({
                    keyword: keyword.trim() || undefined,
                    status: status === "all" ? undefined : status,
                    review_status: reviewStatus === "all" ? undefined : reviewStatus,
                    district: district.trim() || undefined,
                    business_circle: businessCircle.trim() || undefined,
                    owner_employee_id: ownerId === "all" ? undefined : ownerId,
                    source: source === "all" ? undefined : source,
                    broker_count_min: brokerCountMin.trim() || undefined,
                    broker_count_max: brokerCountMax.trim() || undefined,
                    created_from: createdFrom || undefined,
                    created_to: createdTo || undefined,
                  })}`}
                >
                  导出 CSV
                </a>
              </Button>
              <Button asChild>
                <Link href="/admin/merchant/stores/new">
                  <Plus className="mr-1 h-4 w-4" /> 新建门店
                </Link>
              </Button>
            </>
          }
        />

        <Card className="rounded-cards border-0 shadow-steep-sm p-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-64">
              <Input
                placeholder="门店名称 / 地址 / 公司 / 电话"
                aria-label="搜索门店"
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
            <Input
              className="w-32"
              placeholder="区县"
              aria-label="按区县筛选"
              value={district}
              onChange={(event) => setDistrict(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && void load(1)}
            />
            <Input
              className="w-32"
              placeholder="商圈"
              aria-label="按商圈筛选"
              value={businessCircle}
              onChange={(event) => setBusinessCircle(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && void load(1)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <span className="whitespace-nowrap text-[13px] text-graphite">经纪人数量</span>
              <Input
                className="w-20"
                type="number"
                min={0}
                placeholder="下限"
                aria-label="经纪人数量下限"
                value={brokerCountMin}
                onChange={(event) => setBrokerCountMin(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && void load(1)}
              />
              <span className="text-xs text-graphite">至</span>
              <Input
                className="w-20"
                type="number"
                min={0}
                placeholder="上限"
                aria-label="经纪人数量上限"
                value={brokerCountMax}
                onChange={(event) => setBrokerCountMax(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && void load(1)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="whitespace-nowrap text-[13px] text-graphite">创建日期</span>
              <Input
                className="w-36"
                type="date"
                aria-label="创建日期起"
                value={createdFrom}
                onChange={(event) => setCreatedFrom(event.target.value)}
              />
              <span className="text-xs text-graphite">至</span>
              <Input
                className="w-36"
                type="date"
                aria-label="创建日期止"
                value={createdTo}
                onChange={(event) => setCreatedTo(event.target.value)}
              />
            </div>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger className="w-36" aria-label="按来源筛选">
                <SelectValue placeholder="来源" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部来源</SelectItem>
                <SelectItem value="employee">员工建档</SelectItem>
                <SelectItem value="backoffice">后台新增</SelectItem>
                <SelectItem value="import">批量导入</SelectItem>
                <SelectItem value="broker">经纪人创建</SelectItem>
              </SelectContent>
            </Select>
            <Select value={ownerId} onValueChange={setOwnerId}>
              <SelectTrigger className="w-40" aria-label="按负责人筛选">
                <SelectValue placeholder="负责人" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部负责人</SelectItem>
                {employees.map((employee) => (
                  <SelectItem key={employee.id} value={employee.id}>
                    {employee.nickname || employee.username}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => void load(1)} disabled={loading}>
              <RefreshCw className="mr-1 h-4 w-4" /> 查询
            </Button>
          </div>
        </Card>

        {error ? <Card className="rounded-cards border-0 shadow-steep-sm p-6 text-sm text-error">{error}</Card> : null}
        {loading ? <Card className="rounded-cards border-0 shadow-steep-sm p-6 text-sm text-muted-foreground">加载中...</Card> : null}

        {!loading && data ? (
          <Card className="rounded-cards border-0 shadow-steep-sm gap-0 overflow-hidden py-0">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="bg-fog text-left text-xs text-graphite">
                <tr>
                  <th className="px-4 py-3">门店</th>
                  <th className="px-4 py-3">公司</th>
                  <th className="px-4 py-3">区域/商圈</th>
                  <th className="px-4 py-3">合作状态</th>
                  <th className="px-4 py-3">审核</th>
                  <th className="px-4 py-3">来源</th>
                  <th className="px-4 py-3">负责人</th>
                  <th className="px-4 py-3">经纪人</th>
                  <th className="px-4 py-3">最近拜访</th>
                  <th className="px-4 py-3">门店状态</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item: StoreItem) => (
                  <tr key={item.id} className="border-t border-dove">
                    <td className="px-4 py-3">
                      <Link className="font-medium text-ink hover:text-rust" href={`/admin/merchant/stores/${item.id}`}>
                        {item.store_name}
                      </Link>
                      <div className="text-xs text-graphite">{item.address}</div>
                      {item.review_status === "pending" ? (
                        <Link
                          className="mt-0.5 inline-block text-xs text-rust hover:underline"
                          href={`/admin/merchant/stores/${item.id}#review`}
                        >
                          去审核
                        </Link>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">{item.company_name}</td>
                    <td className="px-4 py-3">
                      {item.district}
                      <div className="text-xs text-graphite">{item.business_circle}</div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        tone={
                          item.cooperation_status === "cooperated"
                            ? "positive"
                            : item.cooperation_status === "negotiating"
                              ? "attention"
                              : "neutral"
                        }
                      >
                        {item.cooperation_status_label}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        tone={
                          item.review_status === "pending"
                            ? "attention"
                            : item.review_status === "approved"
                              ? "positive"
                              : "neutral"
                        }
                      >
                        {REVIEW_LABELS[item.review_status] || item.review_status}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-xs text-graphite">
                      {SOURCE_LABELS[item.source] || item.source}
                    </td>
                    <td className="px-4 py-3">{item.owner_employee_name || "—"}</td>
                    <td className="px-4 py-3">{item.broker_count}</td>
                    <td className="px-4 py-3 text-xs text-graphite">
                      {item.last_visit_at ? new Date(item.last_visit_at).toLocaleString("zh-CN") : "—"}
                    </td>
                    <td className="px-4 py-3">{STATUS_LABELS[item.status] || item.status}</td>
                  </tr>
                ))}
                {data.items.length === 0 ? (
                  <tr>
                    <td className="px-4 py-10 text-center text-sm text-graphite" colSpan={10}>
                      没有符合条件的门店
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            </div>
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
