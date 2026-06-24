"use client";

interface StatsCardProps {
  value: number | string;
  label: string;
  valueColor?: string;
}

export function StatsCard({
  value,
  label,
  valueColor = "text-ink",
}: StatsCardProps) {
  // Steep Stat Card: white surface, 24px radius, 20px padding, Ink number, Graphite caption
  return (
    <div className="flex flex-col items-center rounded-cards bg-white px-6 py-5 shadow-steep-sm">
      <span className={`text-[26px] font-medium tracking-[-0.009em] ${valueColor}`}>{value}</span>
      <span className="mt-1 text-[13px] tracking-[-0.009em] text-graphite">
        {label}
      </span>
    </div>
  );
}
