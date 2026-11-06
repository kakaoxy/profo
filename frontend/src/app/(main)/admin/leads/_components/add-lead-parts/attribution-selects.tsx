"use client";

/**
 * 线索录入门店 → 经纪人二级联动.
 *
 * - 门店：正常状态门店（历史停用门店在编辑时以兜底项回显）
 * - 经纪人：已选门店时仅该门店有效绑定（bind_status=bound）；未选门店时可按姓名/手机号搜索
 * - 选中经纪人后按其当前绑定回填门店；无有效绑定则允许提交并提示「待审核」
 */
import { useEffect, useMemo, useState } from "react";
import type { components } from "@/lib/api-types";
import { merchantApi, queryString } from "@/app/(main)/admin/merchant/_components/merchant-api";

type StoreList = components["schemas"]["MerchantStoreListResponse"];
type BrokerOption = components["schemas"]["BrokerOption"];
type BrokerOptionList = components["schemas"]["BrokerOptionListResponse"];

const SELECT_CLASS =
  "w-full h-11 rounded-inputs border border-dove bg-pure-white px-3 text-sm font-medium outline-none focus:ring-2 focus:ring-ink/20 focus:border-ink/40";
const LABEL_CLASS = "text-[10px] font-black text-graphite uppercase tracking-widest ml-1";

interface AttributionSelectsProps {
  storeId: string;
  brokerId: string;
  onChange: (next: { storeId: string; brokerId: string }) => void;
  /** 编辑回显：门店/经纪人已不在可选列表时用线索快照名称兜底 */
  fallbackStoreName?: string;
  fallbackBrokerName?: string;
}

interface StoreChoice {
  id: string;
  name: string;
}

export function AttributionSelects({
  storeId,
  brokerId,
  onChange,
  fallbackStoreName,
  fallbackBrokerName,
}: AttributionSelectsProps) {
  const [stores, setStores] = useState<StoreChoice[]>([]);
  const [brokers, setBrokers] = useState<BrokerOption[]>([]);
  const [brokersLoading, setBrokersLoading] = useState(false);
  const [keywordDraft, setKeywordDraft] = useState("");
  const [keyword, setKeyword] = useState("");

  // 门店选项：仅正常状态门店（后端归属校验同口径）
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await merchantApi<StoreList>(
          `/admin/merchant/stores${queryString({ page: 1, page_size: 200, status: "normal" })}`,
        );
        if (!cancelled) {
          setStores(result.items.map((store) => ({ id: store.id, name: store.store_name })));
        }
      } catch {
        if (!cancelled) setStores([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 经纪人选项：门店已选 → 该门店有效绑定；未选门店 → 按关键字搜索（选中后回填门店）
  useEffect(() => {
    let cancelled = false;
    setBrokersLoading(true);
    void (async () => {
      try {
        const result = await merchantApi<BrokerOptionList>(
          `/admin/merchant/brokers/options${queryString(
            storeId
              ? { store_id: storeId, bind_status: "bound" }
              : { keyword: keyword.trim() || undefined },
          )}`,
        );
        if (!cancelled) {
          setBrokers(result.items.filter((broker) => broker.bind_status !== "disabled"));
        }
      } catch {
        if (!cancelled) setBrokers([]);
      } finally {
        if (!cancelled) setBrokersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storeId, keyword]);

  const storeChoices = useMemo(() => {
    const list = [...stores];
    if (storeId && !list.some((store) => store.id === storeId)) {
      list.unshift({ id: storeId, name: fallbackStoreName || "当前门店（不可选）" });
    }
    return list;
  }, [stores, storeId, fallbackStoreName]);

  const brokerChoices = useMemo(() => {
    const list = [...brokers];
    if (brokerId && !list.some((broker) => broker.id === brokerId)) {
      list.unshift({
        id: brokerId,
        name: fallbackBrokerName || "当前经纪人",
        store_id: storeId || null,
        bind_status: "bound",
      });
    }
    return list;
  }, [brokers, brokerId, storeId, fallbackBrokerName]);

  // 已停用/已合并门店不在可选列表中，但回填的历史归属仍会带上该 storeId：
  // 后端会拒绝这类归属，这里提前提示，避免用户误以为「提交后进入待审核」。
  const storeUnavailable = Boolean(storeId) && !stores.some((store) => store.id === storeId);

  if (storeChoices.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className={LABEL_CLASS}>推荐门店</label>
          <select
            className={SELECT_CLASS}
            value={storeId}
            aria-label="推荐门店"
            onChange={(event) => onChange({ storeId: event.target.value, brokerId: "" })}
          >
            <option value="">不指定门店</option>
            {storeChoices.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
          {storeUnavailable ? (
            <p className="ml-1 text-[11px] text-rust">
              当前门店已停用或已合并，不能保存归属，请更换门店。
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <label className={LABEL_CLASS}>推荐经纪人</label>
          {!storeId && (
            <input
              className={SELECT_CLASS}
              placeholder="搜索经纪人姓名/手机号，回车查询"
              value={keywordDraft}
              aria-label="搜索经纪人"
              onChange={(event) => setKeywordDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  setKeyword(keywordDraft);
                }
              }}
            />
          )}
          <select
            className={SELECT_CLASS}
            value={brokerId}
            aria-label="推荐经纪人"
            disabled={brokersLoading}
            onChange={(event) => {
              const value = event.target.value;
              if (!value) {
                onChange({ storeId, brokerId: "" });
                return;
              }
              const picked = brokerChoices.find((broker) => broker.id === value);
              onChange({ storeId: storeId || picked?.store_id || "", brokerId: value });
            }}
          >
            <option value="">{brokersLoading ? "加载中…" : "不指定经纪人"}</option>
            {brokerChoices.map((broker) => (
              <option key={broker.id} value={broker.id}>
                {storeId ? broker.name : `${broker.name}（${broker.store_id ? "已绑定门店" : "未绑定门店"}）`}
              </option>
            ))}
          </select>
          {storeId && !brokersLoading && brokers.length === 0 ? (
            <p className="ml-1 text-[11px] text-graphite">该门店暂无可用经纪人，可只保存门店。</p>
          ) : null}
          {brokerId && !storeId ? (
            <p className="ml-1 text-[11px] text-rust">
              该经纪人未绑定门店，提交后将进入待审核。
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
