"use client";

/**
 * 业务字典配置页（/admin/settings/dicts，仅 admin · 权限码 dict:manage）.
 *
 * 四组字典：线索归因渠道 / 招募来源 / 文书模板 / 改造阶段别名。
 * - 只增不删（spec D6）：条目「停用」而非删除，历史单据按存储值原样展示；
 * - 归因渠道支持「未纳管值」面板：宽松校验（spec D5）落库的字典外值可一键转正；
 * - 改造阶段别名仅影响展示名，入库中文值不变（spec D4，页面显式提示）；
 * - 所有写操作经后端 Service 并写 operation_logs（D7）。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { client } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { components } from "@/lib/api-types";

type DictGroup = components["schemas"]["BizDictGroupResponse"];
type DictItem = components["schemas"]["BizDictItemResponse"];
type UnmanagedValue = components["schemas"]["BizDictUnmanagedValue"];

/** 后端错误体 → 可读消息（统一错误格式 {"code","message"}，回退 FastAPI detail） */
function errorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object") {
    const payload = error as { message?: unknown; detail?: unknown };
    if (typeof payload.message === "string") return payload.message;
    if (typeof payload.detail === "string") return payload.detail;
  }
  return fallback;
}

/** 需业务形式分组的字典组（文书模板） */
const BUSINESS_FORM_GROUPS = new Set(["document_template"]);
const BUSINESS_FORM_LABELS: Record<string, string> = { agent: "代理美化", wholesale: "收购美化" };

/** 组内行编辑态（label/sortOrder 本地脏值） */
interface RowDraft {
  label: string;
  sortOrder: string;
}

export function DictManageClient() {
  const [groups, setGroups] = useState<DictGroup[]>([]);
  const [activeCode, setActiveCode] = useState<string>("");
  const [items, setItems] = useState<DictItem[]>([]);
  const [unmanaged, setUnmanaged] = useState<UnmanagedValue[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [creating, setCreating] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newBusinessForm, setNewBusinessForm] = useState("agent");

  const activeGroup = useMemo(
    () => groups.find((group) => group.dict_code === activeCode),
    [groups, activeCode],
  );

  const loadGroups = useCallback(async () => {
    const { data, error, response } = await client.GET("/api/v1/admin/dicts");
    if (response?.status === 403) {
      setForbidden(true);
      return;
    }
    if (error || !data) {
      toast.error("字典组加载失败");
      return;
    }
    setGroups(data);
    setActiveCode((current) => current || data[0]?.dict_code || "");
  }, []);

  const loadItems = useCallback(async (dictCode: string) => {
    const { data, error } = await client.GET("/api/v1/admin/dicts/{dict_code}/items", {
      params: { path: { dict_code: dictCode } },
    });
    if (error || !data) {
      toast.error("字典条目加载失败");
      return;
    }
    setItems(data);
    setDrafts(
      Object.fromEntries(
        data.map((item) => [item.id, { label: item.label, sortOrder: String(item.sort_order) }]),
      ),
    );
  }, []);

  const loadUnmanaged = useCallback(async (dictCode: string) => {
    if (dictCode !== "lead_attr_channel") {
      setUnmanaged([]);
      return;
    }
    const { data } = await client.GET("/api/v1/admin/dicts/{dict_code}/unmanaged", {
      params: { path: { dict_code: dictCode } },
    });
    setUnmanaged(data?.items ?? []);
  }, []);

  useEffect(() => {
    void (async () => {
      await loadGroups();
      setLoading(false);
    })();
  }, [loadGroups]);

  useEffect(() => {
    if (!activeCode) return;
    void (async () => {
      await Promise.all([loadItems(activeCode), loadUnmanaged(activeCode)]);
    })();
  }, [activeCode, loadItems, loadUnmanaged]);

  const refresh = useCallback(async () => {
    await Promise.all([loadGroups(), loadItems(activeCode), loadUnmanaged(activeCode)]);
  }, [activeCode, loadGroups, loadItems, loadUnmanaged]);

  /** 保存行（label/排序） */
  const saveRow = async (item: DictItem) => {
    const draft = drafts[item.id];
    if (!draft) return;
    const sortOrder = Number(draft.sortOrder);
    if (!draft.label.trim()) {
      toast.error("展示名不能为空");
      return;
    }
    if (!Number.isInteger(sortOrder) || sortOrder < 0) {
      toast.error("排序值需为非负整数");
      return;
    }
    setSavingId(item.id);
    const { error } = await client.PUT("/api/v1/admin/dicts/{dict_code}/items/{item_id}", {
      params: { path: { dict_code: activeCode, item_id: item.id } },
      body: { label: draft.label.trim(), sort_order: sortOrder },
    });
    setSavingId(null);
    if (error) {
      toast.error(errorMessage(error, "保存失败"));
      return;
    }
    toast.success("已保存");
    await refresh();
  };

  /** 启用/停用（停用不删） */
  const toggleEnabled = async (item: DictItem, enabled: boolean) => {
    setSavingId(item.id);
    const { error } = await client.PUT("/api/v1/admin/dicts/{dict_code}/items/{item_id}", {
      params: { path: { dict_code: activeCode, item_id: item.id } },
      body: { enabled },
    });
    setSavingId(null);
    if (error) {
      toast.error(errorMessage(error, "操作失败"));
      return;
    }
    toast.success(enabled ? "已启用" : "已停用（历史单据展示不变）");
    await refresh();
  };

  /** 新增条目 */
  const createItem = async () => {
    const code = newCode.trim();
    const label = newLabel.trim();
    if (!code || !label) {
      toast.error("编码与展示名必填");
      return;
    }
    setCreating(true);
    const { error } = await client.POST("/api/v1/admin/dicts/{dict_code}/items", {
      params: { path: { dict_code: activeCode } },
      body: {
        code,
        label,
        ...(BUSINESS_FORM_GROUPS.has(activeCode) ? { business_form: newBusinessForm } : {}),
      },
    });
    setCreating(false);
    if (error) {
      toast.error(errorMessage(error, "新增失败"));
      return;
    }
    toast.success("已新增");
    setNewCode("");
    setNewLabel("");
    await refresh();
  };

  /** 未纳管值一键转正（编码=原值，展示名默认同值，可后续改） */
  const promote = async (value: string) => {
    setCreating(true);
    const { error } = await client.POST("/api/v1/admin/dicts/{dict_code}/items", {
      params: { path: { dict_code: activeCode } },
      body: { code: value, label: value },
    });
    setCreating(false);
    if (error) {
      toast.error(errorMessage(error, "转正失败"));
      return;
    }
    toast.success("已转正");
    await refresh();
  };

  if (forbidden) {
    return (
      <p className="text-[14px] text-slate">当前账号无 dict:manage 权限，无法访问字典配置。</p>
    );
  }

  return (
    <>
      {loading ? (
        <div className="flex items-center gap-2 text-[14px] text-slate">
          <Loader2 className="size-4 animate-spin" /> 加载中…
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2" role="tablist">
            {groups.map((group) => (
              <button
                key={group.dict_code}
                type="button"
                role="tab"
                aria-selected={group.dict_code === activeCode}
                onClick={() => setActiveCode(group.dict_code)}
                className={cn(
                  "rounded-inputs border px-3 py-1.5 text-[13px] transition-colors",
                  group.dict_code === activeCode
                    ? "border-ink bg-ink text-pure-white"
                    : "border-dove bg-white text-graphite hover:border-ink/40",
                )}
                data-testid={`dict-group-${group.dict_code}`}
              >
                {group.name}
                <span className="ml-1.5 opacity-70">
                  {group.enabled_count}/{group.item_count}
                </span>
              </button>
            ))}
          </div>

          {activeGroup ? <p className="text-[13px] text-slate">{activeGroup.description}</p> : null}

          {activeCode === "renovation_stage_alias" ? (
            <p className="rounded-inputs bg-apricot-wash/60 px-3 py-2 text-[13px] text-rust">
              仅修改前台展示名：项目入库值（拆除/设计/水电/木瓦/油漆/交付/已完成）不变，历史单据与状态日志展示不受影响。
            </p>
          ) : null}

          <div className="overflow-hidden rounded-cards border border-dove bg-white">
            <table className="w-full text-[13px]">
              <thead className="bg-fog text-slate">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">编码</th>
                  {BUSINESS_FORM_GROUPS.has(activeCode) ? (
                    <th className="px-3 py-2 text-left font-medium">业务形式</th>
                  ) : null}
                  <th className="px-3 py-2 text-left font-medium">展示名</th>
                  <th className="px-3 py-2 text-left font-medium">排序</th>
                  <th className="px-3 py-2 text-left font-medium">启用</th>
                  <th className="px-3 py-2 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const draft = drafts[item.id] ?? {
                    label: item.label,
                    sortOrder: String(item.sort_order),
                  };
                  const dirty =
                    draft.label !== item.label || draft.sortOrder !== String(item.sort_order);
                  return (
                    <tr
                      key={item.id}
                      className="border-t border-fog"
                      data-testid={`dict-row-${item.code}`}
                    >
                      <td className="px-3 py-2 font-mono text-[12px] text-graphite">
                        {item.code}
                        {item.is_builtin ? (
                          <Badge className="ml-2 border-transparent bg-fog text-graphite">
                            预置
                          </Badge>
                        ) : null}
                      </td>
                      {BUSINESS_FORM_GROUPS.has(activeCode) ? (
                        <td className="px-3 py-2 text-slate">
                          {item.business_form
                            ? (BUSINESS_FORM_LABELS[item.business_form] ?? item.business_form)
                            : "-"}
                        </td>
                      ) : null}
                      <td className="px-3 py-2">
                        <Input
                          value={draft.label}
                          aria-label={`展示名-${item.code}`}
                          onChange={(event) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [item.id]: { ...draft, label: event.target.value },
                            }))
                          }
                          className="h-8 w-52 rounded-inputs border-dove text-[13px]"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={draft.sortOrder}
                          aria-label={`排序-${item.code}`}
                          inputMode="numeric"
                          onChange={(event) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [item.id]: { ...draft, sortOrder: event.target.value },
                            }))
                          }
                          className="h-8 w-20 rounded-inputs border-dove text-[13px]"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Switch
                          checked={item.enabled}
                          aria-label={`启用-${item.code}`}
                          disabled={savingId === item.id}
                          onCheckedChange={(checked) => void toggleEnabled(item, checked)}
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          size="sm"
                          variant={dirty ? "default" : "outline"}
                          disabled={!dirty || savingId === item.id}
                          onClick={() => void saveRow(item)}
                        >
                          {savingId === item.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            "保存"
                          )}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-slate">
                      该字典组暂无条目
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-end gap-2 rounded-cards border border-dove bg-white p-3">
            <div className="flex flex-col gap-1">
              <label className="text-[12px] text-slate" htmlFor="dict-new-code">
                编码（落库值，创建后不可改）
              </label>
              <Input
                id="dict-new-code"
                value={newCode}
                onChange={(event) => setNewCode(event.target.value)}
                placeholder="如 douyin"
                className="h-9 w-44 rounded-inputs border-dove text-[13px]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[12px] text-slate" htmlFor="dict-new-label">
                展示名
              </label>
              <Input
                id="dict-new-label"
                value={newLabel}
                onChange={(event) => setNewLabel(event.target.value)}
                placeholder="如 抖音直播"
                className="h-9 w-44 rounded-inputs border-dove text-[13px]"
              />
            </div>
            {BUSINESS_FORM_GROUPS.has(activeCode) ? (
              <div className="flex flex-col gap-1">
                <span className="text-[12px] text-slate">业务形式</span>
                <Select value={newBusinessForm} onValueChange={setNewBusinessForm}>
                  <SelectTrigger className="h-9 w-32 rounded-inputs border-dove text-[13px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agent">代理美化</SelectItem>
                    <SelectItem value="wholesale">收购美化</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <Button
              onClick={() => void createItem()}
              disabled={creating}
              data-testid="dict-create-submit"
            >
              <Plus className="mr-1 size-4" />
              新增条目
            </Button>
          </div>

          {activeCode === "lead_attr_channel" ? (
            <div className="rounded-cards border border-dove bg-white p-3">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-[14px] font-medium text-ink">未纳管的渠道值</h2>
                <span className="text-[12px] text-slate">
                  埋点上报的字典外值（照常落库，转正后前台显示新展示名）
                </span>
              </div>
              {unmanaged.length === 0 ? (
                <p className="text-[13px] text-slate">暂无未纳管值</p>
              ) : (
                <ul className="flex flex-wrap gap-2" data-testid="dict-unmanaged-list">
                  {unmanaged.map((entry) => (
                    <li
                      key={entry.value}
                      className="flex items-center gap-2 rounded-inputs border border-dove px-2.5 py-1.5"
                    >
                      <span className="font-mono text-[12px] text-graphite">{entry.value}</span>
                      <span className="text-[12px] text-slate">{entry.count} 次</span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={creating}
                        onClick={() => void promote(entry.value)}
                      >
                        转正
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}
