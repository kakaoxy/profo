'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getUser, isAuthenticated } from '@/lib/auth';
import { User } from '@/types';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
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

    setUser(currentUser);
    setLoading(false);
  }, [router]);

  const handleLogout = () => {
    // 清除认证信息
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    
    // 跳转到登录页
    router.push('/login');
    router.refresh();
  };

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
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航栏 */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900">RealEstate System</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">
                欢迎, {user?.nickname || user?.username}
              </span>
              <button
                onClick={handleLogout}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                退出登录
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* 主要内容区域 */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">仪表板</h2>
            <p className="text-gray-600 mb-6">
              欢迎来到RealEstate管理系统。这里是您的管理中心。
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* 统计卡片 */}
              <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
                <h3 className="text-lg font-semibold text-blue-900 mb-2">房源管理</h3>
                <p className="text-blue-700 text-sm">管理您的房源信息，包括在售和成交房源</p>
              </div>
              
              <div className="bg-green-50 rounded-lg p-6 border border-green-200">
                <h3 className="text-lg font-semibold text-green-900 mb-2">项目管理</h3>
                <p className="text-green-700 text-sm">跟踪和管理房产改造项目</p>
              </div>
              
              <div className="bg-purple-50 rounded-lg p-6 border border-purple-200">
                <h3 className="text-lg font-semibold text-purple-900 mb-2">数据分析</h3>
                <p className="text-purple-700 text-sm">查看房产市场数据和趋势分析</p>
              </div>
            </div>

            {/* 用户信息 */}
            <div className="mt-8 bg-gray-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">用户信息</h3>
              <div className="space-y-2 text-sm">
                <div className="flex">
                  <span className="font-medium text-gray-700 w-24">用户名:</span>
                  <span className="text-gray-600">{user?.username}</span>
                </div>
                <div className="flex">
                  <span className="font-medium text-gray-700 w-24">昵称:</span>
                  <span className="text-gray-600">{user?.nickname}</span>
                </div>
                <div className="flex">
                  <span className="font-medium text-gray-700 w-24">角色:</span>
                  <span className="text-gray-600">{user?.role?.name}</span>
                </div>
                <div className="flex">
                  <span className="font-medium text-gray-700 w-24">权限:</span>
                  <span className="text-gray-600">
                    {user?.role?.permissions?.join(', ') || '无'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}