import { Inbox } from "lucide-react";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
}

export function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-graphite">
      <div className="mb-4 text-dove">
        {icon ?? <Inbox className="h-12 w-12" aria-hidden="true" />}
      </div>
      <p className="text-[18px] font-medium leading-[1.35] text-ink">{title}</p>
      {description && (
        <p className="mt-1.5 text-[14px] leading-[1.5] text-graphite">{description}</p>
      )}
    </div>
  );
}
