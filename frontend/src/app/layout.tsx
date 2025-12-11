import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css"; // 这里引用 globals.css 是正确的，因为它们在同一级
import { NuqsAdapter } from 'nuqs/adapters/next/app'

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Profo Admin",
  description: "房产中后台管理系统",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={inter.className}>
        {/* 这里包裹适配器 */}
        <NuqsAdapter>
          {children}
        </NuqsAdapter>
      </body>
    </html>
  );
}