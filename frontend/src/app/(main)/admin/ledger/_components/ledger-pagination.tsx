"use client";

import { Pagination } from "@/components/common/pagination";

interface LedgerPaginationProps {
  total: number;
}

export function LedgerPagination({ total }: LedgerPaginationProps) {
  return (
    <Pagination
      mode="url"
      totalItems={total}
      pageParamName="page"
      sizeParamName="page_size"
      defaultPageSize={10}
      showPageSizeSelector
      showFirstLastButtons
    />
  );
}
