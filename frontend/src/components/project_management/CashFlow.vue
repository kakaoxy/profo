<template>
  <div class="cash-flow max-w-6xl mx-auto space-y-6 px-4 pb-12">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center space-x-4">
        <button 
          @click="$emit('back')"
          class="p-2 hover:bg-slate-100 rounded-full transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <div>
          <h2 class="text-2xl font-bold text-slate-800">现金流管理</h2>
          <p class="text-slate-500 text-sm mt-1" v-if="project">{{ project.community_name }} - {{ project.name }}</p>
        </div>
      </div>
      <button 
        @click="showAddModal = true"
        class="flex items-center bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        记一笔
      </button>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div class="bg-white rounded-xl shadow-sm border border-green-100 p-6 flex flex-col justify-between relative overflow-hidden">
        <div class="absolute top-0 right-0 p-4 opacity-10">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-24 w-24 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
        </div>
        <p class="text-sm font-medium text-slate-500">总收入</p>
        <p class="text-3xl font-bold text-green-600 mt-2">¥ {{ stats.income.toFixed(2) }} <span class="text-sm text-slate-400 font-normal">万</span></p>
      </div>
      <div class="bg-white rounded-xl shadow-sm border border-red-100 p-6 flex flex-col justify-between relative overflow-hidden">
        <div class="absolute top-0 right-0 p-4 opacity-10">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-24 w-24 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
          </svg>
        </div>
        <p class="text-sm font-medium text-slate-500">总支出</p>
        <p class="text-3xl font-bold text-red-500 mt-2">¥ {{ stats.expense.toFixed(2) }} <span class="text-sm text-slate-400 font-normal">万</span></p>
      </div>
      <div class="bg-white rounded-xl shadow-sm border border-blue-100 p-6 flex flex-col justify-between relative overflow-hidden">
        <div class="absolute top-0 right-0 p-4 opacity-10">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-24 w-24 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p class="text-sm font-medium text-slate-500">净现金流</p>
        <p class="text-3xl font-bold mt-2" :class="stats.net >= 0 ? 'text-blue-600' : 'text-orange-500'">
          {{ stats.net >= 0 ? '+' : '' }}¥ {{ stats.net.toFixed(2) }} <span class="text-sm text-slate-400 font-normal">万</span>
        </p>
      </div>
    </div>

    <!-- Investment Analysis Section -->
    <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <h3 class="text-lg font-bold text-slate-800 mb-6 flex items-center">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
        </svg>
        投资回报分析
      </h3>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-8 divide-y md:divide-y-0 md:divide-x divide-slate-100">
        <div class="flex items-center space-x-4 px-4">
           <div class="p-3 bg-indigo-50 rounded-full text-indigo-600">
             <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
             </svg>
           </div>
           <div>
             <p class="text-sm text-slate-500">投资回报率 (ROI)</p>
             <p class="text-2xl font-bold" :class="investmentData.roi >= 0 ? 'text-indigo-600' : 'text-red-500'">
               {{ investmentData.roi.toFixed(2) }}%
             </p>
             <p class="text-xs text-slate-400 mt-1">净利润 / 总支出</p>
           </div>
        </div>
        <div class="flex items-center space-x-4 px-4 pt-4 md:pt-0">
           <div class="p-3 bg-purple-50 rounded-full text-purple-600">
             <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
             </svg>
           </div>
           <div>
             <p class="text-sm text-slate-500">年化回报率 (Annualized)</p>
             <p class="text-2xl font-bold" :class="investmentData.annualizedRoi >= 0 ? 'text-purple-600' : 'text-red-500'">
               {{ investmentData.annualizedRoi.toFixed(2) }}%
             </p>
             <p class="text-xs text-slate-400 mt-1">基于当前持有天数推算</p>
           </div>
        </div>
        <div class="flex items-center space-x-4 px-4 pt-4 md:pt-0">
           <div class="p-3 bg-amber-50 rounded-full text-amber-600">
             <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
             </svg>
           </div>
           <div>
             <p class="text-sm text-slate-500">资金占用周期</p>
             <p class="text-2xl font-bold text-amber-600">
               {{ investmentData.days }} <span class="text-sm font-normal">天</span>
             </p>
             <p class="text-xs text-slate-400 mt-1">从签约/创建至今</p>
           </div>
        </div>
      </div>
    </div>

    <!-- Filter Bar -->
    <div class="flex items-center justify-between">
      <h3 class="text-lg font-bold text-slate-800">收支明细</h3>
      <div class="flex items-center bg-white border border-slate-300 rounded-lg p-1">
        <button 
          @click="filterType = 'ALL'"
          class="px-3 py-1.5 text-xs font-medium rounded-md transition-colors"
          :class="filterType === 'ALL' ? 'bg-slate-100 text-slate-800' : 'text-slate-500 hover:text-slate-700'"
        >
          全部
        </button>
        <button 
          @click="filterType = CashFlowType.INCOME"
          class="px-3 py-1.5 text-xs font-medium rounded-md transition-colors"
          :class="filterType === CashFlowType.INCOME ? 'bg-green-100 text-green-700' : 'text-slate-500 hover:text-slate-700'"
        >
          收入
        </button>
        <button 
          @click="filterType = CashFlowType.EXPENSE"
          class="px-3 py-1.5 text-xs font-medium rounded-md transition-colors"
          :class="filterType === CashFlowType.EXPENSE ? 'bg-red-100 text-red-700' : 'text-slate-500 hover:text-slate-700'"
        >
          支出
        </button>
      </div>
    </div>

    <!-- Records Table -->
    <div class="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-slate-200">
          <thead class="bg-slate-50">
            <tr>
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">日期</th>
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">分类</th>
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">说明/关联</th>
              <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">金额(万)</th>
              <th scope="col" class="relative px-6 py-3"><span class="sr-only">操作</span></th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-slate-200">
            <template v-if="filteredRecords.length > 0">
              <tr v-for="record in filteredRecords" :key="record.id" class="hover:bg-slate-50 transition-colors">
                <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{{ record.date }}</td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                    :class="record.type === CashFlowType.INCOME ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'"
                  >
                    {{ record.category }}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-700">
                  <div class="flex flex-col">
                    <span>{{ record.description || '-' }}</span>
                    <!-- Note: relatedStage/relatedItem not in base type yet but used in logic -->
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-bold"
                  :class="record.type === CashFlowType.INCOME ? 'text-green-600' : 'text-slate-900'"
                >
                  {{ record.type === CashFlowType.INCOME ? '+' : '-' }}{{ record.amount.toFixed(4) }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button @click="handleDeleteRecord(record.id)" class="text-slate-400 hover:text-red-600 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </td>
              </tr>
            </template>
            <tr v-else>
              <td colspan="5" class="px-6 py-12 text-center text-sm text-slate-500">
                暂无相关记录
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Add Record Modal -->
    <div v-if="showAddModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div class="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div class="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 class="text-lg font-bold text-slate-800">记一笔</h3>
          <button @click="showAddModal = false" class="text-slate-400 hover:text-slate-600">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div class="p-6 space-y-4">
          <!-- Type Selection -->
          <div class="grid grid-cols-2 gap-4">
            <button
              @click="setRecordType(CashFlowType.EXPENSE)"
              class="flex items-center justify-center py-3 rounded-lg border font-medium transition-all"
              :class="newRecord.type === CashFlowType.EXPENSE ? 'bg-red-50 border-red-200 text-red-600 ring-1 ring-red-500' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
              </svg> 支出
            </button>
            <button
              @click="setRecordType(CashFlowType.INCOME)"
              class="flex items-center justify-center py-3 rounded-lg border font-medium transition-all"
              :class="newRecord.type === CashFlowType.INCOME ? 'bg-green-50 border-green-200 text-green-600 ring-1 ring-green-500' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg> 收入
            </button>
          </div>

          <!-- Amount -->
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">金额 (万元)</label>
            <div class="relative">
              <span class="absolute left-3 top-2.5 text-slate-400">¥</span>
              <input
                type="number"
                v-model.number="newRecord.amount"
                class="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-lg font-semibold"
                placeholder="0.00"
              />
            </div>
          </div>

          <!-- Date -->
          <div>
             <label class="block text-sm font-medium text-slate-700 mb-1">日期</label>
             <input
                type="date"
                v-model="newRecord.date"
                class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
          </div>

          <!-- Category -->
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">分类</label>
            <select
              v-model="newRecord.category"
              class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
            >
              <option v-for="cat in currentCategories" :key="cat" :value="cat">{{ cat }}</option>
            </select>
          </div>

          <!-- Description -->
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">备注说明</label>
            <textarea
              v-model="newRecord.description"
              rows="2"
              class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="添加备注..."
            />
          </div>

        </div>
        
        <div class="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end space-x-3">
          <button 
            @click="showAddModal = false"
            class="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-white transition-colors"
          >
            取消
          </button>
          <button 
            @click="handleAddRecord"
            :disabled="!newRecord.amount"
            class="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            确认添加
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useProjectManagementStore } from './store';
import { CashFlowType, CashFlowCategory, type CashFlowRecord } from './types';

const props = defineProps<{
  projectId: string;
}>();



const store = useProjectManagementStore();

const project = computed(() => store.projects.find(p => p.id === props.projectId));
const records = computed(() => store.cashFlows.filter(cf => cf.projectId === props.projectId));

const showAddModal = ref(false);
const filterType = ref<'ALL' | CashFlowType>('ALL');

const newRecord = ref<Partial<CashFlowRecord>>({
  type: CashFlowType.EXPENSE,
  category: CashFlowCategory.RENOVATION_COST,
  amount: 0,
  date: new Date().toISOString().split('T')[0],
  description: '',
});

const filteredRecords = computed(() => {
  if (filterType.value === 'ALL') return records.value;
  return records.value.filter(r => r.type === filterType.value);
});

const stats = computed(() => {
  const income = records.value.filter(r => r.type === CashFlowType.INCOME).reduce((sum, r) => sum + r.amount, 0);
  const expense = records.value.filter(r => r.type === CashFlowType.EXPENSE).reduce((sum, r) => sum + r.amount, 0);
  return {
    income,
    expense,
    net: income - expense
  };
});

const investmentData = computed(() => {
  if (!project.value) return { days: 0, roi: 0, annualizedRoi: 0 };

  const startDate = project.value.signingDate 
    ? new Date(project.value.signingDate) 
    : new Date(); // Fallback
  
  const endDate = project.value.soldDate 
    ? new Date(project.value.soldDate) 
    : new Date();

  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;

  const totalInvestment = stats.value.expense;
  const netProfit = stats.value.net;
  
  let roi = 0;
  if (totalInvestment > 0) {
    roi = (netProfit / totalInvestment) * 100;
  }

  let annualizedRoi = 0;
  if (days > 0) {
    annualizedRoi = roi * (365 / days);
  }

  return { days, roi, annualizedRoi };
});

const currentCategories = computed(() => {
  const expenseCats = [
    CashFlowCategory.PERFORMANCE_BOND,
    CashFlowCategory.COMMISSION,
    CashFlowCategory.RENOVATION_COST,
    CashFlowCategory.MARKETING_COST,
    CashFlowCategory.OTHER_COST,
    CashFlowCategory.TAXES,
    CashFlowCategory.OPERATION_COST
  ];
  const incomeCats = [
    CashFlowCategory.PERFORMANCE_BOND_RETURN,
    CashFlowCategory.PREMIUM_INCOME,
    CashFlowCategory.SERVICE_FEE_INCOME,
    CashFlowCategory.OTHER_INCOME,
    CashFlowCategory.SELLING_INCOME
  ];
  return newRecord.value.type === CashFlowType.EXPENSE ? expenseCats : incomeCats;
});

const setRecordType = (type: CashFlowType) => {
  newRecord.value.type = type;
  newRecord.value.category = type === CashFlowType.EXPENSE ? CashFlowCategory.RENOVATION_COST : CashFlowCategory.PREMIUM_INCOME;
};

const handleAddRecord = async () => {
  if (!project.value || !newRecord.value.amount || !newRecord.value.category) return;
  
  try {
    const record: CashFlowRecord = {
      id: Date.now().toString(),
      projectId: props.projectId,
      type: newRecord.value.type!,
      category: newRecord.value.category!,
      amount: Number(newRecord.value.amount),
      date: newRecord.value.date!,
      description: newRecord.value.description || '',
    };

    await store.addCashFlow(record);
    
    showAddModal.value = false;
    // Reset form
    newRecord.value = {
      type: CashFlowType.EXPENSE,
      category: CashFlowCategory.RENOVATION_COST,
      amount: 0,
      date: new Date().toISOString().split('T')[0],
      description: '',
    };
  } catch (error) {
    alert('添加记录失败，请重试');
  }
};

const handleDeleteRecord = async (id: string) => {
  if (!window.confirm('确定要删除这条记录吗？')) return;
  try {
    await store.deleteCashFlow(id);
  } catch (error) {
    alert('删除失败，请重试');
  }
};
</script>
