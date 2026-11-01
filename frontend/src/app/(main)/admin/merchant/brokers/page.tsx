"use client";

import { useEffect, useState } from "react";

import { PageContainer } from "@/app/(main)/admin/_components/page-container";
import { PageHeader } from "@/app/(main)/admin/_components/page-header";
import { Field } from "@/app/(main)/admin/merchant/_components/field";
import { StatusBadge } from "@/app/(main)/admin/merchant/_components/status-badge";
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

type BrokerList = components["schemas"]["BrokerListResponse"];
type Broker = components["schemas"]["BrokerResponse"];
type StoreList = components["schemas"]["MerchantStoreListResponse"];
type PendingBinding = components["schemas"]["BrokerBindingResponse"];

const SOURCE_LABELS: Record<string, string> = {
  self_apply: "自主申请",
  employee: "员工推荐",
  backoffice: "后台新增",
  broker: "经纪人推荐",
  import: "批量导入",
};

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
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stores, setStores] = useState<StoreList["items"]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Broker | null>(null);
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formStoreId, setFormStoreId] = useState("");
  const [formRemark, setFormRemark] = useState("");
  const [saving, setSaving] = useState(false);
  const [changeTarget, setChangeTarget] = useState<BrokerList["items"][number] | null>(null);
  const [changeStoreId, setChangeStoreId] = useState("");
  const [changeReasonText, setChangeReasonText] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [list, bindings, storeList] = await Promise.all([
        merchantApi<BrokerList>(
          `/admin/merchant/brokers${queryString({ page: 1, page_size: 50, keyword: keyword.trim() || undefined })}`,
        ),
        merchantApi<PendingBinding[]>("/admin/merchant/bindings/pending"),
        merchantApi<StoreList>("/admin/merchant/stores?page=1&page_size=200"),
      ]);
      setData(list);
      setPending(bindings);
      setStores(storeList.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setFormName("");
    setFormPhone("");
    setFormStoreId("");
    setFormRemark("");
    setFormOpen(true);
  };

  const openEdit = async (item: BrokerList["items"][number]) => {
    try {
      const broker = await merchantApi<Broker>(`/admin/merchant/brokers/${item.id}`);
      setEditing(broker);
      setFormName(broker.name);
      setFormPhone("");
      setFormStoreId(broker.store_id || "");
      setFormRemark(broker.remark || "");
      setFormOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载经纪人失败");
    }
  };

  const saveBroker = async () => {
    const name = formName.trim();
    const phone = formPhone.trim();
    if (!name || (!editing && !phone)) {
      setError("新建需填写姓名和手机号；编辑时手机号留空表示不修改");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (editing) {
        await merchantApi(`/admin/merchant/brokers/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify({
            name,
            phone: phone || undefined,
            remark: formRemark.trim() || null,
          }),
        });
      } else {
        await merchantApi("/admin/merchant/brokers", {
          method: "POST",
          body: JSON.stringify({
            name,
            phone,
            store_id: formStoreId || undefined,
            remark: formRemark.trim() || null,
          }),
        });
      }
      setFormOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
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
        body: JSON.stringify({ target_status: target, reason: reason.trim() || "后台操作" }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    }
  };

  const forceUnbind = async (id: string) => {
    if (!reason.trim()) {
      setError("强制解绑必须填写原因");
      return;
    }
    try {
      await merchantApi(`/admin/merchant/brokers/${id}/unbind?reason=${encodeURIComponent(reason.trim())}`, {
        method: "POST",
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "解绑失败");
    }
  };

  const submitForceChange = async () => {
    if (!changeTarget || !changeStoreId || !changeReasonText.trim()) {
      setError("请选择新门店并填写换绑原因");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await merchantApi(`/admin/merchant/brokers/${changeTarget.id}/change`, {
        method: "POST",
        body: JSON.stringify({ store_id: changeStoreId, reason: changeReasonText.trim() }),
      });
      setChangeTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "强制换绑失败");
    } finally {
      setSaving(false);
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
        <PageHeader
          title="经纪人管理"
          description="经纪人档案、门店绑定与换绑/解绑审批"
          actions={<Button onClick={openCreate}>新建经纪人</Button>}
        />

        {formOpen ? (
          <Card className="rounded-cards border-0 shadow-steep-sm flex flex-col gap-3 p-5">
            <div className="text-sm font-medium">{editing ? `编辑经纪人：${editing.name}` : "新建经纪人"}</div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="姓名" required>
                <Input value={formName} onChange={(event) => setFormName(event.target.value)} />
              </Field>
              <Field
                label="手机号"
                required={!editing}
                hint={editing ? "留空表示不修改" : undefined}
              >
                <Input
                  value={formPhone}
                  onChange={(event) => setFormPhone(event.target.value)}
                  inputMode="tel"
                />
              </Field>
              {!editing ? (
                <Field label="绑定门店" hint="可不绑定（独立经纪人），后续由经纪人扫码或申请绑定">
                  <Select
                    value={formStoreId || "none"}
                    onValueChange={(value) => setFormStoreId(value === "none" ? "" : value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">暂不绑定门店</SelectItem>
                      {stores.map((store) => (
                        <SelectItem key={store.id} value={store.id}>
                          {store.store_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              ) : null}
              <Field label="备注">
                <Input
                  value={formRemark}
                  onChange={(event) => setFormRemark(event.target.value)}
                />
              </Field>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => void saveBroker()} disabled={saving}>
                {saving ? "保存中…" : "保存"}
              </Button>
              <Button variant="outline" onClick={() => setFormOpen(false)}>
                取消
              </Button>
            </div>
          </Card>
        ) : null}

        <Card className="rounded-cards border-0 shadow-steep-sm p-5">
          {/* Card 自带 flex-col：筛选控件必须放在内层横向容器，直接挂 flex-wrap 会纵向堆叠 */}
          <div className="flex flex-wrap items-center gap-3">
            <Input
              className="w-72"
              placeholder="姓名 / 手机号"
              aria-label="搜索经纪人"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && void load()}
            />
            <Input
              className="w-72"
              placeholder="操作原因（停用/强制解绑）"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
            <Button variant="outline" onClick={() => void load()} disabled={loading}>
              查询
            </Button>
            <Button variant="outline" asChild>
              <a
                href={`/api/v1/admin/merchant/brokers/export${queryString({
                  keyword: keyword.trim() || undefined,
                })}`}
              >
                导出 CSV
              </a>
            </Button>
          </div>
        </Card>

        {changeTarget ? (
          <Card className="rounded-cards border-0 shadow-steep-sm flex flex-col gap-3 p-5">
            <div className="text-sm font-medium">强制换绑：{changeTarget.name}</div>
            <Select value={changeStoreId} onValueChange={setChangeStoreId}>
              <SelectTrigger>
                <SelectValue placeholder="选择新门店" />
              </SelectTrigger>
              <SelectContent>
                {stores.map((store) => (
                  <SelectItem key={store.id} value={store.id}>
                    {store.store_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="换绑原因（必填）"
              value={changeReasonText}
              onChange={(event) => setChangeReasonText(event.target.value)}
            />
            <div className="flex gap-2">
              <Button onClick={() => void submitForceChange()} disabled={saving}>
                确认换绑
              </Button>
              <Button variant="outline" onClick={() => setChangeTarget(null)}>
                取消
              </Button>
            </div>
          </Card>
        ) : null}

        {error ? <Card className="rounded-cards border-0 shadow-steep-sm p-5 text-sm text-error">{error}</Card> : null}

        {pending.length ? (
          <Card className="rounded-cards border-0 shadow-steep-sm p-5">
            <div className="mb-3 text-sm font-medium">待审核绑定申请（{pending.length}）</div>
            <div className="space-y-2">
              {pending.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-images bg-fog p-3 text-sm">
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

        {loading ? <Card className="rounded-cards border-0 shadow-steep-sm p-6 text-sm text-muted-foreground">加载中...</Card> : null}

        {data ? (
          <Card className="rounded-cards border-0 shadow-steep-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-fog text-left text-xs text-graphite">
                <tr>
                  <th className="px-4 py-3">姓名</th>
                  <th className="px-4 py-3">手机号</th>
                  <th className="px-4 py-3">所属门店</th>
                  <th className="px-4 py-3">绑定状态</th>
                  <th className="px-4 py-3">来源</th>
                  <th className="px-4 py-3">推荐线索</th>
                  <th className="px-4 py-3">更新时间</th>
                  <th className="px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id} className="border-t border-dove">
                    <td className="px-4 py-3 font-medium">{item.name}</td>
                    <td className="px-4 py-3">{item.phone_masked}</td>
                    <td className="px-4 py-3">{item.store_name || "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        tone={
                          item.bind_status === "bound"
                            ? "positive"
                            : item.bind_status === "pending"
                              ? "attention"
                              : "neutral"
                        }
                      >
                        {STATUS_LABELS[item.bind_status] || item.bind_status}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-xs text-graphite">
                      {SOURCE_LABELS[item.source] || item.source}
                    </td>
                    <td className="px-4 py-3">{item.recommendation_count}</td>
                    <td className="px-4 py-3 text-xs text-graphite">
                      {item.updated_at ? new Date(item.updated_at).toLocaleString("zh-CN") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <Button size="sm" variant="outline" onClick={() => void openEdit(item)}>
                          编辑
                        </Button>
                        {item.store_id ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setChangeTarget(item);
                                setChangeStoreId("");
                                setChangeReasonText("");
                              }}
                            >
                              换绑
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => void forceUnbind(item.id)}>
                              强制解绑
                            </Button>
                          </>
                        ) : null}
                        {item.bind_status === "disabled" ? (
                          <Button size="sm" variant="outline" onClick={() => void changeStatus(item.id, "unbound")}>
                            启用
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => void changeStatus(item.id, "disabled")}>
                            停用
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {data.items.length === 0 ? (
                  <tr>
                    <td className="px-4 py-10 text-center text-sm text-graphite" colSpan={8}>
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
