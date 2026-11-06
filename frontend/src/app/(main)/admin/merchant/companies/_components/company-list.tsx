"use client";

import {
  CircleAlert,
  Inbox,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

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
  COMPANY_STATUS_LABELS,
  companyTone,
  formatCompanyDateTime,
} from "./company-status";

type CompanyItem = components["schemas"]["MerchantCompanyResponse"];

function isRowAction(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest("button, a, [role='menuitem'], input, select, textarea"))
  );
}

export function CompanyList({
  companies,
  loading,
  error,
  hasActiveFilters,
  onRetry,
  onClear,
  onCreate,
  onOpen,
  onEdit,
  onDelete,
}: {
  companies: CompanyItem[] | null;
  loading: boolean;
  error: string;
  hasActiveFilters: boolean;
  onRetry: () => void;
  onClear: () => void;
  onCreate: () => void;
  onOpen: (company: CompanyItem) => void;
  onEdit: (company: CompanyItem) => void;
  onDelete: (company: CompanyItem) => void;
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
            <p className="text-[15px] leading-[1.5] text-ink">公司列表加载失败：{error}</p>
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
        <span className="sr-only">正在加载公司列表</span>
        <div className="hidden divide-y divide-dove/40 overflow-hidden rounded-[16px] xl:block">
          <div className="flex h-12 items-center gap-4 bg-fog px-4">
            {[28, 12, 14, 10, 16, 16, 4].map((width, index) => (
              <Skeleton
                key={index}
                className="h-3.5 rounded-full bg-dove/40"
                style={{ width: `${width}%` }}
              />
            ))}
          </div>
          {Array.from({ length: 6 }).map((_, rowIndex) => (
            <div key={rowIndex} className="flex h-[84px] items-center gap-4 px-4">
              <Skeleton className="h-4 w-[26%] rounded-full bg-fog" />
              <Skeleton className="h-4 w-[10%] rounded-full bg-fog" />
              <Skeleton className="h-4 w-[12%] rounded-full bg-fog" />
              <Skeleton className="h-7 w-[72px] rounded-full bg-fog" />
              <Skeleton className="h-4 w-[14%] rounded-full bg-fog" />
              <Skeleton className="h-4 w-[14%] rounded-full bg-fog" />
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-3 xl:hidden">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="rounded-[16px] bg-fog/70 p-4">
              <Skeleton className="h-4 w-1/2 rounded-full bg-dove/30" />
              <Skeleton className="mt-3 h-3.5 w-2/3 rounded-full bg-dove/20" />
              <Skeleton className="mt-2 h-3.5 w-1/2 rounded-full bg-dove/20" />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  if (!companies) return null;

  if (companies.length === 0) {
    return (
      <Card className="rounded-cards gap-0 border-0 bg-pure-white p-5 shadow-steep">
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-fog text-graphite">
            <Inbox className="size-5" />
          </span>
          <div>
            <p className="text-[16px] leading-[1.38] text-ink">
              {hasActiveFilters ? "没有符合条件的公司" : "暂无公司"}
            </p>
            <p className="mt-1 text-[14px] leading-[1.5] text-graphite">
              {hasActiveFilters
                ? "调整筛选条件，或清空筛选后再试。"
                : "点击右上角「新建公司」开始维护商户公司主数据。"}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4">
            {hasActiveFilters ? (
              <SteepButton variant="text" onClick={onClear}>
                清空筛选
              </SteepButton>
            ) : null}
            <SteepButton variant="text" onClick={onCreate}>
              <Plus />
              新建公司
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
          <caption className="sr-only">公司列表</caption>
          <colgroup>
            <col className="w-[28%]" />
            <col className="w-[12%]" />
            <col className="w-[14%]" />
            <col className="w-[10%]" />
            <col className="w-[16%]" />
            <col className="w-[16%]" />
            <col className="w-[4%]" />
          </colgroup>
          <thead className="bg-fog">
            <tr>
              <th scope="col" className="h-12 px-4 text-left text-[14px] font-[450] text-graphite">
                公司名称
              </th>
              <th scope="col" className="h-12 px-4 text-left text-[14px] font-[450] text-graphite">
                联系人
              </th>
              <th scope="col" className="h-12 px-4 text-left text-[14px] font-[450] text-graphite">
                联系电话
              </th>
              <th scope="col" className="h-12 px-4 text-left text-[14px] font-[450] text-graphite">
                状态
              </th>
              <th scope="col" className="h-12 px-4 text-left text-[14px] font-[450] text-graphite">
                备注
              </th>
              <th scope="col" className="h-12 px-4 text-left text-[14px] font-[450] text-graphite">
                创建时间
              </th>
              <th scope="col" className="h-12 px-2 text-left text-[14px] font-[450] text-graphite">
                <span className="sr-only">操作</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {companies.map((company) => (
              <tr
                key={company.id}
                onClick={(event) => {
                  if (!isRowAction(event.target)) onOpen(company);
                }}
                className="cursor-pointer border-t border-dove/40 transition-colors hover:bg-fog/60"
              >
                <td className="h-[84px] px-4 align-middle">
                  <button
                    type="button"
                    onClick={() => onOpen(company)}
                    className="block max-w-full cursor-pointer truncate text-left text-[15px] font-[450] tracking-[-0.009em] text-ink transition-colors hover:text-rust focus-visible:ring-2 focus-visible:ring-ink/20 focus-visible:outline-none"
                    title={company.company_name}
                  >
                    {company.company_name}
                  </button>
                </td>
                <td className="h-[84px] px-4 align-middle">
                  <span className="block truncate text-[14px] text-ink">
                    {company.contact_name || "—"}
                  </span>
                </td>
                <td className="h-[84px] px-4 align-middle">
                  <span className="block truncate text-[14px] text-ink tabular-nums">
                    {company.contact_phone_masked || "—"}
                  </span>
                </td>
                <td className="h-[84px] px-4 align-middle">
                  <StatusBadge tone={companyTone(company.status)}>
                    {COMPANY_STATUS_LABELS[company.status] ?? company.status}
                  </StatusBadge>
                </td>
                <td className="h-[84px] px-4 align-middle">
                  <span
                    className="block truncate text-[14px] leading-[1.4] text-graphite"
                    title={company.remark ?? undefined}
                  >
                    {company.remark || "—"}
                  </span>
                </td>
                <td className="h-[84px] px-4 align-middle">
                  <span className="block whitespace-nowrap text-[14px] text-graphite tabular-nums">
                    {formatCompanyDateTime(company.created_at)}
                  </span>
                </td>
                <td className="h-[84px] px-2 align-middle">
                  <CompanyRowMenu
                    company={company}
                    onEdit={() => onEdit(company)}
                    onDelete={() => onDelete(company)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col divide-y divide-dove/40 xl:hidden">
        {companies.map((company) => (
          <article
            key={company.id}
            onClick={(event) => {
              if (!isRowAction(event.target)) onOpen(company);
            }}
            className="cursor-pointer py-5 transition-colors first:pt-0 last:pb-0 hover:bg-fog/40"
            data-testid="company-card"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={() => onOpen(company)}
                  className="block max-w-full cursor-pointer truncate text-left text-[15px] font-[450] tracking-[-0.009em] text-ink transition-colors hover:text-rust focus-visible:ring-2 focus-visible:ring-ink/20 focus-visible:outline-none"
                >
                  {company.company_name}
                </button>
                <p className="mt-1 truncate text-[14px] leading-[1.4] text-graphite">
                  {company.contact_name || "未填写联系人"} ·{" "}
                  {company.contact_phone_masked || "未填写电话"}
                </p>
              </div>
              <CompanyRowMenu
                company={company}
                onEdit={() => onEdit(company)}
                onDelete={() => onDelete(company)}
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusBadge tone={companyTone(company.status)}>
                {COMPANY_STATUS_LABELS[company.status] ?? company.status}
              </StatusBadge>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3">
              <div className="col-span-2">
                <dt className="text-[14px] text-graphite">备注</dt>
                <dd className="mt-1 line-clamp-2 text-[14px] text-ink">
                  {company.remark || "—"}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-[14px] text-graphite">创建时间</dt>
                <dd className="mt-1 text-[14px] text-ink tabular-nums">
                  {formatCompanyDateTime(company.created_at)}
                </dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </Card>
  );
}

function CompanyRowMenu({
  company,
  onEdit,
  onDelete,
}: {
  company: CompanyItem;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SteepButton variant="icon" aria-label={`更多操作 ${company.company_name}`}>
          <MoreHorizontal />
        </SteepButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-40 rounded-[16px] border-dove/40 bg-pure-white p-1 shadow-steep"
      >
        <DropdownMenuItem
          onSelect={onEdit}
          className="rounded-xl px-3 py-2.5 text-[14px] font-[450] text-ink focus:bg-fog"
        >
          <Pencil />
          编辑公司
        </DropdownMenuItem>
        <DropdownMenuItem
          aria-label={`删除公司 ${company.company_name}`}
          onSelect={onDelete}
          className="rounded-xl px-3 py-2.5 text-[14px] font-[450] text-rust focus:bg-apricot-wash focus:text-rust"
        >
          <Trash2 />
          删除公司
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
