"use client";

import { Pagination } from "@/components/common";

interface PropertyPaginationProps {
  total: number;
}

export function PropertyPagination({ total }: PropertyPaginationProps) {
  return (
    <Pagination
      mode="url"
      totalItems={total}
      pageParamName="page"
      sizeParamName="page_size"
      showPageSizeSelector
      showFirstLastButtons
    />
  );
}
