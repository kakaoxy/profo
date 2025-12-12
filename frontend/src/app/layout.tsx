import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { NuqsAdapter } from 'nuqs/adapters/next/app';
// 1. 引入组件 (现在文件应该存在了)
import { Toaster } from "@/components/ui/sonner";

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
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={inter.className}>
        <NuqsAdapter>
          {children}
        </NuqsAdapter>
        
        {/* 2. 关键修复：把组件放在这里渲染 */}
        <Toaster />
      </body>
    </html>
  );
}