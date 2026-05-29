"use client";

import Link from "next/link";

interface CTAButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
}

export function CTAButton({ children, onClick, href }: CTAButtonProps) {
  const className =
    "inline-flex w-full items-center justify-center rounded-xl bg-c-action-gold py-5 text-base font-bold text-c-trust-blue shadow-[0_12px_40px_rgba(212,175,55,0.3)] transition-all active:scale-[0.98] hover:brightness-110";

  if (href) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }

  return (
    <button onClick={onClick} className={className}>
      {children}
    </button>
  );
}
