export interface UserInfo {
  nickname: string | null;
  phone: string | null;
}

export function getUserInfoFromCookie(): UserInfo {
  if (typeof document === "undefined") return { nickname: null, phone: null };
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith("c_user_info="));
  if (!match) return { nickname: null, phone: null };
  try {
    const raw = decodeURIComponent(match.split("=").slice(1).join("="));
    return JSON.parse(raw) as UserInfo;
  } catch {
    return { nickname: null, phone: null };
  }
}
