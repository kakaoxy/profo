"use client";

import { Pagination } from "@/components/common";

interface ProjectPaginationProps {
  total: number;
}

export function ProjectPagination({ total }: ProjectPaginationProps) {
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
