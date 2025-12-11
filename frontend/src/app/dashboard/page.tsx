'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getUser, isAuthenticated } from '@/lib/auth';
import { User } from '@/types';
import Sidebar from '@/components/Sidebar';
import DashboardContent from '@/components/DashboardContent';
import RightSidebar from '@/components/RightSidebar';

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 检查用户是否已认证
    if (!isAuthenticated()) {
      router.push('/login');
      return;
    }

    // 获取用户信息
    const currentUser = getUser();
    if (!currentUser) {
      router.push('/login');
      return;
    }

    setLoading(false);
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* 左侧边栏 */}
      <Sidebar />
      
      {/* 主内容区域 */}
      <DashboardContent />
      
      {/* 右侧边栏 */}
      <RightSidebar />
    </div>
  );
}