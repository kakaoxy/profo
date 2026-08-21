"use client";

import React, { useEffect, useState } from "react";
import { Plus, Gavel, Eye, History } from "lucide-react";

import { Lead, FollowUp, LeadStatus, FollowUpMethod, EvalHistory } from "../../types";
import { safeParseDate } from "@/lib/validators";
import { safeFormatDate } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { getEvalHistoriesAction } from "../../actions";

interface LeadTrajectoryTimelineProps {
  lead: Lead;
  followUps: FollowUp[];
}

type TrailEvent = {
  key: string;
  title: string;
  desc: string;
  time: string;
  sortTime: number;
  icon: React.ElementType;
  user?: string;
};

const COMMUNICATION_TITLE_MAP: Record<FollowUpMethod, string> = {
  phone: "沟通：电话访谈",
  wechat: "沟通：微信联络",
  face: "沟通：面谈记录",
  visit: "阶段：带看实勘",
};

export function LeadTrajectoryTimeline({ lead, followUps }: LeadTrajectoryTimelineProps) {
  // 评估历史：挂载时拉取，与 lead.evalHistories（若已传入）合并去重
  const [evalHistories, setEvalHistories] = useState<EvalHistory[]>(lead.evalHistories ?? []);

  useEffect(() => {
    if (!lead.id) return;
    getEvalHistoriesAction(lead.id).then((result) => {
      if (result.success) {
        setEvalHistories(result.data);
      }
    });
  }, [lead.id]);

  const events: TrailEvent[] = [];

  // 1. 录入事件（必有）
  const entryDate = safeParseDate(lead.createdAt);
  events.push({
    key: "entry",
    title: "线索初始录入",
    desc: `由 ${lead.creatorName || "未知"} 首次采集并建档`,
    time: safeFormatDate(lead.createdAt, "yyyy/MM/dd HH:mm:ss"),
    sortTime: entryDate?.getTime() ?? 0,
    icon: Plus,
  });

  // 2. 评估历史事件（多条，按 evaluatedAt 倒序插入）
  // 当 lead.status === REJECTED 时，仍展示评估历史（若有），便于回溯调整轨迹
  evalHistories.forEach((h) => {
    const d = safeParseDate(h.evaluatedAt);
    const isLatest = h.id === evalHistories[0]?.id;
    events.push({
      key: `eval-${h.id}`,
      title: isLatest ? "评估价调整 · 当前" : "评估价调整",
      desc: `评估价 ¥${h.evalPrice} 万${
        h.remark ? ` · ${h.remark}` : ""
      }${h.evaluatorName ? ` · 由 ${h.evaluatorName} 调整` : ""}`,
      time: safeFormatDate(h.evaluatedAt, "yyyy/MM/dd HH:mm:ss"),
      sortTime: d?.getTime() ?? 0,
      icon: Gavel,
    });
  });

  // 3. 驳回事件（条件：已驳回且有 auditReason，且未在评估历史中体现）
  // 评估历史已覆盖正常的评估价调整，这里仅补充"驳回"语义节点
  if (lead.status === LeadStatus.REJECTED && lead.auditReason && evalHistories.length === 0) {
    const raw = lead.auditTime ?? lead.updatedAt;
    const auditDate = safeParseDate(raw);
    const isFallback = !lead.auditTime;
    events.push({
      key: "audit",
      title: "评估驳回",
      desc: `评估意见：${lead.auditReason || "未填写具体原因"}`,
      time: `${isFallback ? "约 " : ""}${safeFormatDate(raw, "yyyy/MM/dd HH:mm:ss")}`,
      sortTime: auditDate?.getTime() ?? 0,
      icon: Gavel,
    });
  }

  // 4. 看房事件 + 5. 沟通事件
  followUps.forEach((f) => {
    const d = safeParseDate(f.followedAt);
    const isVisit = f.method === "visit";
    events.push({
      key: f.id,
      title: isVisit
        ? COMMUNICATION_TITLE_MAP.visit
        : (COMMUNICATION_TITLE_MAP[f.method] ?? "流转更新"),
      desc: f.content,
      // 与 entry/audit 事件保持一致，统一用 safeFormatDate 输出 yyyy/MM/dd HH:mm:ss
      time: safeFormatDate(f.followedAt, "yyyy/MM/dd HH:mm:ss"),
      sortTime: d?.getTime() ?? 0,
      icon: isVisit ? Eye : History,
      user: f.createdBy,
    });
  });

  // 按 sortTime 倒序
  events.sort((a, b) => b.sortTime - a.sortTime);

  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <div className="mb-4 flex items-center gap-2">
        <History className="h-4 w-4 text-primary" />
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
          跟进记录
        </span>
      </div>
      <div className="relative pl-8 space-y-6 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-border">
        {events.map((e, i) => (
          <TimelineItem
            key={e.key}
            title={e.title}
            desc={e.desc}
            time={e.time}
            icon={e.icon}
            isNewest={i === 0}
            user={e.user}
          />
        ))}
      </div>
    </div>
  );
}

interface TimelineItemProps {
  title: string;
  desc: string;
  time: string;
  icon: React.ElementType;
  isNewest?: boolean;
  user?: string;
}

function TimelineItem({ title, desc, time, icon: Icon, isNewest, user }: TimelineItemProps) {
  return (
    <div className="relative group">
      <div
        className={cn(
          "absolute -left-[31px] top-0 h-6 w-6 rounded-full border-4 border-border flex items-center justify-center shadow-sm transition-all",
          isNewest ? "bg-primary scale-110" : "bg-muted",
        )}
      >
        <Icon
          className={cn(
            "h-2.5 w-2.5",
            isNewest ? "text-primary-foreground" : "text-muted-foreground",
          )}
        />
      </div>
      <div className="flex flex-col">
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "text-xs font-black uppercase tracking-tight",
              isNewest ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {title}
          </span>
          <span className="text-[9px] font-bold text-muted-foreground shrink-0">{time}</span>
        </div>
        <div className="mt-1.5 p-3 bg-muted/40 border border-border rounded-xl text-xs text-muted-foreground leading-relaxed italic group-hover:border-primary/20 transition-colors">
          {desc}
          {user && (
            <div className="mt-1 flex justify-end">
              <span className="text-[9px] px-1.5 py-0.5 bg-muted rounded text-muted-foreground font-bold">
                {user}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
