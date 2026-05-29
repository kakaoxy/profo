import { Inbox } from "lucide-react";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
}

export function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-c-text-secondary">
      <div className="mb-4 text-c-border-subtle">
        {icon ?? <Inbox className="h-12 w-12" />}
      </div>
      <p className="text-lg font-medium text-c-text-primary">{title}</p>
      {description && (
        <p className="mt-1 text-sm">{description}</p>
      )}
    </div>
  );
}
