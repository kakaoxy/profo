"use client";

interface HeroCardProps {
  label: string;
  title: string;
  children?: React.ReactNode;
}

export function HeroCard({ label, title, children }: HeroCardProps) {
  // Steep hero: white canvas with soft warm radial glow, Rust label, Ink display title
  return (
    <div className="relative overflow-hidden rounded-cards bg-white shadow-steep">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 30% 20%, rgba(251,225,209,0.6) 0%, transparent 60%)",
        }}
      />
      <div className="relative z-10 px-6 py-8">
        <span className="inline-block rounded-full bg-apricot-wash px-3 py-1 text-xs font-medium tracking-[-0.009em] text-rust">
          {label}
        </span>
        <h2 className="font-display mt-4 text-[28px] leading-[1.15] text-ink">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
