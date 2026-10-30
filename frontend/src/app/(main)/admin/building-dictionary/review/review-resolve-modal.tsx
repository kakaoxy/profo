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
 *
 * BR-29 修订（2026-10-20）：
 * - **可修正名称**：「确认新增」时提交内容可编辑，楼栋号尾部单个「号」自动剥离并实时对照；
 * - **默认动作数据驱动**：目标选择器上报可选目标数，无任何目标（含待审兄弟）时
 *   默认动作降级为「确认新增」并摘掉「推荐」标，避免「推荐一个不能提交的选项」。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Info, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { client } from "@/lib/api-client";
import { formatBuildingLabel, previewNormalizedBuildingNo } from "@/lib/dict-display";

import {
  ReviewTargetPicker,
  type MergeAvailability,
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
  /** 「用已有的」可用的目标数（由目标选择器上报；null=尚未加载完） */
  const [mergeAvailability, setMergeAvailability] = useState<MergeAvailability>("unknown");
  /** 用户手动点过动作卡后不再被默认逻辑纠正 */
  const userTouchedAction = useRef(false);
  /** BR-29：可修正的提交内容名称 */
  const [nameDraft, setNameDraft] = useState(item.name ?? "");

  /** merge/reject 需要选目标；机器链路 reject 免选（BR-27 分流） */
  const needTarget = action !== "create" && !(action === "reject" && isMachine);

  /**
   * BR-29：默认动作按数据可用性派发。
   *
   * 旧实现硬编码 merge 为默认且「推荐」标无条件渲染，而楼栋/户室条目的目标选择器
   * 只列字典实表 —— 新小区/新楼栋下一条实表都没有时（实测 2066/21732 个小区无楼栋），
   * 审核员看到的是「推荐一个无法提交的选项」+ 提交按钮永久置灰。
   * 现在：目标为空 → 默认 create + 推荐标移到 create；用户手动改过后不再覆盖。
   */
  useEffect(() => {
    if (userTouchedAction.current) return;
    setAction(mergeAvailability === "empty" ? "create" : "merge");
  }, [mergeAvailability]);

  const pickAction = useCallback((next: ActionKind) => {
    userTouchedAction.current = true;
    setAction(next);
  }, []);

  const targetSummary = useMemo(() => {
    if (!needTarget) return null;
    if (isCommunityKind) return target.community?.name ?? null;
    if (!target.building) return null;
    if (!isRoomKind) return `${item.community_name ?? ""} ${formatBuildingLabel(target.building.building_no)}`;
    return target.room
      ? `${item.community_name ?? ""} ${formatBuildingLabel(target.building.building_no)}${target.room.plate_no}`
      : null;
  }, [needTarget, isCommunityKind, isRoomKind, target, item.community_name]);

  /** BR-29：名称将落库的实际值（楼栋号自动剥离尾部单个「号」） */
  const normalizedNameDraft = useMemo(
    () => (item.kind === "building" ? previewNormalizedBuildingNo(nameDraft) : nameDraft.trim()),
    [item.kind, nameDraft],
  );
  const nameChanged = normalizedNameDraft !== (item.name ?? "").trim();

  const canSubmit =
    action === "create"
      ? normalizedNameDraft.length > 0
      : action === "reject" && isMachine
        ? true
        : !!targetSummary;

  const submit = useCallback(async () => {
    if (!canSubmit) {
      toast.error(
        action === "create"
          ? "提交内容名称不能为空"
          : isCommunityKind
            ? "合并/驳回必须选择目标小区"
            : "合并/驳回必须选择目标楼栋/楼层/户室",
      );
      return;
    }
    // BR-29：合并到审核池待审兄弟条目（building/room 才可能，community 恒为实表）
    const isPendingTarget = action === "merge" && !isCommunityKind && target.building?.pending === true;
    const targetId =
      action === "create" || (action === "reject" && isMachine)
        ? null
        : isCommunityKind
          ? (target.community?.id ?? null)
          : isRoomKind
            ? String(target.room?.id ?? target.room?.pending_id ?? "")
            : String(target.building?.id ?? target.building?.pending_id ?? "");
    setSubmitting(true);
    try {
      const { data, error, response } = await client.POST(
        "/api/v1/admin/building-dictionary/review/{entry_id}/resolve",
        {
          params: { path: { entry_id: item.id } },
          body: {
            action,
            target_id: targetId,
            // BR-29：仅「确认新增」提交修正名称（merge/reject 传了后端也忽略）
            name: action === "create" ? normalizedNameDraft : null,
            // BR-29：合并到待审兄弟条目时后端顺手转正目标
            target_kind: isPendingTarget ? "pending" : "dict",
          },
        },
      );
      if (error) {
        // BR-29：400/404 的具体原因必须透出（旧实现笼统提示「拓扑约束」，审核员
        // 无法区分「父级未转正」与「父楼栋已删除」）
        const message = (error as { message?: string }).message;
        const status = (response as Response | undefined)?.status;
        if (status === 409) {
          toast.error(message ?? "该条目已被其他处理人审核（并发冲突）");
        } else if (status === 403) {
          toast.error("无审核处理权限（building_dict_reviewer_roles 配置）");
        } else if (status === 400 || status === 404) {
          toast.error(message ?? "参数不合法或父级未转正（拓扑约束），请调整目标");
        } else {
          toast.error(message ?? "审核操作失败，请检查目标选择");
        }
        return;
      }
      const renameNote =
        action === "create" && nameChanged
          ? `（名称已修正：${item.name ?? ""} → ${data?.resolved_name ?? normalizedNameDraft}）`
          : "";
      const outcome =
        action === "create"
          ? `已新增入库${renameNote}`
          : action === "merge"
            ? `已合并至「${targetSummary ?? ""}」${isPendingTarget ? "（该待审条目已顺手转正）" : ""}`
            : isMachine
              ? "已驳回 · 转运营待办"
              : `已驳回，来源单据改选「${targetSummary ?? ""}」`;
      toast.success(`审核完成：${item.community_name ?? ""} ${reviewContentLabel(item)} → ${outcome} · 提交人已通知`);
      onResolved();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }, [
    action,
    canSubmit,
    isCommunityKind,
    isMachine,
    isRoomKind,
    target,
    targetSummary,
    item,
    normalizedNameDraft,
    nameChanged,
    onResolved,
    onClose,
  ]);

  /**
   * 三动作卡（设计稿文案 + 顺序：小区 create 在前 / 楼栋户室 merge 在前带推荐）.
   *
   * BR-29：「推荐」标与 disabled 改为数据驱动 —— 无可合并目标（含待审兄弟）时
   * merge 卡禁用且推荐标移到 create 卡，不再「推荐一个提交不了的选项」。
   */
  const mergeEmpty = !isCommunityKind && mergeAvailability === "empty";
  const cards: { k: ActionKind; t: string; d: string; tag?: string; disabled?: boolean }[] = isCommunityKind
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
        {
          k: "merge",
          t: "用已有的",
          d: mergeEmpty
            ? isRoomKind
              ? "该楼栋下暂无任何户室（含待审），无可用目标。"
              : "本小区暂无任何楼栋（含待审），无可用目标。"
            : "已有这栋/这户：来源单据改绑过去，不加新数据。",
          tag: mergeEmpty ? undefined : "推荐",
          disabled: mergeEmpty,
        },
        {
          k: "create",
          t: "确认新增",
          d: "确属新增：通过后入库，来源单据自动绑上；标记「人工补录」。可在此修正名称。",
          tag: mergeEmpty ? "推荐" : undefined,
        },
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

        {/*
          BR-29：可修正的提交内容名称（仅「确认新增」可编辑）。
          merge/reject 时置灰只读 —— 名称只影响「写入字典」的结果，改指/驳回不改名字。
        */}
        <div className="rounded-2xl border border-dove/40 px-3.5 py-2.5">
          <div className="flex items-center justify-between">
            {/* 文案刻意不重复动作卡名称（如「确认新增」），避免测试/读屏按文本匹配歧义 */}
            <p className="text-[11px] text-graphite">
              提交内容{action === "create" ? "（可修正）" : "（选中「通过新增」后可改）"}
            </p>
            {nameChanged ? (
              <span className="rounded-full bg-apricot-wash px-2 py-0.5 text-[9.5px] text-rust">已修正</span>
            ) : null}
          </div>
          <Input
            value={nameDraft}
            disabled={action !== "create"}
            onChange={(e) => setNameDraft(e.target.value)}
            className="mt-1 h-8 rounded-[9px] font-mono text-[12.5px] disabled:opacity-60"
            placeholder={item.kind === "building" ? "楼栋号，如 21" : item.kind === "room" ? "户室号，如 0401" : "小区名"}
          />
          {action === "create" && nameChanged ? (
            <p className="mt-1.5 flex items-start gap-1 text-[10.5px] leading-relaxed text-graphite">
              <Info className="mt-px size-3 shrink-0 text-rust" />
              <span>
                将保存为 <b className="font-mono text-rust">{normalizedNameDraft}</b>
                {item.kind === "building" ? "（尾部单个「号」自动去除，展示仍为「" + formatBuildingLabel(normalizedNameDraft) + "」）" : ""}
                {item.kind === "community" ? `，旧名「${item.name ?? ""}」将自动沉淀为别名（仍可搜索）` : ""}
              </span>
            </p>
          ) : null}
        </div>

        {/* 三动作卡 */}
        <div className="flex flex-col gap-2">
          {cards.map((cd) => (
            <button
              key={cd.k}
              type="button"
              disabled={cd.disabled}
              title={cd.disabled ? "当前没有可合并的目标（含待审）" : undefined}
              className={
                "rounded-2xl border-[1.5px] px-4 py-3 text-left transition-colors " +
                (cd.disabled
                  ? "cursor-not-allowed border-dove/30 opacity-50"
                  : action === cd.k
                    ? "border-rust bg-[#fffaf6]"
                    : "border-dove/40 hover:border-dove")
              }
              onClick={() => {
                if (cd.disabled) {
                  toast.error("当前条目没有可合并的目标（含待审兄弟），请改用「确认新增」或「驳回」");
                  return;
                }
                pickAction(cd.k);
              }}
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
            communityName={
              item.kind === "community" ? (item.name ?? null) : (item.community_name ?? null)
            }
            prefillBuildingId={item.kind === "room" && item.parent_kind === "building" ? item.parent_id : null}
            prefillFloor={item.kind === "room" ? floorOfRoomNo(item.name ?? "") : null}
            actionLabel={action === "merge" ? "merge" : "reject"}
            selection={target}
            onSelectionChange={setTarget}
            onAvailabilityChange={setMergeAvailability}
            // reject 不做归属选择（驳回不落目标），仅 merge 需要待审兄弟转正语义
            allowPendingTargets={action === "merge"}
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
