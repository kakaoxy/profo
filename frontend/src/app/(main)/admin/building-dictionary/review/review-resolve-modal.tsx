"use client";

/**
 * 审核弹层（FR-11 / 设计稿 ARTBOARD 04 renderReviewModal）.
 *
 * 头部：REVIEW · #PE-{id} mono 标识 + 小区 · 提交内容 + 提交人/来源单据/提交时间三格；
 * 三动作卡单选（默认「用已有的」，楼栋/户室卡带「推荐」标）；
 * 目标级联（merge/reject）拆至 review-target-picker：
 *   - 小区条目：全库搜索选目标；楼栋/户室条目：小区固定 → 楼栋 → 楼层 → 户室（预填该层首户）；
 * 机器链路来源（property/null）reject 免选目标（BR-27 分流：落 rejected 转运营待办）；
 * resolve 行锁并发 409 / 权限 403 / 拓扑约束 400 提示（FR-19/BR-28）。
 */

import { useCallback, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { client } from "@/lib/api-client";

import {
  ReviewTargetPicker,
  type TargetSelection,
} from "./review-target-picker";

interface ReviewItem {
  id: number;
  kind?: string | null;
  name?: string | null;
  community_id?: string | null;
  community_name?: string | null;
  parent_kind?: string | null;
  parent_id?: number | null;
  source_type?: string | null;
  submitter_name?: string | null;
  created_at: string;
  reference_count?: number;
}

type ActionKind = "create" | "merge" | "reject";

const SOURCE_LABEL: Record<string, string> = {
  project: "项目",
  lead: "线索",
  marketing: "营销",
  property: "房源（机器链路）",
  admin: "后台",
};

/** 户室号前两位解析楼层（0401→4） */
function floorOfRoomNo(roomNo: string): number | null {
  const m = roomNo.match(/^(\d{2})/);
  return m ? parseInt(m[1], 10) : null;
}

/** 提交内容文案（设计稿「提交内容」列格式：新小区/新楼栋/新户室 · X） */
export function reviewContentLabel(item: Pick<ReviewItem, "kind" | "name">): string {
  if (item.kind === "community") return `新小区 · ${item.name ?? ""}`;
  if (item.kind === "building") return `新楼栋 · ${item.name ?? ""}`;
  if (item.kind === "room") return `新户室 · ${item.name ?? ""}`;
  return item.name ?? "";
}

export function ReviewResolveModal({
  item,
  onClose,
  onResolved,
}: {
  item: ReviewItem;
  onClose: () => void;
  onResolved: () => void;
}) {
  const isCommunityKind = item.kind === "community";
  const isRoomKind = item.kind === "room";
  const isMachine = item.source_type === "property" || !item.source_type;

  // 设计稿口径：默认选中「用已有的」（楼栋/户室卡带推荐标）
  const [action, setAction] = useState<ActionKind>("merge");
  const [submitting, setSubmitting] = useState(false);
  const [target, setTarget] = useState<TargetSelection>({ community: null, building: null, room: null });

  /** merge/reject 需要选目标；机器链路 reject 免选（BR-27 分流） */
  const needTarget = action !== "create" && !(action === "reject" && isMachine);

  const targetSummary = useMemo(() => {
    if (!needTarget) return null;
    if (isCommunityKind) return target.community?.name ?? null;
    if (!target.building) return null;
    if (!isRoomKind) return `${item.community_name ?? ""} ${target.building.building_no} 栋`;
    return target.room
      ? `${item.community_name ?? ""} ${target.building.building_no}号${target.room.plate_no}`
      : null;
  }, [needTarget, isCommunityKind, isRoomKind, target, item.community_name]);

  const canSubmit = action === "create" || (action === "reject" && isMachine) || !!targetSummary;

  const submit = useCallback(async () => {
    if (!canSubmit) {
      toast.error(isCommunityKind ? "合并/驳回必须选择目标小区" : "合并/驳回必须选择目标楼栋/楼层/户室");
      return;
    }
    const targetId =
      action === "create" || (action === "reject" && isMachine)
        ? null
        : isCommunityKind
          ? (target.community?.id ?? null)
          : isRoomKind
            ? String(target.room?.id ?? "")
            : String(target.building?.id ?? "");
    setSubmitting(true);
    try {
      const { error, response } = await client.POST("/api/v1/admin/building-dictionary/review/{entry_id}/resolve", {
        params: { path: { entry_id: item.id } },
        body: { action, target_id: targetId },
      });
      if (error) {
        const status = (response as Response | undefined)?.status;
        if (status === 409) {
          toast.error("该条目已被其他处理人审核（并发冲突）");
        } else if (status === 403) {
          toast.error("无审核处理权限（building_dict_reviewer_roles 配置）");
        } else if (status === 400) {
          toast.error("参数不合法或父级未转正（拓扑约束），请调整目标");
        } else {
          toast.error("审核操作失败，请检查目标选择");
        }
        return;
      }
      const outcome =
        action === "create"
          ? "已新增入库"
          : action === "merge"
            ? `已合并至「${targetSummary ?? ""}」`
            : isMachine
              ? "已驳回 · 转运营待办"
              : `已驳回，来源单据改选「${targetSummary ?? ""}」`;
      toast.success(`审核完成：${item.community_name ?? ""} ${reviewContentLabel(item)} → ${outcome} · 提交人已通知`);
      onResolved();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }, [action, canSubmit, isCommunityKind, isMachine, isRoomKind, target, targetSummary, item, onResolved, onClose]);

  /** 三动作卡（设计稿文案 + 顺序：小区 create 在前 / 楼栋户室 merge 在前带推荐） */
  const cards: { k: ActionKind; t: string; d: string; tag?: string }[] = isCommunityKind
    ? [
        { k: "create", t: "确认新增", d: "是新小区：通过后正式入库，来源单据自动改绑（「未审核」标签摘除）。" },
        { k: "merge", t: "用已有的", d: "其实是已有小区：来源单据改绑到它，不新增小区。" },
        {
          k: "reject",
          t: "驳回",
          d: isMachine
            ? "内容有误：不通过，落「已驳回」转运营待办（机器链路无法当场改选）。"
            : "内容有误：不通过，当场给来源单据选一个正确小区。",
        },
      ]
    : [
        { k: "merge", t: "用已有的", d: "已有这栋/这户：来源单据改绑过去，不加新数据。", tag: "推荐" },
        { k: "create", t: "确认新增", d: "确属新增：通过后入库，来源单据自动绑上；标记「人工补录」。" },
        {
          k: "reject",
          t: "驳回",
          d: isMachine
            ? "内容有误：不通过，落「已驳回」转运营待办（机器链路无法当场改选）。"
            : "内容有误：不通过，当场给来源单据选对楼栋和户室再提交。",
        },
      ];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            <span className="mr-2 font-mono text-[10px] tracking-widest text-dove">REVIEW · #PE-{item.id}</span>
            <span className="font-display">
              {item.community_name ?? item.name} · {reviewContentLabel(item)}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* 提交人 / 来源单据 / 提交时间 三格（设计稿 info-grid） */}
        <div className="grid grid-cols-3 gap-2">
          <InfoCell label="提交人" value={item.submitter_name ?? "—"} />
          <InfoCell
            label="来源单据"
            value={item.source_type ? SOURCE_LABEL[item.source_type] ?? item.source_type : "房源（机器链路）"}
          />
          <InfoCell label="提交时间" value={new Date(item.created_at).toLocaleString("zh-CN")} />
        </div>

        {/* 三动作卡 */}
        <div className="flex flex-col gap-2">
          {cards.map((cd) => (
            <button
              key={cd.k}
              type="button"
              className={
                "rounded-2xl border-[1.5px] px-4 py-3 text-left transition-colors " +
                (action === cd.k ? "border-rust bg-[#fffaf6]" : "border-dove/40 hover:border-dove")
              }
              onClick={() => setAction(cd.k)}
            >
              <span className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                <span
                  className={
                    "relative inline-flex size-4 shrink-0 rounded-full border-[1.5px] " +
                    (action === cd.k ? "border-rust" : "border-dove")
                  }
                >
                  {action === cd.k ? <span className="absolute inset-[3px] rounded-full bg-rust" /> : null}
                </span>
                {cd.t}
                {cd.tag ? (
                  <span className="ml-auto rounded-full bg-apricot-wash px-2 py-0.5 text-[9.5px] text-rust">{cd.tag}</span>
                ) : null}
              </span>
              <span className="mt-1 block pl-6 text-[11.5px] leading-relaxed text-ash">{cd.d}</span>
            </button>
          ))}
        </div>

        {/* 目标级联选择（merge/reject；机器链路 reject 免选） */}
        {needTarget ? (
          <ReviewTargetPicker
            kind={item.kind === "community" ? "community" : item.kind === "room" ? "room" : "building"}
            communityId={item.community_id ?? null}
            communityName={item.community_name ?? null}
            prefillBuildingId={item.kind === "room" && item.parent_kind === "building" ? item.parent_id : null}
            prefillFloor={item.kind === "room" ? floorOfRoomNo(item.name ?? "") : null}
            actionLabel={action === "merge" ? "merge" : "reject"}
            selection={target}
            onSelectionChange={setTarget}
          />
        ) : null}
        {action === "reject" && isMachine ? (
          <p className="rounded-lg bg-fog px-3 py-1.5 text-[11.5px] leading-relaxed text-graphite">
            机器链路/C 端来源驳回无需改选：条目落「已驳回」，原文保留并转运营待办，经人工补绑转正（BR-27）。
          </p>
        ) : null}
        {targetSummary ? (
          <p className="rounded-lg bg-fog px-3 py-1.5 text-[12px] text-graphite">
            将{action === "merge" ? "合并到" : "改指"}：<b className="text-rust">{targetSummary}</b>
          </p>
        ) : null}

        <div className="flex justify-end gap-2 border-t border-dove/40 pt-3">
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button className="bg-ink text-white" disabled={!canSubmit || submitting} onClick={() => void submit()}>
            {submitting ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
            提交结果
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-fog px-3 py-2">
      <p className="text-[10.5px] text-graphite">{label}</p>
      <p className="mt-0.5 truncate text-[12.5px] font-medium text-ink">{value}</p>
    </div>
  );
}
