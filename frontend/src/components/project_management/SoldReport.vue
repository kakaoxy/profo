<template>
  <div class="space-y-6 px-4">
    <div class="bg-white rounded-xl shadow-lg border border-green-100 overflow-hidden">
      <div class="bg-green-600 px-6 py-4 flex items-center justify-between text-white">
        <div class="flex items-center">
           <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
           </svg>
           <h2 class="text-xl font-bold">销售简报生成</h2>
        </div>
        <button @click="$emit('back')" class="text-green-100 hover:text-white">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="p-8 space-y-8">
        <div class="bg-slate-50 p-6 rounded-lg border border-slate-200">
           <h3 class="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">项目关键数据</h3>
           <div class="grid grid-cols-2 md:grid-cols-4 gap-6">
             <div>
               <p class="text-xs text-slate-400">签约价</p>
               <p class="text-xl font-bold text-slate-800">{{ project?.signing_price }}<span class="text-sm font-normal">万</span></p>
             </div>
             <div>
               <p class="text-xs text-slate-400">成交价</p>
               <p class="text-xl font-bold text-green-600">{{ project?.soldPrice }}<span class="text-sm font-normal">万</span></p>
             </div>
              <div>
               <p class="text-xs text-slate-400">装修周期</p>
               <p class="text-xl font-bold text-slate-800">{{ renovationCycle }}<span class="text-sm font-normal">天</span></p>
             </div>
              <div>
               <p class="text-xs text-slate-400">销售周期</p>
               <p class="text-xl font-bold text-slate-800">{{ salesCycle }}<span class="text-sm font-normal">天</span></p>
             </div>
          </div>
       </div>

       <div>
          <h3 class="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">生成简报内容</h3>
          <textarea 
            readonly 
            class="w-full h-48 p-4 border border-slate-300 rounded-lg text-slate-700 bg-white focus:ring-2 focus:ring-green-500 focus:border-transparent font-mono text-sm leading-relaxed"
            :value="reportText"
          />
       </div>

        <div class="flex justify-end space-x-4">
           <button @click="handlePrint" class="flex items-center px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors">
             <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
             </svg> 打印
           </button>
           <button @click="handleExportPDF" class="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors shadow-sm">
             <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
             </svg> 导出PDF
           </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useProjectManagementStore } from './store';

const props = defineProps<{
  projectId: string;
}>();



const store = useProjectManagementStore();
const project = computed(() => store.projects.find(p => p.id === props.projectId));

const calculateDays = (start?: string, end?: string) => {
  if (!start || !end) return 0;
  const diff = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(0, Math.floor(diff / (1000 * 3600 * 24)));
};

const renovationCycle = computed(() => calculateDays(project.value?.signing_date, project.value?.renovationEndDate));
const salesCycle = computed(() => calculateDays(project.value?.renovationEndDate, project.value?.soldDate));
const totalCycle = computed(() => calculateDays(project.value?.signing_date, project.value?.soldDate));

const reportText = computed(() => {
  if (!project.value) return '';
  return `${project.value.community_name}项目（签约价：${project.value.signing_price}万，成交价：${project.value.soldPrice}万）` +
  `由${project.value.manager}全程负责。` +
  `\n\n核心团队：\n- 渠道对接：${project.value.channelManager || '未录入'}\n- 讲房讲解：${project.value.presenter || '未录入'}\n- 谈判签约：${project.value.negotiator || '未录入'}` +
  `\n\n周期统计：\n- 装修周期：${renovationCycle.value}天` +
  `\n- 销售周期：${salesCycle.value}天` +
  `\n- 总周期：${totalCycle.value}天`;
});

const handlePrint = () => {
  window.print();
};

const handleExportPDF = () => {
  alert('PDF已下载 (Mock)');
};
</script>
