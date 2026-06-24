"use client";

interface FollowUp {
  id: string;
  method: string;
  content: string;
  followed_at: string;
}

interface FollowUpListProps {
  followUps: FollowUp[];
}

export function FollowUpList({ followUps }: FollowUpListProps) {
  if (followUps.length === 0) {
    return (
      <div className="rounded-cards bg-white p-6 shadow-steep-sm border border-dove/30">
        <h3 className="text-lg font-medium text-ink mb-4">跟进记录</h3>
        <p className="text-sm text-ash">暂无跟进记录</p>
      </div>
    );
  }

  return (
    <div className="rounded-cards bg-white p-6 shadow-steep-sm border border-dove/30">
      <h3 className="text-lg font-medium text-ink mb-4">跟进记录</h3>
      <ul className="divide-y divide-dove/20">
        {followUps.map((item) => (
          <li key={item.id} className="flex gap-3 py-4 first:pt-0 last:pb-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rust text-xs font-medium text-white">
              {item.method.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-ink">{item.method}</span>
                <span className="text-xs text-ash">{item.followed_at}</span>
              </div>
              <p className="mt-1 text-sm text-ash">{item.content}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
