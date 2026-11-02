"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import type { components } from "@/lib/api-types";
import { merchantApi, queryString } from "../../_components/merchant-api";

type StoreList = components["schemas"]["MerchantStoreListResponse"];
type StoreItem = StoreList["items"][number];

/**
 * 门店搜索选择器（REQ-IT7-05）.
 *
 * 门店量级可能上万，不能用一次性加载的 Select；这里改为关键词远程搜索（每页 20 条），
 * 选中后展示已选门店，可点「更换」重新搜索。
 */
export function BrokerStorePicker({
  value,
  selectedName,
  onChange,
  ariaLabel = "搜索新门店",
  placeholder = "输入门店名称 / 地址 / 公司搜索",
}: {
  value: string;
  selectedName: string;
  onChange: (store: StoreItem | null) => void;
  ariaLabel?: string;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      const current = ++requestId.current;
      setLoading(true);
      setError("");
      merchantApi<StoreList>(
        `/admin/merchant/stores${queryString({ page: 1, page_size: 20, keyword: query.trim() || undefined })}`,
      )
        .then((result) => {
          if (current === requestId.current) setOptions(result.items);
        })
        .catch((err: unknown) => {
          if (current === requestId.current) setError(err instanceof Error ? err.message : "门店搜索失败");
        })
        .finally(() => {
          if (current === requestId.current) setLoading(false);
        });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [open, query]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-inputs border border-fog bg-fog px-4 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{selectedName || value}</p>
          <p className="mt-0.5 text-[11px] text-graphite">已选择门店</p>
        </div>
        <button
          type="button"
          className="flex shrink-0 items-center gap-1 text-xs text-graphite underline-offset-4 hover:underline"
          onClick={() => {
            onChange(null);
            setQuery("");
            setOpen(true);
          }}
        >
          <X className="h-3.5 w-3.5" />
          更换
        </button>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dove" strokeWidth={1.7} />
      <Input
        aria-label={ariaLabel}
        className="pl-9"
        placeholder={placeholder}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
          if (event.key === "Enter" && open && options.length) {
            event.preventDefault();
            onChange(options[0]);
            setQuery("");
            setOpen(false);
          }
        }}
      />
      {open ? (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-inputs border border-fog bg-white py-1 shadow-steep-sm">
          {loading ? (
            <p className="px-4 py-3 text-xs text-graphite">搜索中…</p>
          ) : error ? (
            <p className="px-4 py-3 text-xs text-error">{error}</p>
          ) : options.length ? (
            <ul role="listbox" aria-label="门店搜索结果">
              {options.map((store) => (
                <li key={store.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    className="flex w-full flex-col items-start px-4 py-2.5 text-left hover:bg-fog"
                    onClick={() => {
                      onChange(store);
                      setQuery("");
                      setOpen(false);
                    }}
                  >
                    <span className="text-sm text-ink">{store.store_name}</span>
                    <span className="mt-0.5 text-[11px] text-graphite">
                      {[store.company_name, store.district].filter(Boolean).join(" · ")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-3 text-xs text-graphite">没有匹配的门店</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
