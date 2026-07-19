import React from "react";
import { Plus, Gavel, Eye, History } from "lucide-react";

import { Lead, FollowUp, LeadStatus, FollowUpMethod } from "../../types";
import { safeParseDate } from "@/lib/validators";
import { safeFormatDate } from "@/lib/formatters";
import { cn } from "@/lib/utils";

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

export function LeadTrajectoryTimeline({
  lead,
  followUps,
}: LeadTrajectoryTimelineProps) {
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

  // 2. 评估事件（条件：存在任意评估信息）
  const hasAssessment =
    lead.evalPrice != null || !!lead.auditReason || !!lead.auditTime;
  if (hasAssessment) {
    const raw = lead.auditTime ?? lead.updatedAt;
    const auditDate = safeParseDate(raw);
    const isFallback = !lead.auditTime;
    const isRejected = lead.status === LeadStatus.REJECTED;
    const approvalDesc =
      lead.evalPrice != null
        ? `拟收房评估价 ¥${lead.evalPrice} 万${
            lead.auditReason ? " · " + lead.auditReason : ""
          }`
        : lead.auditReason
          ? `评估意见：${lead.auditReason}`
          : "评估通过，未填写评估价";
    events.push({
      key: "audit",
      title: isRejected ? "评估驳回" : "收房评估通过",
      desc: isRejected
        ? `评估意见：${lead.auditReason || "未填写具体原因"}`
        : approvalDesc,
      time: `${isFallback ? "约 " : ""}${safeFormatDate(raw, "yyyy/MM/dd HH:mm:ss")}`,
      sortTime: auditDate?.getTime() ?? 0,
      icon: Gavel,
    });
  }

  // 3. 看房事件 + 4. 沟通事件
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
          流转轨迹
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

function TimelineItem({
  title,
  desc,
  time,
  icon: Icon,
  isNewest,
  user,
}: TimelineItemProps) {
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
          <span className="text-[9px] font-bold text-muted-foreground shrink-0">
            {time}
          </span>
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
