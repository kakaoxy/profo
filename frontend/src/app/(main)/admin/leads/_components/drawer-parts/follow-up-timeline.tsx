"use client";

import React, { useState } from "react";
import { Lead, FollowUpMethod, FollowUp, LeadStatus } from "../../types";
import { Button } from "@/components/ui/button";
import { History, Eye, Plus, Gavel, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { safeParseDate } from "@/lib/validators";
import { getLeadFollowUpsAction } from "../../actions";

interface FollowUpTimelineProps {
  lead: Lead;
  followUps: FollowUp[];
  onAddFollowUp: (leadId: string, method: FollowUpMethod, content: string) => void;
  onRefreshFollowUps: (updated: FollowUp[]) => void;
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

export const FollowUpTimeline: React.FC<FollowUpTimelineProps> = ({
  lead,
  followUps,
  onAddFollowUp,
  onRefreshFollowUps,
}) => {
  const [open, setOpen] = useState(true);
  const [followUpMethod, setFollowUpMethod] = useState<FollowUpMethod>("phone");
  const [followUpContent, setFollowUpContent] = useState("");

  const handleAddFollowUpSubmit = async () => {
    if (!lead || !followUpContent) return;
    await onAddFollowUp(lead.id, followUpMethod, followUpContent);
    const result = await getLeadFollowUpsAction(lead.id);
    if (result.success) onRefreshFollowUps(result.data);
    setFollowUpContent("");
  };

  // 合并「收房评估 + 跟进记录」按时间倒序，"线索初始录入"恒为最末（创建最早）
  // 评估事件触发条件：存在任意评估信息（评估价/评估意见/审核时间）
  // auditTime 是评估发生的最可靠信号（后端在评估流转时写入）；存量无 audit_time 时回退到 evalPrice/auditReason
  const hasAssessment = lead.evalPrice != null || !!lead.auditReason || !!lead.auditTime;
  const trailEvents: TrailEvent[] = [];
  if (hasAssessment) {
    const raw = lead.auditTime ?? lead.updatedAt;
    const d = safeParseDate(raw);
    const isFallback = !lead.auditTime;
    const isRejected = lead.status === LeadStatus.REJECTED;
    const approvalDesc =
      lead.evalPrice != null
        ? `拟收房评估价 ¥${lead.evalPrice} 万${lead.auditReason ? " · " + lead.auditReason : ""}`
        : lead.auditReason
          ? `评估意见：${lead.auditReason}`
          : "评估通过，未填写评估价";
    trailEvents.push({
      key: "audit",
      title: isRejected ? "评估不符 · 已放弃" : "收房评估通过",
      desc: isRejected ? `评估意见：${lead.auditReason || "未填写具体原因"}` : approvalDesc,
      time: d ? `${isFallback ? "约 " : ""}${d.toLocaleString()}` : "-",
      sortTime: d?.getTime() ?? 0,
      icon: Gavel,
    });
  }
  followUps.forEach((f) => {
    const d = safeParseDate(f.followedAt);
    trailEvents.push({
      key: f.id,
      title:
        f.method === "visit"
          ? "阶段：带看实勘"
          : f.method === "phone"
            ? "沟通：电话访谈"
            : "流转更新",
      desc: f.content,
      time: f.followUpTime,
      sortTime: d?.getTime() ?? 0,
      icon: f.method === "visit" ? Eye : History,
      user: f.createdBy,
    });
  });
  trailEvents.sort((a, b) => b.sortTime - a.sortTime);

  return (
    <section className="bg-pure-white rounded-2xl border border-dove shadow-sm overflow-hidden">
      {/* 可折叠头部 */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-fog border-b border-dove text-left"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <History className="h-3 w-3 text-graphite shrink-0" />
          <span className="text-[10px] font-black uppercase tracking-widest text-graphite">
            跟进记录
          </span>
          <span className="text-muted-foreground/40">·</span>
          <span className="text-[10px] text-ash truncate">{trailEvents.length} 条事件</span>
        </div>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-graphite transition-transform shrink-0 ml-2",
            open && "rotate-180",
          )}
        />
      </button>

      {/* 主体 */}
      {open && (
        <div className="p-4 space-y-5">
          {/* 登记最新动态 快速录入区 */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5">
              <History className="h-3 w-3 text-rust" />
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                登记最新动态
              </span>
            </div>
            <div className="flex gap-2">
              <select
                className="h-11 px-3 rounded-inputs border border-dove bg-fog text-xs font-bold outline-none focus:border-ink/40 shrink-0"
                value={followUpMethod}
                onChange={(e) => setFollowUpMethod(e.target.value as FollowUpMethod)}
              >
                <option value="phone">电话沟通</option>
                <option value="wechat">微信联络</option>
                <option value="face">面谈记录</option>
                <option value="visit">带看实勘</option>
              </select>
              <input
                placeholder="输入跟进摘要..."
                className="flex-1 min-w-0 h-11 px-4 border border-dove rounded-inputs text-xs placeholder:text-graphite outline-none focus:ring-2 focus:ring-ink/20 focus:border-ink/40 bg-fog"
                value={followUpContent}
                onChange={(e) => setFollowUpContent(e.target.value)}
              />
              <Button
                className="rounded-full h-11 px-6 bg-ink text-white hover:bg-ink/90 font-bold shrink-0"
                onClick={handleAddFollowUpSubmit}
              >
                记录
              </Button>
            </div>
          </div>

          {/* 时间线 */}
          <div className="relative pl-8 space-y-6 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-dove">
            {trailEvents.map((e, i) => (
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
            <TimelineItem
              title="线索初始录入"
              desc={`由 ${lead.creatorName} 首次采集并建档`}
              time={safeParseDate(lead.createdAt)?.toLocaleString() ?? "-"}
              icon={Plus}
            />
          </div>
        </div>
      )}
    </section>
  );
};

interface TimelineItemProps {
  title: string;
  desc: string;
  time: string;
  icon: React.ElementType;
  isNewest?: boolean;
  user?: string;
}

const TimelineItem: React.FC<TimelineItemProps> = ({
  title,
  desc,
  time,
  icon: Icon,
  isNewest,
  user,
}) => (
  <div className="relative group">
    <div
      className={cn(
        "absolute -left-[31px] top-0 h-6 w-6 rounded-full border-4 border-dove flex items-center justify-center shadow-sm transition-all",
        isNewest ? "bg-ink scale-110" : "bg-fog",
      )}
    >
      <Icon
        className={cn("h-2.5 w-2.5", isNewest ? "text-white" : "text-graphite")}
      />
    </div>
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "text-xs font-black uppercase tracking-tight truncate",
            isNewest ? "text-ink" : "text-graphite",
          )}
        >
          {title}
        </span>
        <span className="text-xs text-ash shrink-0">{time}</span>
      </div>
      <div className="mt-1.5 p-3 bg-pure-white border border-dove rounded-xl shadow-sm text-xs text-graphite leading-relaxed italic group-hover:border-ink/40 transition-colors">
        {desc}
        {user && (
          <div className="mt-1 flex justify-end">
            <span className="text-[9px] px-1.5 py-0.5 bg-fog rounded text-ash font-bold">
              {user}
            </span>
          </div>
        )}
      </div>
    </div>
  </div>
);
