'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated, getUser } from '@/lib/auth';
import { User } from '@/types';
import Sidebar from '@/components/Sidebar';
import FilterPanel from '@/components/FilterPanel';
import PropertyTable from '@/components/PropertyTable';
import { Property, PropertyListResponse, FilterState, SortState } from '@/types/property';
import { Button, Pagination } from '@douyinfe/semi-ui';
import { IconExport } from '@/components/Icons';

export default function PropertiesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [properties, setProperties] = useState<Property[]>([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [filters, setFilters] = useState<FilterState>({
    status: '',
    community_name: '',
    rooms: [],
    floor_type: [],
    min_price: null,
    max_price: null,
    min_area: null,
    max_area: null,
    district: [],
    business_circle: []
  });
  const [sort, setSort] = useState<SortState>({ field: '', order: 'asc' });
  const [tableLoading, setTableLoading] = useState(false);

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

    // 检查权限
    if (!currentUser.role.permissions.includes('view_data')) {
      router.push('/dashboard');
      return;
    }

    setLoading(false);
  }, [router]);

  // 加载房源数据
  useEffect(() => {
    if (!loading) {
      loadProperties();
    }
  }, [loading, currentPage, pageSize, filters, sort]);

  const loadProperties = async () => {
    setTableLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const params = new URLSearchParams({
        page: currentPage.toString(),
        page_size: pageSize.toString(),
      });

      // 添加筛选条件
      if (filters.status) params.append('status', filters.status);
      if (filters.community_name) params.append('community_name', filters.community_name);
      if (filters.rooms.length > 0) params.append('rooms', filters.rooms.join(','));
      if (filters.floor_type.length > 0) params.append('floor_type', filters.floor_type.join(','));
      if (filters.min_price) params.append('min_price', filters.min_price.toString());
      if (filters.max_price) params.append('max_price', filters.max_price.toString());
      if (filters.min_area) params.append('min_area', filters.min_area.toString());
      if (filters.max_area) params.append('max_area', filters.max_area.toString());
      if (filters.district.length > 0) params.append('district', filters.district.join(','));
      if (filters.business_circle.length > 0) params.append('business_circle', filters.business_circle.join(','));

      // 添加排序
      if (sort.field) {
        params.append('sort_by', sort.field);
        params.append('sort_order', sort.order);
      }

      const response = await fetch(`http://localhost:8000/api/properties?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('获取房源数据失败');
      }

      const result: PropertyListResponse = await response.json();
      setProperties(result.items || []);
      setTotal(result.total || 0);
    } catch (error) {
      console.error('加载房源数据失败:', error);
    } finally {
      setTableLoading(false);
    }
  };

  const handleFilterChange = (newFilters: Partial<FilterState>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
    setCurrentPage(1); // 重置到第一页
  };

  const handleSort = (newSort: SortState) => {
    setSort(newSort);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  };

  const handleExport = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const params = new URLSearchParams();

      // 添加筛选条件
      if (filters.status) params.append('status', filters.status);
      if (filters.community_name) params.append('community_name', filters.community_name);
      if (filters.rooms.length > 0) params.append('rooms', filters.rooms.join(','));
      if (filters.floor_type.length > 0) params.append('floor_type', filters.floor_type.join(','));
      if (filters.min_price) params.append('min_price', filters.min_price.toString());
      if (filters.max_price) params.append('max_price', filters.max_price.toString());
      if (filters.min_area) params.append('min_area', filters.min_area.toString());
      if (filters.max_area) params.append('max_area', filters.max_area.toString());
      if (filters.district.length > 0) params.append('district', filters.district.join(','));
      if (filters.business_circle.length > 0) params.append('business_circle', filters.business_circle.join(','));

      const response = await fetch(`http://localhost:8000/api/properties/export?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('导出失败');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `房源数据_${new Date().toLocaleDateString()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('导出失败:', error);
    }
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
    <div className="min-h-screen bg-gray-50 flex">
      {/* 左侧边栏 */}
      <Sidebar />
      
      {/* 主内容区域 */}
      <div className="flex-1 flex flex-col lg:flex-row">
        {/* 筛选面板 - 移动端可折叠 */}
        <div className="lg:w-80 bg-white border-b lg:border-b-0 lg:border-r border-gray-100 p-4 lg:p-6 overflow-y-auto">
          <div className="flex items-center justify-between lg:block mb-4 lg:mb-6">
            <h2 className="text-lg font-bold text-gray-900">筛选条件</h2>
            <button className="lg:hidden text-gray-500 hover:text-gray-700">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <FilterPanel
            filters={filters}
            onFilterChange={handleFilterChange}
          />
        </div>

        {/* 房源列表区域 */}
        <div className="flex-1 p-4 lg:p-6 overflow-y-auto">
          {/* 头部 */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 lg:mb-6 gap-4">
            <h1 className="text-xl lg:text-2xl font-bold text-gray-900">房源列表</h1>
            <Button
              type="primary"
              icon={<IconExport />}
              onClick={handleExport}
              className="w-full sm:w-auto"
            >
              导出
            </Button>
          </div>

          {/* 房源表格 */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
            <PropertyTable
              data={properties}
              loading={tableLoading}
              onSort={handleSort}
            />
          </div>

          {/* 分页 */}
          <div className="mt-4 lg:mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-sm text-gray-500 order-2 sm:order-1">
              共 {total} 条记录
            </div>
            <div className="order-1 sm:order-2 w-full sm:w-auto">
              <Pagination
                currentPage={currentPage}
                total={total}
                pageSize={pageSize}
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
                pageSizeOpts={[50, 100, 200]}
                showSizeChanger
                showTotal={false}
                className="w-full sm:w-auto"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}