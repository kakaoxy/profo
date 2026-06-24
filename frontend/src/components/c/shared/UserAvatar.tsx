"use client";

const sizeMap = {
  sm: "w-8 h-8 text-[13px]",
  md: "w-10 h-10 text-[13px]",
  lg: "w-16 h-16 text-2xl",
};

// Steep avatar badge: pastel background (mint/sky/peach), Ink monogram
const PASTEL_BGS = ["bg-apricot-wash", "bg-sky-wash", "bg-[#d4f0e0]"];

interface UserAvatarProps {
  name: string;
  size?: "sm" | "md" | "lg";
}

export function UserAvatar({ name, size = "md" }: UserAvatarProps) {
  const initial = (name || "?").charAt(0).toUpperCase();
  const bgIndex = name
    ? name.charCodeAt(0) % PASTEL_BGS.length
    : 0;
  return (
    <div
      className={`flex items-center justify-center rounded-full ${PASTEL_BGS[bgIndex]} text-ink font-medium shrink-0 ${sizeMap[size]}`}
    >
      {initial}
    </div>
  );
}
