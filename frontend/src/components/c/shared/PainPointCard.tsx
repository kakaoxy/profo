"use client";

interface PainPointCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

export function PainPointCard({ icon, title, description }: PainPointCardProps) {
  // Steep: white card on warm-tinted hero, Rust icon, Ink title, Ash description
  return (
    <div className="flex items-start gap-3 rounded-inputs border border-dove/20 bg-white/80 p-4 backdrop-blur-sm">
      <span className="mt-0.5 shrink-0 text-rust">{icon}</span>
      <div>
        <p className="text-base font-medium text-ink">{title}</p>
        <p className="mt-0.5 text-sm text-ash">{description}</p>
      </div>
    </div>
  );
}
