"use client";

const sizeMap = {
  sm: "w-8 h-8 text-sm",
  md: "w-12 h-12 text-lg",
  lg: "w-16 h-16 text-2xl",
};

interface UserAvatarProps {
  name: string;
  size?: "sm" | "md" | "lg";
}

export function UserAvatar({ name, size = "md" }: UserAvatarProps) {
  const initial = (name || "?").charAt(0).toUpperCase();
  return (
    <div
      className={`flex items-center justify-center rounded-full bg-c-trust-blue text-white font-bold shrink-0 ${sizeMap[size]}`}
    >
      {initial}
    </div>
  );
}
