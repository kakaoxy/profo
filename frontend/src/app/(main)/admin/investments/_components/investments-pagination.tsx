"use client";

import { Pagination } from "@/components/common";

interface InvestmentsPaginationProps {
  total: number;
}

export function InvestmentsPagination({ total }: InvestmentsPaginationProps) {
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
