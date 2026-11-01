'use client';

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pagination } from "@/components/common/pagination";
// 深路径导入：`_components/index.ts` 是 barrel，会带上依赖 next/headers 的服务端模块，
// 在 Client Component 里从 barrel 引入会导致「You're importing a module that depends on next/headers」编译失败。
import { PageContainer } from "@/app/(main)/admin/_components/page-container";
import { PageHeader } from "@/app/(main)/admin/_components/page-header";
import { StatusBadge } from "@/app/(main)/admin/_components/status-badge";
import { Field } from "@/app/(main)/admin/_components/field";
import { adminApi, queryString } from "@/app/(main)/admin/_components/api-client";
import type { components } from "@/lib/api-types";

type DictItem = components["schemas"]["RegionDictItem"];
type DictList = components["schemas"]["RegionDictListResponse"];

type DictType = "district" | "business_circle";

type DictForm = {
  name: string;
  district: string;
  sortOrder: string;
  remark: string;
};

const EMPTY_FORM: DictForm = { name: "", district: "", sortOrder: "0", remark: "" };

const TYPE_LABELS: Record<DictType, string> = {
  district: "区域",
  business_circle: "商圈",
};

/**
 * 区域 / 商圈字典维护（REQ-IT3-01：区域与商圈属于楼盘字典，商户门店复用其候选值）.
 *
 * 字典是门店建档与编辑时的候选来源：重命名会同步小区主数据与已建门店上的同值记录，
 * 停用后该值不再出现在门店表单候选中。
 */
export default function RegionDictsPage() {
  const [dictType, setDictType] = useState<DictType>("district");
  const [statusFilter, setStatusFilter] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [items, setItems] = useState<DictItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<DictForm>(EMPTY_FORM);
  // 请求序号：只有最后一次请求的结果才允许落地，避免切类型/翻页乱序覆盖
  const requestSeq = useRef(0);

  const load = useCallback(
    async (targetPage: number, term: string) => {
      const seq = requestSeq.current + 1;
      requestSeq.current = seq;
      setLoading(true);
      setError("");
      try {
        const query = queryString({
          dict_type: dictType,
          keyword: term,
          status: statusFilter === "all" ? undefined : statusFilter,
          page: targetPage,
          page_size: pageSize,
        });
        const result = await adminApi<DictList>(`/admin/building-dictionary/region-dicts${query}`);
        if (seq !== requestSeq.current) return;
        setItems(result.items);
        setTotal(result.total);
        setPage(result.page ?? targetPage);
      } catch (err) {
        if (seq !== requestSeq.current) return;
        setError(err instanceof Error ? err.message : "字典列表加载失败");
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    },
    [dictType, pageSize, statusFilter],
  );

  useEffect(() => {
    void load(1, appliedKeyword);
  }, [load, appliedKeyword]);

  const search = () => {
    const term = keyword.trim();
    if (term === appliedKeyword) {
      void load(1, term);
      return;
    }
    setAppliedKeyword(term);
  };

  const startCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError("");
    setNotice("");
  };

  const startRename = (item: DictItem) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      district: item.district ?? "",
      sortOrder: String(item.sort_order),
      remark: item.remark ?? "",
    });
    setError("");
    setNotice("");
  };

  const submit = async () => {
    const name = form.name.trim();
    if (!name) {
      setError(`${TYPE_LABELS[dictType]}名称不能为空`);
      return;
    }
    if (dictType === "business_circle" && !form.district.trim()) {
      setError("商圈必须指定所属区域");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const body = {
        name,
        district: form.district.trim() || null,
        sort_order: Number(form.sortOrder) || 0,
        remark: form.remark.trim() || null,
      };
      if (editingId) {
        await adminApi(`/admin/building-dictionary/region-dicts/${editingId}`, {
          method: "PUT",
          body: JSON.stringify({ name: body.name, district: body.district }),
        });
        setNotice("已改名，并同步更新小区主数据与门店上的同值记录");
      } else {
        await adminApi("/admin/building-dictionary/region-dicts", {
          method: "POST",
          body: JSON.stringify({ ...body, dict_type: dictType }),
        });
        setNotice(`已新增${TYPE_LABELS[dictType]}`);
      }
      setForm(EMPTY_FORM);
      setEditingId(null);
      await load(editingId ? page : 1, appliedKeyword);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存字典项失败");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (item: DictItem) => {
    setError("");
    setNotice("");
    try {
      await adminApi(`/admin/building-dictionary/region-dicts/${item.id}/status`, {
        method: "POST",
        body: JSON.stringify({ status: item.status === "active" ? "disabled" : "active" }),
      });
      setNotice(item.status === "active" ? `已停用「${item.name}」` : `已启用「${item.name}」`);
      await load(page, appliedKeyword);
    } catch (err) {
      setError(err instanceof Error ? err.message : "状态变更失败");
    }
  };

  const syncBusinessData = async () => {
    setError("");
    setNotice("");
    try {
      const result = await adminApi<{ district: number; business_circle: number }>(
        "/admin/building-dictionary/region-dicts/sync",
        { method: "POST" },
      );
      setNotice(`同步完成：新增区域 ${result.district} 项、商圈 ${result.business_circle} 项`);
      await load(1, appliedKeyword);
    } catch (err) {
      setError(err instanceof Error ? err.message : "同步业务数据失败");
    }
  };

  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader
        title="区域商圈"
        description="维护门店建档与编辑可选的区域、商圈；改名会同步小区主数据与已建门店"
      />

      <Card className="rounded-cards border-0 shadow-steep-sm p-5">
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={dictType}
            onValueChange={(value) => {
              setDictType(value as DictType);
              // 切换字典类型后旧编辑对象不再适用，重置右侧表单避免把区域项按商圈口径提交
              setEditingId(null);
              setForm(EMPTY_FORM);
              setError("");
              setNotice("");
            }}
          >
            <SelectTrigger className="w-32" aria-label="字典类型">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="district">区域</SelectItem>
              <SelectItem value="business_circle">商圈</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32" aria-label="状态范围">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="active">仅启用</SelectItem>
              <SelectItem value="disabled">仅停用</SelectItem>
            </SelectContent>
          </Select>
          <Input
            className="w-56"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") search();
            }}
            placeholder={`按${TYPE_LABELS[dictType]}名称搜索`}
            aria-label="按名称搜索"
          />
          <Button variant="outline" onClick={search} disabled={loading}>
            {loading ? "查询中…" : "查询"}
          </Button>
          <Button variant="outline" onClick={() => void syncBusinessData()}>
            同步业务数据
          </Button>
          <Button className="ml-auto" variant="outline" onClick={startCreate}>
            新增{TYPE_LABELS[dictType]}
          </Button>
        </div>
      </Card>

      {error ? <p className="text-sm text-rust">{error}</p> : null}
      {notice ? <p className="text-sm text-graphite">{notice}</p> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <Card className="gap-0 rounded-cards border-0 p-0 shadow-steep-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-fog text-xs text-slate">
                <tr>
                  <th className="px-4 py-3 font-normal">{TYPE_LABELS[dictType]}名称</th>
                  <th className="px-4 py-3 font-normal">所属区域</th>
                  <th className="px-4 py-3 font-normal">状态</th>
                  <th className="px-4 py-3 font-normal">排序</th>
                  <th className="px-4 py-3 font-normal">备注</th>
                  <th className="px-4 py-3 font-normal">更新时间</th>
                  <th className="px-4 py-3 font-normal">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t border-dove">
                    <td className="px-4 py-3">{item.name}</td>
                    <td className="px-4 py-3 text-graphite">{item.district ?? "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={item.status === "active" ? "positive" : "neutral"}>
                        {item.status === "active" ? "启用" : "停用"}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-graphite">{item.sort_order}</td>
                    <td className="max-w-[14rem] truncate px-4 py-3 text-graphite">{item.remark ?? "—"}</td>
                    <td className="px-4 py-3 text-graphite">{new Date(item.updated_at).toLocaleString("zh-CN")}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => startRename(item)}>
                          重命名
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => void toggleStatus(item)}>
                          {item.status === "active" ? "停用" : "启用"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-graphite">
                      {loading ? "加载中…" : appliedKeyword ? "没有符合条件的记录" : `暂无${TYPE_LABELS[dictType]}，可在右侧新增`}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <Pagination
            mode="controlled"
            totalItems={total}
            currentPage={page}
            totalPages={Math.max(1, Math.ceil(total / pageSize))}
            pageSize={pageSize}
            showPageSizeSelector
            onPageChange={(next) => void load(next, appliedKeyword)}
            onPageSizeChange={setPageSize}
          />
        </Card>

        <Card className="rounded-cards border-0 shadow-steep-sm p-5">
          <div className="mb-3 text-sm font-medium">
            {editingId ? `重命名${TYPE_LABELS[dictType]}` : `新增${TYPE_LABELS[dictType]}`}
          </div>
          <div className="flex flex-col gap-3">
            <Field label={`${TYPE_LABELS[dictType]}名称`} required>
              <Input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder={`请输入${TYPE_LABELS[dictType]}名称`}
              />
            </Field>
            {dictType === "business_circle" ? (
              <Field label="所属区域" required>
                <Input
                  value={form.district}
                  onChange={(event) => setForm({ ...form, district: event.target.value })}
                  placeholder="商圈所属区域（如 浦东新区）"
                />
              </Field>
            ) : null}
            {editingId ? null : (
              <Field label="排序值">
                <Input
                  inputMode="numeric"
                  value={form.sortOrder}
                  onChange={(event) => setForm({ ...form, sortOrder: event.target.value })}
                />
              </Field>
            )}
            {editingId ? null : (
              <Field label="备注">
                <Input value={form.remark} onChange={(event) => setForm({ ...form, remark: event.target.value })} />
              </Field>
            )}
            <p className="text-xs text-graphite">
              {editingId
                ? "重命名会同步更新小区主数据与已建门店上的同值记录，请确认无误后保存。"
                : "新增后立即可在门店表单中选择；停用则从候选中移除。"}
            </p>
            <div className="flex items-center gap-2">
              <Button onClick={() => void submit()} disabled={saving}>
                {saving ? "保存中…" : "保存"}
              </Button>
              {editingId ? (
                <Button variant="outline" onClick={startCreate}>
                  取消
                </Button>
              ) : null}
            </div>
          </div>
        </Card>
      </div>
    </PageContainer>
  );
}
