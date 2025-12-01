<template>
  <div class="dashboard space-y-6">
    <!-- Stats Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <div 
        v-for="(stat, index) in stats" 
        :key="index" 
        class="bg-white rounded-xl shadow-sm border border-slate-100 p-6 flex items-center justify-between hover:shadow-md transition-shadow"
      >
        <div>
          <p class="text-sm font-medium text-slate-500">{{ stat.label }}</p>
          <p class="text-2xl font-bold text-slate-800 mt-1">{{ stat.value }}</p>
        </div>
        <div :class="`p-3 rounded-full ${stat.color}`">
          <svg class="h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="stat.icon" />
          </svg>
        </div>
      </div>
    </div>

    <!-- Filters and Actions -->
    <div class="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
      <div class="flex flex-1 gap-4 w-full md:w-auto">
        <div class="relative flex-1 md:max-w-xs">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜索小区名称..."
            class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            @input="handleSearch"
          />
          <span class="absolute left-3 top-2.5 text-gray-400">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </span>
        </div>
        <select
          v-model="statusFilter"
          class="border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          @change="handleFilter"
        >
          <option value="all">全部状态</option>
          <option value="signing">签约</option>
          <option value="renovating">改造</option>
          <option value="selling">在售</option>
          <option value="sold">已售</option>
        </select>
      </div>
      <div class="flex gap-3">
        <button
          class="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center gap-2"
          @click="handleExport"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          导出报表
        </button>
        <button
          class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
          @click="$emit('create-project')"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          新增项目
        </button>
      </div>
    </div>

    <!-- Project List -->
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">项目名称 / ID</th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">小区</th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">签约价 (万)</th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">成交价 (万)</th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">负责人</th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">现金流</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          <tr
            v-for="project in store.filteredProjects"
            :key="project.id"
            class="hover:bg-gray-50 cursor-pointer transition-colors"
            @click="$emit('view-project', project.id)"
          >
            <td class="px-6 py-4 whitespace-nowrap">
              <div class="text-sm font-medium text-gray-900">{{ project.name }}</div>
              <div class="text-sm text-gray-500">{{ project.id }}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
              {{ project.community_name || '-' }}
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
              <span
                class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full"
                :class="statusColors[project.status as ProjectStatus]"
              >
                {{ statusLabels[project.status as ProjectStatus] }}
              </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
              {{ project.signing_price || '-' }}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
              {{ project.soldPrice || '-' }}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
              {{ project.manager || '-' }}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium" @click.stop="$emit('view-cashflow', project.id)">
              <span :class="getCashFlowColor(project.id)">
                {{ formatCurrency(store.getProjectCashFlow(project.id).net) }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="store.filteredProjects.length === 0" class="p-8 text-center text-gray-500">
        未找到匹配的项目
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useProjectManagementStore } from './store';
import type { ProjectStatus } from './types';

const store = useProjectManagementStore();

const searchQuery = ref('');
const statusFilter = ref<ProjectStatus | 'all'>('all');

// Load projects when component mounts
onMounted(async () => {
  await store.loadProjects();
});

const statusLabels: Record<ProjectStatus, string> = {
  signing: '签约',
  renovating: '改造',
  selling: '在售',
  sold: '已售',
};

const statusColors: Record<ProjectStatus, string> = {
  signing: 'bg-blue-100 text-blue-800',
  renovating: 'bg-orange-100 text-orange-800',
  selling: 'bg-purple-100 text-purple-800',
  sold: 'bg-green-100 text-green-800',
};

const stats = computed(() => [
  { 
    label: '签约', 
    value: store.projects.filter(p => p.status === 'signing').length,
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
    color: 'bg-blue-500'
  },
  { 
    label: '改造', 
    value: store.projects.filter(p => p.status === 'renovating').length,
    icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
    color: 'bg-orange-500'
  },
  { 
    label: '在售', 
    value: store.projects.filter(p => p.status === 'selling').length,
    icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
    color: 'bg-purple-500'
  },
  { 
    label: '已售', 
    value: store.projects.filter(p => p.status === 'sold').length,
    icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    color: 'bg-green-500'
  },
]);

const handleSearch = () => {
  store.setFilters({ searchQuery: searchQuery.value });
};

const handleFilter = () => {
  store.setFilters({ status: statusFilter.value });
};

const handleExport = () => {
  alert('正在导出报表...');
};

const getCashFlowColor = (projectId: string) => {
  const net = store.getProjectCashFlow(projectId).net;
  return net >= 0 ? 'text-blue-600 hover:text-blue-800' : 'text-orange-600 hover:text-orange-800';
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(value);
};
</script>
