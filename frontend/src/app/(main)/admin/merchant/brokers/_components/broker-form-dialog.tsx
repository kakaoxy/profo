"use client";

import { useEffect, useState } from "react";

import { Field } from "@/app/(main)/admin/_components/field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { components } from "@/lib/api-types";
import { merchantApi } from "../../_components/merchant-api";
import { BrokerStorePicker } from "./broker-store-picker";

type Broker = components["schemas"]["BrokerResponse"];

/**
 * 新建 / 编辑经纪人弹层（REQ-IT7-03 设计稿）.
 *
 * 新建时手机号必填（决定档案唯一性），编辑时手机号留空表示不修改；
 * 绑定门店只在新建时选择，后续调整走详情抽屉里的「换绑」动作。
 */
export function BrokerFormDialog({
  open,
  onOpenChange,
  brokerId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brokerId: string | null;
  onSaved: () => void;
}) {
  const editing = Boolean(brokerId);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [storeId, setStoreId] = useState("");
  const [storeName, setStoreName] = useState("");
  const [remark, setRemark] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setPhone("");
    setStoreId("");
    setStoreName("");
    setRemark("");
    setName("");
    if (!brokerId) return;
    let cancelled = false;
    setLoading(true);
    merchantApi<Broker>(`/admin/merchant/brokers/${brokerId}`)
      .then((broker) => {
        if (cancelled) return;
        setName(broker.name);
        setRemark(broker.remark || "");
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "加载经纪人失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, brokerId]);

  const save = async () => {
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    if (!trimmedName) {
      setError("请填写经纪人姓名");
      return;
    }
    if (!editing && !/^1\d{10}$/.test(trimmedPhone)) {
      setError("请填写 11 位手机号");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (editing && brokerId) {
        await merchantApi(`/admin/merchant/brokers/${brokerId}`, {
          method: "PUT",
          body: JSON.stringify({
            name: trimmedName,
            phone: trimmedPhone || undefined,
            remark: remark.trim() || null,
          }),
        });
      } else {
        await merchantApi<Broker>("/admin/merchant/brokers", {
          method: "POST",
          body: JSON.stringify({
            name: trimmedName,
            phone: trimmedPhone,
            store_id: storeId || undefined,
            remark: remark.trim() || null,
          }),
        });
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{editing ? "编辑经纪人资料" : "新建经纪人"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "手机号留空表示不修改；绑定门店请在详情抽屉中换绑。"
              : "手机号用于绑定唯一档案；创建后可在详情抽屉里分配门店。"}
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <p className="text-sm text-graphite">加载中…</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="姓名" required>
              <Input
                aria-label="经纪人姓名"
                placeholder="请输入经纪人姓名"
                maxLength={50}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field label="手机号" required={!editing} hint={editing ? "留空表示不修改" : undefined}>
              <Input
                aria-label="经纪人手机号"
                placeholder="11 位手机号"
                inputMode="tel"
                maxLength={11}
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </Field>
            {!editing ? (
              <div className="sm:col-span-2">
                <Field label="绑定门店" hint="可不选，后续由经纪人扫码或申请绑定；输入关键词搜索">
                  <BrokerStorePicker
                    ariaLabel="绑定门店"
                    value={storeId}
                    selectedName={storeName}
                    onChange={(store) => {
                      setStoreId(store?.id ?? "");
                      setStoreName(store?.store_name ?? "");
                    }}
                  />
                </Field>
              </div>
            ) : null}
            <div className="sm:col-span-2">
              <Field label="备注">
                <Textarea
                  aria-label="经纪人备注"
                  rows={3}
                  maxLength={500}
                  placeholder="选填，例如熟悉商圈、原从业经历"
                  value={remark}
                  onChange={(event) => setRemark(event.target.value)}
                />
              </Field>
            </div>
          </div>
        )}
        {error ? <p className="text-sm text-error">{error}</p> : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={() => void save()} disabled={saving || loading}>
            {saving ? "保存中…" : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
