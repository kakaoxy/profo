"use client";

import Link from "next/link";

interface CTAButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  className?: string;
}

export function CTAButton({ children, onClick, href, className = "" }: CTAButtonProps) {
  // Steep Filled Dark CTA: Ink pill, white text, 9999px radius, one per screen
  const base =
    "inline-flex items-center justify-center rounded-full bg-ink px-5 py-2.5 text-[15px] font-medium text-white tracking-[-0.009em] transition-all active:scale-[0.98] hover:opacity-90";
  const cls = className ? `${base} ${className}` : base;

  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }

  return (
    <button onClick={onClick} className={cls}>
      {children}
    </button>
  );
}
