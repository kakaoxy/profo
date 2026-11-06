"use client";

import Link from "next/link";
import { CircleAlert, Eye, Inbox, MoreHorizontal, Plus, Trash2 } from "lucide-react";

import { StatusBadge } from "@/app/(main)/admin/_components/status-badge";
import { SteepButton } from "@/components/custom/steep-controls";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import type { components } from "@/lib/api-types";
import {
  cooperationTone,
  formatDateTime,
  reviewTone,
  REVIEW_LABELS,
  storeTone,
  STORE_STATUS_LABELS,
} from "./store-status";

type StoreList = components["schemas"]["MerchantStoreListResponse"];
type StoreItem = components["schemas"]["MerchantStoreListItem"];

function isRowAction(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest("button, a, [role='menuitem'], input, select, textarea"))
  );
}

export function StoreList({
  data,
  loading,
  error,
  hasActiveFilters,
  onRetry,
  onClear,
  onOpenStore,
  onDeleteStore,
}: {
  data: StoreList | null;
  loading: boolean;
  error: string;
  hasActiveFilters: boolean;
  onRetry: () => void;
  onClear: () => void;
  onOpenStore: (store: StoreItem) => void;
  onDeleteStore: (store: StoreItem) => void;
}) {
  if (error) {
    return (
      <Card
        role="alert"
        className="rounded-cards gap-0 border border-apricot-edge/50 bg-apricot-wash/55 p-5 shadow-steep"
      >
        <div className="flex items-start gap-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-pure-white text-rust">
            <CircleAlert className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] leading-[1.5] text-ink">门店列表加载失败：{error}</p>
            <SteepButton variant="text" className="mt-2" onClick={onRetry}>
              重试
            </SteepButton>
          </div>
        </div>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card
        aria-busy="true"
        className="rounded-cards gap-0 border-0 bg-pure-white p-5 shadow-steep"
      >
        <span className="sr-only">正在加载门店列表</span>
        <div className="divide-y divide-dove/40 overflow-hidden rounded-[16px]">
          <div className="flex h-12 items-center gap-4 bg-fog px-4">
            {[28, 18, 16, 14, 18, 14].map((width, index) => (
              <Skeleton
                key={index}
                className="h-3.5 rounded-full bg-dove/40"
                style={{ width: `${width}%` }}
              />
            ))}
          </div>
          {Array.from({ length: 6 }).map((_, rowIndex) => (
            <div key={rowIndex} className="flex h-[84px] items-center gap-4 px-4">
              <div className="w-[34%] space-y-2">
                <Skeleton className="h-4 w-2/3 rounded-full bg-fog" />
                <Skeleton className="h-3.5 w-5/6 rounded-full bg-fog" />
              </div>
              <Skeleton className="h-4 w-[13%] rounded-full bg-fog" />
              <Skeleton className="h-7 w-[90px] rounded-full bg-fog" />
              <Skeleton className="h-7 w-[78px] rounded-full bg-fog" />
              <Skeleton className="h-4 w-[11%] rounded-full bg-fog" />
              <Skeleton className="h-4 w-[14%] rounded-full bg-fog" />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  if (!data) return null;

  if (data.items.length === 0) {
    return (
      <Card className="rounded-cards gap-0 border-0 bg-pure-white p-5 shadow-steep">
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-fog text-graphite">
            <Inbox className="size-5" />
          </span>
          <div>
            <p className="text-[16px] leading-[1.38] text-ink">没有符合条件的门店</p>
            <p className="mt-1 text-[14px] leading-[1.5] text-graphite">
              调整筛选条件，或新建一家门店再继续。
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4">
            {hasActiveFilters ? (
              <SteepButton variant="text" onClick={onClear}>
                清空筛选
              </SteepButton>
            ) : null}
            <SteepButton variant="text" asChild>
              <Link href="/admin/merchant/stores/new">
                <Plus />
                新建门店
              </Link>
            </SteepButton>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="rounded-cards gap-0 border-0 bg-pure-white p-5 shadow-steep">
      <div className="hidden overflow-hidden rounded-[16px] xl:block">
        <table className="w-full table-fixed">
          <caption className="sr-only">门店列表</caption>
          <colgroup>
            <col className="w-[33%]" />
            <col className="w-[13%]" />
            <col className="w-[12%]" />
            <col className="w-[12%]" />
            <col className="w-[11%]" />
            <col className="w-[14%]" />
            <col className="w-[5%]" />
          </colgroup>
          <thead className="bg-fog">
            <tr>
              <th scope="col" className="h-12 px-4 text-left text-[14px] font-[450] text-graphite">
                门店
              </th>
              <th scope="col" className="h-12 px-4 text-left text-[14px] font-[450] text-graphite">
                区域 / 商圈
              </th>
              <th scope="col" className="h-12 px-4 text-left text-[14px] font-[450] text-graphite">
                合作状态
              </th>
              <th scope="col" className="h-12 px-4 text-left text-[14px] font-[450] text-graphite">
                审核状态
              </th>
              <th scope="col" className="h-12 px-4 text-left text-[14px] font-[450] text-graphite">
                负责人
              </th>
              <th scope="col" className="h-12 px-4 text-left text-[14px] font-[450] text-graphite">
                最近拜访
              </th>
              <th scope="col" className="h-12 px-2 text-left text-[14px] font-[450] text-graphite">
                <span className="sr-only">操作</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => (
              <tr
                key={item.id}
                onClick={(event) => {
                  if (!isRowAction(event.target)) onOpenStore(item);
                }}
                className="cursor-pointer border-t border-dove/40 transition-colors hover:bg-fog/60"
              >
                <td className="h-[84px] px-4 align-middle">
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => onOpenStore(item)}
                      className="block max-w-full cursor-pointer truncate text-left text-[15px] font-[450] tracking-[-0.009em] text-ink transition-colors hover:text-rust focus-visible:ring-2 focus-visible:ring-ink/20 focus-visible:outline-none"
                    >
                      {item.store_name}
                    </button>
                    <p className="mt-1 truncate text-[14px] leading-[1.4] text-graphite">
                      {item.company_name} · {item.address}
                    </p>
                  </div>
                </td>
                <td className="h-[84px] px-4 align-middle">
                  <p className="truncate text-[14px] leading-[1.4] text-ink">{item.district}</p>
                  <p className="mt-1 truncate text-[14px] leading-[1.4] text-graphite">
                    {item.business_circle}
                  </p>
                </td>
                <td className="h-[84px] px-4 align-middle">
                  <StatusBadge tone={cooperationTone(item.cooperation_status)}>
                    {item.cooperation_status_label}
                  </StatusBadge>
                </td>
                <td className="h-[84px] px-4 align-middle">
                  <StatusBadge tone={reviewTone(item.review_status)}>
                    {REVIEW_LABELS[item.review_status] ?? item.review_status}
                  </StatusBadge>
                </td>
                <td className="h-[84px] px-4 align-middle">
                  <span className="block truncate text-[14px] text-ink">
                    {item.owner_employee_name || "—"}
                  </span>
                </td>
                <td className="h-[84px] px-4 align-middle">
                  <span className="block whitespace-nowrap text-[14px] text-graphite tabular-nums">
                    {formatDateTime(item.last_visit_at)}
                  </span>
                </td>
                <td className="h-[84px] px-2 align-middle">
                  <StoreRowMenu
                    item={item}
                    onOpen={() => onOpenStore(item)}
                    onDelete={() => onDeleteStore(item)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col divide-y divide-dove/40 xl:hidden">
        {data.items.map((item) => (
          <article
            key={item.id}
            onClick={(event) => {
              if (!isRowAction(event.target)) onOpenStore(item);
            }}
            className="cursor-pointer py-5 transition-colors first:pt-0 last:pb-0 hover:bg-fog/40"
            data-testid="store-card"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={() => onOpenStore(item)}
                  className="block max-w-full cursor-pointer truncate text-left text-[15px] font-[450] tracking-[-0.009em] text-ink transition-colors hover:text-rust focus-visible:ring-2 focus-visible:ring-ink/20 focus-visible:outline-none"
                >
                  {item.store_name}
                </button>
                <p className="mt-1 truncate text-[14px] leading-[1.4] text-graphite">
                  {item.company_name} · {item.address}
                </p>
              </div>
              <StoreRowMenu
                item={item}
                onOpen={() => onOpenStore(item)}
                onDelete={() => onDeleteStore(item)}
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusBadge tone={cooperationTone(item.cooperation_status)}>
                {item.cooperation_status_label}
              </StatusBadge>
              <StatusBadge tone={reviewTone(item.review_status)}>
                {REVIEW_LABELS[item.review_status] ?? item.review_status}
              </StatusBadge>
              <StatusBadge tone={storeTone(item.status)}>
                {STORE_STATUS_LABELS[item.status] ?? item.status}
              </StatusBadge>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3">
              <div>
                <dt className="text-[14px] text-graphite">区域 / 商圈</dt>
                <dd className="mt-1 text-[14px] text-ink">
                  {item.district} · {item.business_circle}
                </dd>
              </div>
              <div>
                <dt className="text-[14px] text-graphite">负责人</dt>
                <dd className="mt-1 text-[14px] text-ink">{item.owner_employee_name || "—"}</dd>
              </div>
              <div>
                <dt className="text-[14px] text-graphite">经纪人数量</dt>
                <dd className="mt-1 text-[14px] text-ink tabular-nums">{item.broker_count}</dd>
              </div>
              <div>
                <dt className="text-[14px] text-graphite">最近拜访</dt>
                <dd className="mt-1 text-[14px] text-ink tabular-nums">
                  {formatDateTime(item.last_visit_at)}
                </dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </Card>
  );
}

function StoreRowMenu({
  item,
  onOpen,
  onDelete,
}: {
  item: StoreItem;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SteepButton variant="icon" aria-label={`更多操作 ${item.store_name}`}>
          <MoreHorizontal />
        </SteepButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-40 rounded-[16px] border-dove/40 bg-pure-white p-1 shadow-steep"
      >
        <DropdownMenuItem
          onSelect={onOpen}
          className="rounded-xl px-3 py-2.5 text-[14px] font-[450] text-ink focus:bg-fog"
        >
          <Eye />
          查看详情
        </DropdownMenuItem>
        <DropdownMenuItem
          aria-label={`删除门店 ${item.store_name}`}
          onSelect={onDelete}
          className="rounded-xl px-3 py-2.5 text-[14px] font-[450] text-rust focus:bg-apricot-wash focus:text-rust"
        >
          <Trash2 />
          删除门店
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
