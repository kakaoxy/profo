"use client";

/**
 * 商圈对比池组件（Task 3.2-3.4）。
 *
 * 读取 URL 中的 compare_ids（逗号分隔的商圈名）并渲染为可移除 Tag。
 * - 最多 5 个；达到上限显示警告
 * - 「清空」按钮：清空 compare_ids
 * - 「进入对比模式」按钮：count < 2 时禁用，否则跳转对比页
 * - 空状态：muted 文案「点击商圈表格「+ 对比」添加」
 *
 * URL 状态通过 nuqs useQueryStates 管理（shallow:false 触发服务端重渲染）。
 * 与 business-district-table 共享 compare_ids URL 参数，但本组件仅负责
 * 渲染与移除，添加由表格行内按钮完成。
 */
import { useMemo, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { parseAsString, useQueryStates } from "nuqs";
import { ArrowRight, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/** 对比池最大容量，与 business-district-table 保持一致 */
const MAX_COMPARE = 5;

/** 对比模式要求的最小商圈数量 */
const MIN_COMPARE = 2;

function parseCompareIds(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function ComparisonPool(): ReactElement {
  const router = useRouter();
  const [query, setQuery] = useQueryStates(
    {
      compare_ids: parseAsString.withDefault(""),
    },
    { shallow: false },
  );

  const compareIds = useMemo(
    () => parseCompareIds(query.compare_ids),
    [query.compare_ids],
  );

  const count = compareIds.length;
  const atLimit = count >= MAX_COMPARE;
  const canCompare = count >= MIN_COMPARE;

  const handleRemove = (bc: string): void => {
    const next = compareIds.filter((id) => id !== bc);
    void setQuery({ compare_ids: next.join(",") });
  };

  const handleClear = (): void => {
    void setQuery({ compare_ids: "" });
  };

  const handleCompare = (): void => {
    if (!canCompare) return;
    const ids = compareIds.join(",");
    router.push(
      `/admin/reports/market/compare?ids=${encodeURIComponent(ids)}`,
    );
  };

  if (count === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        点击商圈表格「+ 对比」添加
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-xs text-muted-foreground tabular-nums">
        已选对比: {count} 个
        {atLimit && (
          <span className="ml-1 text-amber-600 dark:text-amber-500">
            （已达上限）
          </span>
        )}
      </span>

      <div className="flex flex-wrap gap-1.5">
        {compareIds.map((bc) => (
          <Badge
            key={bc}
            variant="secondary"
            className="gap-1 pr-1"
            title={bc}
          >
            <span>{bc}</span>
            <button
              type="button"
              onClick={() => handleRemove(bc)}
              className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive hover:text-white"
              aria-label={`移除 ${bc}`}
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          </Badge>
        ))}
      </div>

      <div className="ml-auto flex gap-2">
        <Button variant="ghost" size="sm" onClick={handleClear}>
          <Trash2 className="size-3.5" aria-hidden="true" />
          清空
        </Button>
        <Button size="sm" onClick={handleCompare} disabled={!canCompare}>
          进入对比模式
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
