"use client";

import React, { useState } from "react";
import { ChevronDown, History } from "lucide-react";
import { Lead, FollowUpMethod, FollowUp, FollowUpConclusion, LeadStatus } from "../../types";
import { cn } from "@/lib/utils";
import { safeParseDate } from "@/lib/validators";
import { safeFormatDate } from "@/lib/formatters";
import { getLeadFollowUpsAction } from "../../actions";
import { FOLLOW_UP_CONCLUSIONS } from "../../constants/ui-labels";
import { getFollowUpConclusionMeta, getFollowUpMethodShort } from "../../_lib/follow-up-meta";

interface FollowUpTimelineProps {
  lead: Lead;
  followUps: FollowUp[];
  onAddFollowUp: (
    leadId: string,
    method: FollowUpMethod,
    content: string,
    conclusion?: FollowUpConclusion | null,
  ) => void;
  onRefreshFollowUps: (updated: FollowUp[]) => void;
}

type TrailEvent = {
  key: string;
  title: string;
  desc: string;
  time: string;
  sortTime: number;
  user?: string;
  conclusion?: FollowUpConclusion | null;
};

const METHOD_TITLE: Record<FollowUpMethod, string> = {
  phone: "电话",
  wechat: "微信",
  face: "面谈",
  visit: "带看",
};

const timelineDate = (raw?: string): string => safeFormatDate(raw, "MM-dd HH:mm", "—");

export const FollowUpTimeline: React.FC<FollowUpTimelineProps> = ({
  lead,
  followUps,
  onAddFollowUp,
  onRefreshFollowUps,
}) => {
  const [open, setOpen] = useState(true);
  const [followUpMethod, setFollowUpMethod] = useState<FollowUpMethod>("phone");
  const [followUpContent, setFollowUpContent] = useState("");
  const [followUpConclusion, setFollowUpConclusion] = useState<FollowUpConclusion | "">("");

  const handleAddFollowUpSubmit = async () => {
    if (!lead || !followUpContent.trim()) return;
    await onAddFollowUp(lead.id, followUpMethod, followUpContent.trim(), followUpConclusion || null);
    const result = await getLeadFollowUpsAction(lead.id);
    if (result.success) onRefreshFollowUps(result.data);
    setFollowUpContent("");
    setFollowUpConclusion("");
  };

  const trailEvents: TrailEvent[] = [];
  const hasAssessment = lead.evalPrice != null || !!lead.auditReason || !!lead.auditTime;
  if (hasAssessment) {
    const d = safeParseDate(lead.auditTime ?? lead.updatedAt);
    const isRejected = lead.status === LeadStatus.REJECTED;
    trailEvents.push({
      key: "audit",
      title: isRejected ? "评估不符 · 已放弃" : "收房评估",
      desc: isRejected
        ? `评估意见：${lead.auditReason || "未填写具体原因"}`
        : `拟收房评估价 ¥${lead.evalPrice ?? "-"} 万${lead.auditReason ? ` · ${lead.auditReason}` : ""}`,
      time: timelineDate(lead.auditTime ?? lead.updatedAt),
      sortTime: d?.getTime() ?? 0,
    });
  }
  followUps.forEach((f) => {
    const d = safeParseDate(f.followedAt);
    trailEvents.push({
      key: f.id,
      title: METHOD_TITLE[f.method] ?? getFollowUpMethodShort(f.method),
      desc: f.content,
      time: timelineDate(f.followedAt),
      sortTime: d?.getTime() ?? 0,
      user: f.createdBy,
      conclusion: f.conclusion ?? null,
    });
  });
  trailEvents.sort((a, b) => b.sortTime - a.sortTime);
  const createdTime = timelineDate(lead.createdAt);

  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-3.5 w-3.5 text-graphite" strokeWidth={1.7} />
          <span className="text-[12px] font-[500] text-ink">跟进记录</span>
          <span className="text-[9.5px] text-dove">{trailEvents.length + 1} 条事件</span>
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label={open ? "收起跟进记录" : "展开跟进记录"}
          className="flex h-7 w-7 items-center justify-center rounded-full text-graphite transition-colors hover:bg-fog hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
        >
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
        </button>
      </div>

      {open ? (
        <>
          <div className="rounded-[14px] border border-dove/30 bg-pure-white px-3.5 py-3">
            <div className="text-[10px] font-[500] text-graphite">登记最新动态</div>
            <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
              <select
                className="h-9 shrink-0 rounded-full border border-dove/30 bg-fog px-3 text-[10px] text-ink outline-none focus:border-ink/40"
                value={followUpMethod}
                onChange={(event) => setFollowUpMethod(event.target.value as FollowUpMethod)}
                aria-label="跟进方式"
              >
                <option value="phone">电话沟通</option>
                <option value="wechat">微信联络</option>
                <option value="face">面谈记录</option>
                <option value="visit">带看实勘</option>
              </select>
              <input
                id="follow-up-content" placeholder="输入跟进摘要..."
                className="h-9 min-w-0 flex-1 rounded-full border border-dove/30 bg-fog px-3.5 text-[10px] text-ink outline-none placeholder:text-dove focus:border-ink/40 focus:ring-2 focus:ring-ink/10"
                value={followUpContent}
                onChange={(event) => setFollowUpContent(event.target.value)}
              />
              <button
                type="button"
                onClick={handleAddFollowUpSubmit}
                className="h-9 shrink-0 rounded-full bg-ink px-4 text-[10px] font-[500] text-white transition-colors hover:bg-[#2a2e33] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
              >
                记录
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[9px] text-dove">跟进结论</span>
              {(Object.keys(FOLLOW_UP_CONCLUSIONS) as FollowUpConclusion[]).map((key) => {
                const active = followUpConclusion === key;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFollowUpConclusion(active ? "" : key)}
                    className={cn(
                      "h-6 rounded-full border px-2 text-[9px] transition-colors",
                      active
                        ? "border-ink bg-ink text-white"
                        : "border-dove/30 bg-pure-white text-graphite hover:border-dove hover:text-ink",
                    )}
                  >
                    {FOLLOW_UP_CONCLUSIONS[key]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t border-dove/25">
            {trailEvents.map((event) => (
              <TimelineItem
                key={event.key}
                title={event.title}
                desc={event.desc}
                time={event.time}
                user={event.user}
                conclusion={event.conclusion}
              />
            ))}
            <TimelineItem
              title="初始录入"
              desc={`由 ${lead.creatorName || "—"} 首次采集并建档`}
              time={createdTime}
            />
          </div>
        </>
      ) : null}
    </section>
  );
};

interface TimelineItemProps {
  title: string;
  desc: string;
  time: string;
  user?: string;
  conclusion?: FollowUpConclusion | null;
}

const TimelineItem: React.FC<TimelineItemProps> = ({ title, desc, time, user, conclusion }) => {
  const conclusionMeta = conclusion ? getFollowUpConclusionMeta(conclusion) : null;
  return (
    <div className="grid grid-cols-[78px_minmax(0,1fr)] gap-3.5 border-b border-dove/15 py-3 last:border-b-0">
      <div className="whitespace-pre-line pt-0.5 text-[9.5px] leading-[1.6] tabular-nums text-dove">
        {time}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-[500] text-ink">{title}</span>
          {user ? <span className="text-[9.5px] text-dove">{user}</span> : null}
          {conclusionMeta ? (
            <span
              className={cn(
                "inline-flex h-[18px] items-center rounded-full px-1.5 text-[9px] font-medium",
                conclusionMeta.badgeClass,
              )}
            >
              {conclusionMeta.label}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-[10.5px] leading-[1.65] text-ash">{desc}</p>
      </div>
    </div>
  );
};
