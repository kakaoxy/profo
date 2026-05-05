import { ReactNode } from "react";

export interface ListViewProps {
  searchBar?: ReactNode;
  filterTabs?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  totalCount: number;
  filteredCount?: number;
}

export function ListView({
  searchBar,
  filterTabs,
  actions,
  children,
  totalCount,
  filteredCount,
}: ListViewProps) {
  const displayCount = filteredCount ?? totalCount;

  return (
    <div className="space-y-4">
      {(searchBar || filterTabs || actions) && (
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row w-full lg:w-auto gap-3 items-center">
            {searchBar}
            {filterTabs}
          </div>

          {actions && (
            <div className="flex w-full lg:w-auto gap-3">{actions}</div>
          )}
        </div>
      )}

      {children}

      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <span>
          显示 {displayCount} 条记录 (共 {totalCount} 条)
        </span>
      </div>
    </div>
  );
}
