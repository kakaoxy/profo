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
      <div className="rounded-xl bg-white p-6 shadow-[0px_4px_20px_rgba(15,23,42,0.05)] border border-c-border-subtle">
        <h3 className="text-lg font-bold text-c-trust-blue mb-4">跟进记录</h3>
        <p className="text-sm text-c-text-secondary">暂无跟进记录</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white p-6 shadow-[0px_4px_20px_rgba(15,23,42,0.05)] border border-c-border-subtle">
      <h3 className="text-lg font-bold text-c-trust-blue mb-4">跟进记录</h3>
      <ul className="space-y-4">
        {followUps.map((item) => (
          <li key={item.id} className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-c-trust-blue text-xs font-bold text-white">
              {item.method.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-c-text-primary">{item.method}</span>
                <span className="text-xs text-c-text-secondary">{item.followed_at}</span>
              </div>
              <p className="mt-1 text-sm text-c-text-secondary">{item.content}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
