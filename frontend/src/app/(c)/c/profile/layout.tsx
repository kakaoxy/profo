import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "编辑资料 - 美房宝 | Profo",
  description: "修改您的美房宝账户昵称与手机号。",
  openGraph: {
    title: "编辑资料 - 美房宝 | Profo",
    description: "修改您的美房宝账户昵称与手机号。",
    url: "/c/profile",
  },
};

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
