"use client";

import { useEffect, useState } from "react";

import { PageContainer } from "@/app/(main)/admin/_components/page-container";
import { PageHeader } from "@/app/(main)/admin/_components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { components } from "@/lib/api-types";
import { merchantApi, queryString } from "../_components/merchant-api";

type BrokerList = components["schemas"]["BrokerListResponse"];
type PendingBinding = components["schemas"]["BrokerBindingResponse"];

const STATUS_LABELS: Record<string, string> = {
  unbound: "未绑定",
  bound: "已绑定",
  unbound_after: "已解绑",
  disabled: "已停用",
  pending: "待审核",
};

export default function MerchantBrokersPage() {
  const [data, setData] = useState<BrokerList | null>(null);
  const [pending, setPending] = useState<PendingBinding[]>([]);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [list, bindings] = await Promise.all([
        merchantApi<BrokerList>(
          `/admin/merchant/brokers${queryString({ page: 1, page_size: 50, keyword: keyword.trim() || undefined })}`,
        ),
        merchantApi<PendingBinding[]>("/admin/merchant/bindings/pending"),
      ]);
      setData(list);
      setPending(bindings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeStatus = async (id: string, target: "disabled" | "unbound") => {
    try {
      await merchantApi(`/admin/merchant/brokers/${id}/status`, {
        method: "POST",
        body: JSON.stringify({ target_status: target, reason: "后台操作" }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    }
  };

  const approveBinding = async (id: string, approve: boolean) => {
    try {
      await merchantApi(`/admin/merchant/bindings/${id}/approve`, {
        method: "POST",
        body: JSON.stringify({ approve, remark: approve ? null : "后台驳回" }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "审核失败");
    }
  };

  return (
    <div className="min-h-screen bg-fog">
      <PageContainer className="flex flex-col gap-6">
        <PageHeader title="经纪人管理" description="经纪人档案、门店绑定与换绑/解绑审批" />

        <Card className="flex flex-wrap gap-3 p-4">
          <Input
            className="w-72"
            placeholder="姓名 / 手机号"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && void load()}
          />
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            查询
          </Button>
        </Card>

        {error ? <Card className="p-4 text-sm text-error">{error}</Card> : null}

        {pending.length ? (
          <Card className="p-4">
            <div className="mb-3 text-sm font-medium">待审核绑定申请（{pending.length}）</div>
            <div className="space-y-2">
              {pending.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-mist p-3 text-sm">
                  <span>
                    {item.broker_name || "经纪人"} · {item.store_name} · {item.reason || "换绑/解绑"}
                  </span>
                  <span className="flex gap-2">
                    <Button size="sm" onClick={() => void approveBinding(item.id, true)}>
                      通过
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void approveBinding(item.id, false)}>
                      驳回
                    </Button>
                  </span>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        {loading ? <Card className="p-6 text-sm text-muted-foreground">加载中...</Card> : null}

        {data ? (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-mist text-left text-xs text-graphite">
                <tr>
                  <th className="px-4 py-3">姓名</th>
                  <th className="px-4 py-3">手机号</th>
                  <th className="px-4 py-3">所属门店</th>
                  <th className="px-4 py-3">绑定状态</th>
                  <th className="px-4 py-3">来源</th>
                  <th className="px-4 py-3">推荐线索</th>
                  <th className="px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id} className="border-t border-mist">
                    <td className="px-4 py-3 font-medium">{item.name}</td>
                    <td className="px-4 py-3">{item.phone_masked}</td>
                    <td className="px-4 py-3">{item.store_name || "—"}</td>
                    <td className="px-4 py-3">
                      <Badge variant={item.bind_status === "disabled" ? "destructive" : "secondary"}>
                        {STATUS_LABELS[item.bind_status] || item.bind_status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-graphite">{item.source}</td>
                    <td className="px-4 py-3">{item.recommendation_count}</td>
                    <td className="px-4 py-3">
                      {item.bind_status === "disabled" ? (
                        <Button size="sm" variant="outline" onClick={() => void changeStatus(item.id, "unbound")}>
                          启用
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => void changeStatus(item.id, "disabled")}>
                          停用
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {data.items.length === 0 ? (
                  <tr>
                    <td className="px-4 py-10 text-center text-sm text-graphite" colSpan={7}>
                      暂无经纪人
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </Card>
        ) : null}
      </PageContainer>
    </div>
  );
}
