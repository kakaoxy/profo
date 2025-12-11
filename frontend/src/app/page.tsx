'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';
import { LogoSemi } from '@/components/Icons';

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 检查用户是否已登录
    if (isAuthenticated()) {
      // 已登录，跳转到dashboard
      router.push('/dashboard');
    } else {
      // 未登录，跳转到登录页面
      router.push('/login');
    }
  }, [router]);

  // 在检查认证状态期间显示加载状态
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="flex justify-center mb-4">
          <LogoSemi />
        </div>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">加载中...</p>
      </div>
    </div>
  );
}
