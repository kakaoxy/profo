"use client";

interface PainPointCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

export function PainPointCard({ icon, title, description }: PainPointCardProps) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-white/20 bg-white/10 p-4 backdrop-blur">
      <span className="mt-0.5 shrink-0 text-c-action-gold">{icon}</span>
      <div>
        <p className="text-lg font-semibold text-white">{title}</p>
        <p className="mt-0.5 text-sm text-white/70">{description}</p>
      </div>
    </div>
  );
}
