"use client";

import { memo, useState, useRef, useEffect } from "react";
import { useQueryState } from "nuqs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";

// 辅助函数：多选切换（与 PropertyFiltersCore 中的 toggleSelection 逻辑一致）
function toggleSelection(
  currentValue: string | null,
  valueToToggle: string,
  setter: (val: string | null) => void,
) {
  const current = currentValue ? currentValue.split(",") : [];
  if (current.includes(valueToToggle)) {
    const newValue = current.filter((r) => r !== valueToToggle).join(",");
    setter(newValue || null);
  } else {
    setter([...current, valueToToggle].join(","));
  }
}

// 状态 Chip 组（单选）
const StatusChips = memo(function StatusChips() {
  const [status, setStatus] = useQueryState("status", { defaultValue: "", shallow: false });
  const options = [
    { value: "", label: "全部" },
    { value: "在售", label: "在售" },
    { value: "成交", label: "成交" },
    { value: "过期", label: "过期" },
  ];
  return (
    <div className="flex gap-1.5 shrink-0">
      {options.map((opt) => (
        <Badge
          key={opt.value}
          variant={status === opt.value ? "default" : "outline"}
          className="cursor-pointer h-7 px-2.5 text-xs"
          onClick={() => setStatus(opt.value || null)}
        >
          {opt.label}
        </Badge>
      ))}
    </div>
  );
});

// 户型 Chip 组（多选，5+ 走 rooms_gte）
const LayoutChips = memo(function LayoutChips() {
  const [rooms, setRooms] = useQueryState("rooms", { defaultValue: "", shallow: false });
  const [roomsGte, setRoomsGte] = useQueryState("rooms_gte", { shallow: false });
  const options = ["1", "2", "3", "4", "5+"];
  return (
    <div className="flex gap-1.5 shrink-0">
      {options.map((r) => {
        const isPlus = r === "5+";
        const isActive = isPlus ? roomsGte === "5" : rooms.split(",").includes(r);
        const handleClick = isPlus
          ? () => setRoomsGte(roomsGte === "5" ? null : "5")
          : () => toggleSelection(rooms, r, setRooms);
        return (
          <Badge
            key={r}
            variant={isActive ? "default" : "outline"}
            className="cursor-pointer h-7 w-7 p-0 flex items-center justify-center text-xs"
            onClick={handleClick}
          >
            {r}
          </Badge>
        );
      })}
    </div>
  );
});

// 楼层 Chip 组（多选）
const FloorChips = memo(function FloorChips() {
  const [floors, setFloors] = useQueryState("floor_levels", { defaultValue: "", shallow: false });
  const options = ["低楼层", "中楼层", "高楼层"];
  return (
    <div className="flex gap-1.5 shrink-0">
      {options.map((f) => (
        <Badge
          key={f}
          variant={floors.split(",").includes(f) ? "default" : "outline"}
          className="cursor-pointer h-7 px-2.5 text-xs"
          onClick={() => toggleSelection(floors, f, setFloors)}
        >
          {f.replace("楼层", "")}
        </Badge>
      ))}
    </div>
  );
});

// 小区搜索 Chip（点击展开 Input）
const CommunitySearchChip = memo(function CommunitySearchChip() {
  const [q, setQ] = useQueryState("q", { defaultValue: "", throttleMs: 500, shallow: false });
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (expanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [expanded]);

  // 监听外部点击以收起 Input；比 onBlur + setTimeout 更直接，
  // 避免因 input 提前 unmount 导致后续 click 事件丢失
  useEffect(() => {
    if (!expanded) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [expanded]);

  // 有值且未展开：显示带清除按钮的 Chip
  if (q && !expanded) {
    return (
      <Badge
        variant="default"
        // 覆盖 Badge 默认的 [&>svg]:pointer-events-none，让 X 可点击
        className="cursor-pointer h-7 px-2.5 text-xs gap-1 shrink-0 [&>svg]:pointer-events-auto"
        onClick={() => setExpanded(true)}
      >
        <Search className="h-3 w-3" />
        <span className="max-w-[80px] truncate">{q}</span>
        <X
          className="h-3 w-3 hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            setQ(null);
          }}
        />
      </Badge>
    );
  }

  // 展开：显示 Input
  if (expanded) {
    return (
      <div ref={containerRef} className="relative shrink-0">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          placeholder="搜索小区..."
          className="h-7 pl-7 pr-2 w-40 text-xs"
          maxLength={50}
          value={q || ""}
          onChange={(e) => setQ(e.target.value || null)}
        />
      </div>
    );
  }

  // 默认：显示搜索入口 Chip
  return (
    <Badge
      variant="outline"
      className="cursor-pointer h-7 px-2.5 text-xs gap-1 shrink-0"
      onClick={() => setExpanded(true)}
    >
      <Search className="h-3 w-3" />
      <span>小区</span>
    </Badge>
  );
});

export function PropertyFilterChips() {
  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-hide px-4 py-2 md:hidden items-center">
      <StatusChips />
      <LayoutChips />
      <FloorChips />
      <CommunitySearchChip />
    </div>
  );
}
