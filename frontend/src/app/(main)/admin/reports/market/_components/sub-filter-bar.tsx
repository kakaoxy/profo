"use client";

/**
 * 商圈分析报表次级筛选栏（Task 3.1）。
 *
 * 水平 flex 布局，移动端自动换行。三组筛选：
 * - 状态 (status)：RadioGroup 在售/成交，默认成交
 * - 户型 (rooms)：Badge 多选 1室/2室/3室/4室+
 * - 楼层 (floor_levels)：Badge 多选 低楼层/中楼层/高楼层
 *
 * URL 状态通过 nuqs useQueryStates 管理（shallow:false 触发服务端重渲染）：
 * - status: string，默认 "成交"
 * - rooms: string，如 "1,3,4plus"（4plus 为 4室及以上哨兵）
 * - floor_levels: string，如 "低楼层,高楼层"
 *
 * 选中 Badge 使用 primary 背景，未选中使用 muted 背景。
 */
import { type ReactElement } from "react";
import { parseAsString, useQueryStates } from "nuqs";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import type { PropertyStatus } from "../../_lib/types";
import {
  buildFloorLevelsUrl,
  buildRoomsUrl,
  parseFloorLevelsUrl,
  parseRoomsUrl,
} from "./url-helpers";

interface RoomOption {
  value: number | "4plus";
  label: string;
}

const STATUS_OPTIONS: readonly { value: PropertyStatus; label: string }[] = [
  { value: "成交", label: "成交" },
  { value: "在售", label: "在售" },
];

const ROOM_OPTIONS: readonly RoomOption[] = [
  { value: 1, label: "1室" },
  { value: 2, label: "2室" },
  { value: 3, label: "3室" },
  { value: "4plus", label: "4室+" },
];

const FLOOR_OPTIONS = ["低楼层", "中楼层", "高楼层"] as const;

export function SubFilterBar(): ReactElement {
  const [query, setQuery] = useQueryStates(
    {
      status: parseAsString.withDefault("成交"),
      rooms: parseAsString.withDefault(""),
      floor_levels: parseAsString.withDefault(""),
    },
    { shallow: false },
  );

  const roomsState = parseRoomsUrl(query.rooms);
  const floorLevels = parseFloorLevelsUrl(query.floor_levels);

  const handleStatusChange = (val: string): void => {
    void setQuery({ status: val });
  };

  const handleToggleRoom = (value: number | "4plus"): void => {
    let nextState;
    if (value === "4plus") {
      nextState = {
        rooms: roomsState.rooms,
        include4plus: !roomsState.include4plus,
      };
    } else {
      const has = roomsState.rooms.includes(value);
      const nextRooms = has
        ? roomsState.rooms.filter((r) => r !== value)
        : [...roomsState.rooms, value];
      nextState = {
        rooms: nextRooms,
        include4plus: roomsState.include4plus,
      };
    }
    void setQuery({ rooms: buildRoomsUrl(nextState) });
  };

  const handleToggleFloor = (level: string): void => {
    const has = floorLevels.includes(level);
    const next = has
      ? floorLevels.filter((l) => l !== level)
      : [...floorLevels, level];
    void setQuery({ floor_levels: buildFloorLevelsUrl(next) });
  };

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      {/* 状态 */}
      <div className="flex items-center gap-2">
        <Label className="text-xs font-medium text-muted-foreground whitespace-nowrap">
          状态
        </Label>
        <ToggleGroup
          type="single"
          value={query.status}
          onValueChange={(v) => {
            if (v) handleStatusChange(v);
          }}
          variant="outline"
          size="sm"
          className="flex items-center gap-1.5"
        >
          {STATUS_OPTIONS.map((opt) => (
            <ToggleGroupItem key={opt.value} value={opt.value}>
              {opt.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {/* 户型 */}
      <div className="flex items-center gap-2">
        <Label className="text-xs font-medium text-muted-foreground whitespace-nowrap">
          户型
        </Label>
        <div className="flex gap-1.5">
          {ROOM_OPTIONS.map((opt) => {
            const isActive =
              opt.value === "4plus"
                ? roomsState.include4plus
                : roomsState.rooms.includes(opt.value);
            return (
              <Badge
                key={opt.value}
                variant={isActive ? "default" : "secondary"}
                className={cn(
                  "cursor-pointer select-none transition-colors",
                  !isActive &&
                    "bg-muted text-muted-foreground hover:bg-muted/80 border-transparent",
                )}
                onClick={() => handleToggleRoom(opt.value)}
              >
                {opt.label}
              </Badge>
            );
          })}
        </div>
      </div>

      {/* 楼层 */}
      <div className="flex items-center gap-2">
        <Label className="text-xs font-medium text-muted-foreground whitespace-nowrap">
          楼层
        </Label>
        <div className="flex gap-1.5">
          {FLOOR_OPTIONS.map((level) => {
            const isActive = floorLevels.includes(level);
            return (
              <Badge
                key={level}
                variant={isActive ? "default" : "secondary"}
                className={cn(
                  "cursor-pointer select-none transition-colors",
                  !isActive &&
                    "bg-muted text-muted-foreground hover:bg-muted/80 border-transparent",
                )}
                onClick={() => handleToggleFloor(level)}
              >
                {level}
              </Badge>
            );
          })}
        </div>
      </div>
    </div>
  );
}
