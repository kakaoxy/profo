"use client";

import { useCallback, useEffect, useState } from "react";

import { PageContainer } from "../../_components/page-container";
import { PageHeader } from "../../_components/page-header";
import { StatusBadge } from "../_components/status-badge";
import { merchantApi, queryString } from "../_components/merchant-api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { components } from "@/lib/api-types";

type RunRecord = components["schemas"]["MerchantNotifyRunRecord"];
type TypeStats = components["schemas"]["MerchantNotifyTypeStats"];

const STATUS_LABELS: Record<string, string> = {
  success: "成功",
  failed: "失败",
};

function statusTone(status: string | undefined, timedOut: boolean | undefined) {
  if (timedOut) return "attention" as const;
  return status === "failed" ? ("attention" as const) : ("positive" as const);
}

function statsText(stats: TypeStats | undefined): string {
  if (!stats) return "—";
  return `扫描 ${stats.scanned} / 生成 ${stats.created} / 去重 ${stats.deduped} / 失败 ${stats.failed}`;
}

/** 商户通知任务执行记录（REQ-M14-006）：按日期/类型查询，显示超时与失败明细。 */
export default function MerchantNotifyRunsPage() {
  const [records, setRecords] = useState<RunRecord[]>([]);
  const [date, setDate] = useState("");
  const [notifyType, setNotifyType] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await merchantApi<RunRecord[]>(
        `/admin/merchant/notify/runs${queryString({
          date: date || undefined,
          notify_type: notifyType === "all" ? undefined : notifyType,
          limit: 30,
        })}`,
      );
      setRecords(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [date, notifyType]);

  useEffect(() => {
    void load();
  }, [load]);

  const runDaily = async () => {
    setRunning(true);
    setNotice("");
    try {
      const result = await merchantApi<components["schemas"]["MerchantNotifyRunResponse"]>(
        "/admin/merchant/notify/run-daily",
        { method: "POST" },
      );
      setNotice(
        result.locked
          ? "已有任务在运行，本次未执行"
          : `补跑完成：协议生成 ${result.agreements.created} 条，拜访生成 ${result.visits.created} 条`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "补跑失败");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-fog">
      <PageContainer className="flex flex-col gap-6">
        <PageHeader
          title="通知任务"
          description="查看每日通知任务的扫描、生成、去重与失败明细，并支持手动补跑"
          actions={
            <Button onClick={() => void runDaily()} disabled={running}>
              {running ? "补跑中…" : "手动补跑"}
            </Button>
          }
        />

        <Card className="rounded-cards border-0 shadow-steep-sm p-5">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex items-center gap-2 whitespace-nowrap text-[13px] text-graphite">
              任务日期
              <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} aria-label="任务日期" />
            </label>
            <Select value={notifyType} onValueChange={setNotifyType}>
              <SelectTrigger className="w-40" aria-label="通知类型">
                <SelectValue placeholder="通知类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                <SelectItem value="agreement">协议到期</SelectItem>
                <SelectItem value="visit">拜访超期</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => void load()} disabled={loading}>
              查询
            </Button>
            {notice ? <span className="text-[13px] text-rust">{notice}</span> : null}
          </div>
        </Card>

        {error ? <Card className="rounded-cards border-0 shadow-steep-sm p-5 text-sm text-error">{error}</Card> : null}

        <Card className="rounded-cards border-0 shadow-steep-sm gap-0 py-0">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="bg-fog text-slate">
              <tr>
                <th className="px-4 py-3 text-left font-medium">执行时间</th>
                <th className="px-4 py-3 text-left font-medium">任务日期</th>
                <th className="px-4 py-3 text-left font-medium">状态</th>
                <th className="px-4 py-3 text-left font-medium">耗时</th>
                <th className="px-4 py-3 text-left font-medium">协议</th>
                <th className="px-4 py-3 text-left font-medium">拜访</th>
                <th className="px-4 py-3 text-left font-medium">失败明细</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => {
                const stats = record.stats;
                return (
                  <tr key={record.id} className="border-t border-dove">
                    <td className="px-4 py-3 text-xs text-graphite">
                      {new Date(record.created_at).toLocaleString("zh-CN")}
                    </td>
                    <td className="px-4 py-3 text-xs">{stats?.run_date || "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={statusTone(stats?.status, stats?.timed_out)}>
                        {stats?.timed_out ? "超时" : STATUS_LABELS[stats?.status || "success"] || stats?.status}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-xs text-graphite">
                      {stats ? `${stats.duration_ms} ms` : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-graphite">{statsText(stats?.agreements)}</td>
                    <td className="px-4 py-3 text-xs text-graphite">{statsText(stats?.visits)}</td>
                    <td className="max-w-64 truncate px-4 py-3 text-xs text-error" title={stats?.error || ""}>
                      {stats?.error || "—"}
                    </td>
                  </tr>
                );
              })}
              {!loading && records.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center text-sm text-graphite" colSpan={7}>
                    所选条件下没有任务记录
                  </td>
                </tr>
              ) : null}
              {loading ? (
                <tr>
                  <td className="px-4 py-10 text-center text-sm text-graphite" colSpan={7}>
                    加载中…
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          </div>
        </Card>
      </PageContainer>
    </div>
  );
}
