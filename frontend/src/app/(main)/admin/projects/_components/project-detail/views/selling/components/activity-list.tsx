"use client";

import { safeFormatDate } from "@/lib/formatters";
import { Eye, Loader2, MessageSquare, Tag, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SalesRecord } from "../../../../../types";

interface ActivityListProps {
  type: "viewing" | "offer" | "negotiation";
  data: SalesRecord[];
  onDelete: (id: string) => void;
  canEditSales?: boolean;
  /** 正在删除的记录 id（删除中该行按钮显示 Loader 并禁用） */
  deletingId?: string | null;
}

const TYPE_LABEL: Record<ActivityListProps["type"], string> = {
  viewing: "带看",
  offer: "出价",
  negotiation: "面谈",
};

const TYPE_ICON: Record<ActivityListProps["type"], typeof Eye> = {
  viewing: Eye,
  offer: Tag,
  negotiation: MessageSquare,
};

// 头像三色轮换（设计稿 .avatar peach/skyb/mint）
const AVATAR_BGS = ["bg-apricot-wash", "bg-sky-wash", "bg-[#ddeddd]"] as const;

function getInitial(name?: string | null): string {
  if (!name) return "?";
  return name.charAt(0).toUpperCase();
}

export function ActivityList({
  type,
  data,
  onDelete,
  canEditSales = false,
  deletingId = null,
}: ActivityListProps) {
  // 按时间倒序排列
  const sortedData = [...data].sort(
    (a, b) => new Date(b.record_date).getTime() - new Date(a.record_date).getTime(),
  );

  if (data.length === 0) {
    return (
      <div className="rounded-[16px] border border-dashed border-dove/60 bg-transparent py-10 text-center text-[13.5px] font-[430] text-graphite">
        暂无{TYPE_LABEL[type]}记录
      </div>
    );
  }

  // 最高出价：仅统计有价格的出价记录（全部无价时不误标 0 为最高）
  const offerPrices = data.map((b) => b.price).filter((p): p is number => p != null);
  const maxPrice = type === "offer" && offerPrices.length > 0 ? Math.max(...offerPrices) : null;

  const TypeIcon = TYPE_ICON[type];

  return (
    <div>
      {sortedData.map((item, index) => {
        const isDeleting = deletingId === item.id;
        const isMax = type === "offer" && item.price != null && item.price === maxPrice;
        return (
          <div
            key={item.id}
            className="group flex gap-3.5 border-b border-[#f0f0f2] py-3.5 last:border-b-0"
          >
            {/* 相关人头像：34px 底圆，字=姓名首字，无姓名用类型图标 */}
            <span
              className={cn(
                "mt-0.5 flex size-8.5 shrink-0 items-center justify-center rounded-full text-[12.5px] font-medium text-ink",
                AVATAR_BGS[index % AVATAR_BGS.length],
              )}
            >
              {item.customer_name ? (
                getInitial(item.customer_name)
              ) : (
                <TypeIcon className="size-4" />
              )}
            </span>

            <div className="min-w-0 flex-1">
              {/* 头行：{类型} · {对象姓名} + {时间} · 记录人 {姓名} */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-[14.5px] font-[480] text-ink">
                  {TYPE_LABEL[type]}
                  {item.customer_name ? ` · ${item.customer_name}` : ""}
                </span>
                <span className="text-[12.5px] text-graphite">
                  {safeFormatDate(item.record_date, "MM.dd HH:mm")}
                  {item.operator ? (
                    <>
                      {" · 记录人 "}
                      <span>{item.operator.nickname ?? "未知"}</span>
                    </>
                  ) : null}
                </span>
              </div>

              {/* 正文（无则省略） */}
              {item.notes && (
                <p className="mt-1 text-[14px] font-[430] leading-[1.55] text-ash">{item.notes}</p>
              )}

              {/* 结构化字段：按类型取现有数据（渠道/人数/意向等后端无字段，缺省不造数） */}
              {type === "offer" && item.price != null && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-[12.5px] text-graphite">
                    出价{" "}
                    <b className={cn("text-[13.5px] font-[480]", isMax ? "text-rust" : "text-ink")}>
                      {item.price} 万
                    </b>
                  </span>
                  {isMax && (
                    <span className="inline-flex items-center rounded-full bg-apricot-wash px-2 py-px text-[11px] font-[450] text-rust">
                      最高
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* 删除：hover 显示 + fog 底（设计稿 .icon-btn 28px 8px 圆角），删除中 Loader */}
            {canEditSales && (
              <button
                type="button"
                onClick={() => onDelete(item.id)}
                disabled={isDeleting}
                aria-label="删除"
                className="mt-0.5 grid size-7 shrink-0 place-items-center self-start rounded-lg text-graphite opacity-0 transition-all hover:bg-fog hover:text-ink group-hover:opacity-100 disabled:opacity-100"
              >
                {isDeleting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
