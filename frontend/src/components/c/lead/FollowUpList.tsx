"use client";

import { Phone, MessageCircle, Video } from "lucide-react";

interface FollowUp {
  id: string;
  method: string;
  content: string;
  followed_at: string;
}

interface FollowUpListProps {
  followUps: FollowUp[];
}

const METHOD_ICONS: Record<string, React.ReactNode> = {
  phone: <Phone className="h-4 w-4" aria-hidden="true" />,
  message: <MessageCircle className="h-4 w-4" aria-hidden="true" />,
  video: <Video className="h-4 w-4" aria-hidden="true" />,
};

export function FollowUpList({ followUps }: FollowUpListProps) {
  if (followUps.length === 0) {
    return (
      <div className="rounded-cards bg-white p-6 shadow-steep-sm border border-dove/30">
        <h2 className="text-[18px] font-medium leading-[1.35] tracking-[-0.16px] text-ink mb-1">
          跟进记录
        </h2>
        <p className="text-[14px] text-graphite mb-4">顾问的跟进动态</p>
        <p className="text-[15px] text-ash py-4 text-center">暂无跟进记录</p>
      </div>
    );
  }

  return (
    <div className="rounded-cards bg-white p-6 shadow-steep-sm border border-dove/30">
      <h2 className="text-[18px] font-medium leading-[1.35] tracking-[-0.16px] text-ink mb-1">
        跟进记录
      </h2>
      <p className="text-[14px] text-graphite mb-4">顾问的跟进动态</p>
      <ul className="divide-y divide-dove/20">
        {followUps.map((item) => (
          <li key={item.id} className="flex gap-3 py-4 first:pt-0 last:pb-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fog text-graphite">
              {METHOD_ICONS[item.method.toLowerCase()] ?? (
                <span className="text-[12px] font-medium text-ink">
                  {item.method.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-medium tracking-[-0.009em] text-ink">{item.method}</span>
                <span className="text-[12px] text-graphite">{item.followed_at}</span>
              </div>
              <p className="mt-1 text-[14px] leading-[1.5] text-ash">{item.content}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
