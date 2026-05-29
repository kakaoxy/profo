"use client";

interface StatsCardProps {
  value: number | string;
  label: string;
  valueColor?: string;
}

export function StatsCard({
  value,
  label,
  valueColor = "text-c-trust-blue",
}: StatsCardProps) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-c-border-subtle bg-white px-6 py-5">
      <span className={`text-2xl font-bold ${valueColor}`}>{value}</span>
      <span className="mt-1 text-xs font-bold uppercase tracking-wider text-c-text-secondary">
        {label}
      </span>
    </div>
  );
}
