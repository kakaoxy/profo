"use client";

import { Pagination } from "@/components/common";

interface LeadsPaginationProps {
  total: number;
}

export function LeadsPagination({ total }: LeadsPaginationProps) {
  return (
    <Pagination
      mode="url"
      totalItems={total}
      pageParamName="page"
      sizeParamName="page_size"
      defaultPageSize={20}
      showPageSizeSelector
      showFirstLastButtons
    />
  );
}
