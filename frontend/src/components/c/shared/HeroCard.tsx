"use client";

interface HeroCardProps {
  label: string;
  title: string;
  children?: React.ReactNode;
}

export function HeroCard({ label, title, children }: HeroCardProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-c-trust-blue px-6 py-8">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 30% 20%, rgba(212,175,55,0.10) 0%, transparent 60%)",
        }}
      />
      <div className="relative z-10">
        <span className="inline-block rounded-full bg-c-action-gold px-3 py-1 text-xs font-bold text-c-trust-blue">
          {label}
        </span>
        <h2 className="mt-4 text-2xl font-bold leading-snug text-white">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
