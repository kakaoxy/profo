<template>
  <div class="max-w-5xl mx-auto space-y-6 px-4">
    <div class="flex items-center justify-between sticky top-0 z-40 bg-slate-50/95 py-4 border-b border-slate-200 backdrop-blur-sm">
      <div>
        <h2 class="text-2xl font-bold text-slate-800">在售阶段</h2>
        <p class="text-slate-500 text-sm mt-1">管理渠道、带看及谈判记录</p>
      </div>
      <div class="flex space-x-3">
        <button @click="handleCancel" class="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">返回总览</button>
        <button @click="handleSave" class="px-4 py-2 flex items-center bg-white border border-blue-600 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-50">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
          </svg> 保存记录
        </button>
        <button 
          @click="handleSold" 
          class="px-4 py-2 flex items-center text-white rounded-lg text-sm font-medium shadow-sm transition-colors"
          :class="isAlreadyAdvanced ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'"
        >
          <template v-if="isAlreadyAdvanced">
            <span class="mr-2">查看简报</span> 
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </template>
          <template v-else>
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg> 确认成交
          </template>
        </button>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Roles Column -->
      <div class="lg:col-span-1 space-y-6">
        <div class="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
          <h3 class="text-lg font-bold text-slate-800 mb-4">核心角色分配</h3>
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">渠道负责人</label>
              <input 
                v-model="channelManager"
                type="text" 
                class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" 
                placeholder="姓名"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">讲房师</label>
              <input 
                v-model="presenter"
                type="text" 
                class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" 
                placeholder="姓名"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">联卖谈判</label>
              <input 
                v-model="negotiator"
                type="text" 
                class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" 
                placeholder="姓名"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Logs Column -->
      <div class="lg:col-span-2 space-y-6">
        
        <!-- Viewings -->
        <div class="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-lg font-bold text-slate-800">带看记录</h3>
            <button @click="addViewing" class="text-sm text-blue-600 hover:text-blue-700 flex items-center font-medium">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg> 添加
            </button>
          </div>
          <p v-if="viewings.length === 0" class="text-sm text-slate-400 text-center py-4">暂无带看记录</p>
          <div class="space-y-3">
            <div v-for="(v, idx) in viewings" :key="v.id" class="flex items-center gap-3 bg-slate-50 p-3 rounded-lg">
              <span class="text-xs text-slate-400 font-mono w-6 text-center">{{ idx + 1 }}</span>
              <div class="flex-1 grid grid-cols-2 gap-3">
                <div class="relative">
                  <svg xmlns="http://www.w3.org/2000/svg" class="absolute left-2 top-2 h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <input type="datetime-local" v-model="v.time" class="w-full pl-8 pr-2 py-1.5 text-sm border rounded bg-white" />
                </div>
                <div class="relative">
                   <svg xmlns="http://www.w3.org/2000/svg" class="absolute left-2 top-2 h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <input type="text" placeholder="带看人" v-model="v.person" class="w-full pl-8 pr-2 py-1.5 text-sm border rounded bg-white" />
                </div>
              </div>
              <button @click="viewings = viewings.filter(i => i.id !== v.id)" class="text-red-400 hover:text-red-600">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- Offers -->
        <div class="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-lg font-bold text-slate-800">出价记录</h3>
            <button @click="addOffer" class="text-sm text-blue-600 hover:text-blue-700 flex items-center font-medium">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg> 添加
            </button>
          </div>
          <p v-if="offers.length === 0" class="text-sm text-slate-400 text-center py-4">暂无出价记录</p>
          <div class="space-y-3">
            <div v-for="o in offers" :key="o.id" class="flex items-center gap-3 bg-slate-50 p-3 rounded-lg">
              <div class="flex-1 grid grid-cols-3 gap-3">
                 <input type="datetime-local" v-model="o.time" class="w-full px-2 py-1.5 text-sm border rounded bg-white" />
                  <input type="text" placeholder="出价客户" v-model="o.client" class="w-full px-2 py-1.5 text-sm border rounded bg-white" />
                   <div class="relative">
                   <span class="absolute left-2 top-1.5 text-slate-400 text-xs">¥</span>
                   <input type="number" placeholder="价格(万)" v-model.number="o.price" class="w-full pl-5 pr-2 py-1.5 text-sm border rounded bg-white" />
                  </div>
              </div>
              <button @click="offers = offers.filter(i => i.id !== o.id)" class="text-red-400 hover:text-red-600">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>
        
         <!-- Negotiations -->
        <div class="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-lg font-bold text-slate-800">面谈记录</h3>
            <button @click="addNegotiation" class="text-sm text-blue-600 hover:text-blue-700 flex items-center font-medium">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg> 添加
            </button>
          </div>
          <p v-if="negotiations.length === 0" class="text-sm text-slate-400 text-center py-4">暂无面谈记录</p>
           <div class="space-y-3">
            <div v-for="n in negotiations" :key="n.id" class="flex items-center gap-3 bg-slate-50 p-3 rounded-lg">
              <div class="flex-1 grid grid-cols-2 gap-3">
                <input type="datetime-local" v-model="n.time" class="w-full px-2 py-1.5 text-sm border rounded bg-white" />
                  <input type="text" placeholder="面谈人/详情" v-model="n.person" class="w-full px-2 py-1.5 text-sm border rounded bg-white" />
              </div>
              <button @click="negotiations = negotiations.filter(i => i.id !== n.id)" class="text-red-400 hover:text-red-600">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useProjectManagementStore } from './store';
import type { ViewingRecord, OfferRecord, NegotiationRecord } from './types';

const props = defineProps<{
  projectId: string;
}>();

const emit = defineEmits<{
  (e: 'back'): void;
  (e: 'navigate', stage: string): void;
}>();

const store = useProjectManagementStore();
const project = computed(() => store.projects.find(p => p.id === props.projectId));

const channelManager = ref('');
const presenter = ref('');
const negotiator = ref('');

const viewings = ref<ViewingRecord[]>([]);
const offers = ref<OfferRecord[]>([]);
const negotiations = ref<NegotiationRecord[]>([]);

watch(project, (newVal) => {
  if (newVal) {
    channelManager.value = newVal.channelManager || '';
    presenter.value = newVal.presenter || '';
    negotiator.value = newVal.negotiator || '';
    viewings.value = newVal.viewingRecords ? [...newVal.viewingRecords] : [];
    offers.value = newVal.offerRecords ? [...newVal.offerRecords] : [];
    negotiations.value = newVal.negotiationRecords ? [...newVal.negotiationRecords] : [];
  }
}, { immediate: true });

const isAlreadyAdvanced = computed(() => {
  if (!project.value) return false;
  const statusOrder = ['signing', 'renovating', 'selling', 'sold'];
  return statusOrder.indexOf(project.value.status) > statusOrder.indexOf('selling');
});

const handleSave = () => {
  if (project.value) {
    store.updateProject(project.value.id, {
      channelManager: channelManager.value,
      presenter: presenter.value,
      negotiator: negotiator.value,
      viewingRecords: viewings.value,
      offerRecords: offers.value,
      negotiationRecords: negotiations.value
    });
    alert('销售信息已保存');
  }
};

const handleSold = () => {
  if (isAlreadyAdvanced.value) {
    emit('navigate', 'sold');
    return;
  }

  const finalPrice = prompt("请输入最终成交价格(万元):");
  if (finalPrice && !isNaN(parseFloat(finalPrice))) {
    handleSave();
    if (project.value) {
      store.updateProject(project.value.id, {
        status: 'sold',
        soldPrice: parseFloat(finalPrice),
        soldDate: new Date().toISOString().split('T')[0]
      });
      emit('navigate', 'sold');
    }
  }
};

const handleCancel = () => {
  emit('back');
};

const addViewing = () => {
  const time = new Date().toISOString().slice(0, 16);
  viewings.value.push({ id: Date.now().toString(), time, person: '' });
};

const addOffer = () => {
  const time = new Date().toISOString().slice(0, 16);
  offers.value.push({ id: Date.now().toString(), time, client: '', price: 0 });
};

const addNegotiation = () => {
  const time = new Date().toISOString().slice(0, 16);
  negotiations.value.push({ id: Date.now().toString(), time, person: '' });
};
</script>
