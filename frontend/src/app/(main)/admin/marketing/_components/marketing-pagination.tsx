"use client";

import { Pagination } from "@/components/common";

interface MarketingPaginationProps {
  total: number;
}

export function MarketingPagination({ total }: MarketingPaginationProps) {
  return (
    <Pagination
      mode="url"
      totalItems={total}
      pageParamName="page"
      sizeParamName="size"
      defaultPageSize={20}
      showPageSizeSelector
      showFirstLastButtons
    />
  );
}
