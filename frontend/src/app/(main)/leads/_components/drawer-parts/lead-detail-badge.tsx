import React from "react";

interface DetailBadgeProps {
  label: string;
  value: string;
  icon: React.ReactNode;
}

export const DetailBadge: React.FC<DetailBadgeProps> = ({ label, value, icon }) => (
  <div className="flex flex-col gap-1">
    <span className="text-[9px] font-black text-slate-400 uppercase flex items-center gap-1">
      {icon} {label}
    </span>
    <span className="text-xs font-bold text-slate-900 truncate">{value}</span>
  </div>
);
