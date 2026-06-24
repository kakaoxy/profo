"use client";

import { Menu, Search, ArrowLeft } from "lucide-react";

interface TopAppBarProps {
  variant: "main" | "back";
  title?: string;
  onBack?: () => void;
  actionIcon?: React.ReactNode;
}

export function TopAppBar({ variant, title, onBack, actionIcon }: TopAppBarProps) {
  if (variant === "main") {
    return (
      <header className="fixed top-0 inset-x-0 z-50 h-16 border-b border-dove/30 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-full max-w-[1200px] items-center justify-between px-4">
          <button className="flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-fog">
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-lg font-medium tracking-tight text-ink">Profo</span>
          <button className="flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-fog">
            <Search className="h-5 w-5" />
          </button>
        </div>
      </header>
    );
  }

  return (
    <header className="fixed top-0 inset-x-0 z-50 h-16 border-b border-dove/30 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-full max-w-[1200px] items-center justify-between px-4">
        <button
          className="flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-fog"
          onClick={onBack}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <span className="text-base font-medium text-ink">
          {title ?? ""}
        </span>
        <div className="flex h-10 w-10 items-center justify-center">
          {actionIcon ?? null}
        </div>
      </div>
    </header>
  );
}
