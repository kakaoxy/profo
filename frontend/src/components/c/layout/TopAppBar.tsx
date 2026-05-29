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
      <header className="fixed top-0 inset-x-0 z-50 h-16 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-full max-w-[1280px] items-center justify-between px-4">
          <button className="flex h-10 w-10 items-center justify-center rounded-full text-c-text-primary hover:bg-gray-100">
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-lg font-bold text-c-trust-blue">Profo</span>
          <button className="flex h-10 w-10 items-center justify-center rounded-full text-c-text-primary hover:bg-gray-100">
            <Search className="h-5 w-5" />
          </button>
        </div>
      </header>
    );
  }

  return (
    <header className="fixed top-0 inset-x-0 z-50 h-16 border-b bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-full max-w-[1280px] items-center justify-between px-4">
        <button
          className="flex h-10 w-10 items-center justify-center rounded-full text-c-text-primary hover:bg-gray-100"
          onClick={onBack}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <span className="text-base font-semibold text-c-text-primary">
          {title ?? ""}
        </span>
        <div className="flex h-10 w-10 items-center justify-center">
          {actionIcon ?? null}
        </div>
      </div>
    </header>
  );
}
