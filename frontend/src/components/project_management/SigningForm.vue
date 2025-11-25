<template>
  <div class="max-w-5xl mx-auto space-y-6 px-4">
    <div class="flex items-center justify-between sticky top-0 z-40 bg-slate-50/95 py-4 border-b border-slate-200 backdrop-blur-sm">
      <div>
        <h2 class="text-2xl font-bold text-slate-800">签约阶段</h2>
        <p class="text-slate-500 text-sm mt-1">录入签约基本信息及证件材料</p>
      </div>
      <div class="flex space-x-3">
        <button @click="handleCancel" class="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">返回总览</button>
        <button @click="handleSave" class="px-4 py-2 flex items-center bg-white border border-blue-600 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-50">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
          </svg> 保存
        </button>
        <button @click="handleNext" class="px-4 py-2 flex items-center bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm">
          {{ isAlreadyAdvanced ? '下一步: 改造' : '提交签约' }} 
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </button>
      </div>
    </div>

    <div class="bg-white rounded-xl shadow-sm border border-slate-100 p-6 space-y-8">
      
      <!-- Section 1: Basic Project Info (Required) -->
      <div>
         <h3 class="text-lg font-bold text-slate-800 border-l-4 border-blue-600 pl-3 mb-4">项目基础信息 (必填)</h3>
         <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">小区名称 <span class="text-red-500">*</span></label>
            <input v-model="formData.community" type="text" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" placeholder="输入小区名称" />
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">签约人/负责人 <span class="text-red-500">*</span></label>
            <input v-model="formData.manager" type="text" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" placeholder="输入负责人姓名" />
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">签约价格 (万元) <span class="text-red-500">*</span></label>
            <div class="relative">
              <span class="absolute left-3 top-2 text-slate-400">¥</span>
              <input v-model.number="formData.signingPrice" type="number" class="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" placeholder="0.00" />
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">签约日期</label>
            <input v-model="formData.signingDate" type="date" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
          </div>
           <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">签约周期 (天)</label>
            <input v-model.number="formData.signingPeriod" type="number" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" placeholder="30" />
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">计划交房时间</label>
            <input v-model="formData.plannedHandoverDate" type="date" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
          </div>
        </div>
      </div>

      <!-- Section 2: Property & Owner Info (Optional) -->
      <div>
         <h3 class="text-lg font-bold text-slate-800 border-l-4 border-green-500 pl-3 mb-4">物业及业主信息 (选填)</h3>
         <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
           <div class="md:col-span-2">
              <label class="block text-sm font-medium text-slate-700 mb-1">物业地址</label>
              <input v-model="formData.address" type="text" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="详细地址" />
           </div>
           <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">产证面积 (m²)</label>
              <input v-model.number="formData.area" type="number" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
           </div>
           <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">业主姓名</label>
              <input v-model="formData.ownerName" type="text" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
           </div>
           <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">联系方式</label>
              <input v-model="formData.ownerPhone" type="text" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
           </div>
           <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">身份证号</label>
              <input v-model="formData.ownerIdCard" type="text" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" maxlength="18" />
           </div>
           <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">顺延期 (月)</label>
              <input v-model.number="formData.extensionPeriod" type="number" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
           </div>
           <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">顺延期租金 (元/月)</label>
              <input v-model.number="formData.extensionRent" type="number" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
           </div>
           <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">税费及佣金承担</label>
              <select v-model="formData.costAssumption" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                <option value="不承担">不承担</option>
                <option value="溢价部分承担">溢价部分承担</option>
                <option value="全部承担">全部承担</option>
                <option value="其他">其他</option>
              </select>
           </div>
         </div>
         
         <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
           <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">其他约定</label>
              <textarea v-model="formData.otherAgreements" rows="3" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="如有其他约定事项请在此填写..." />
           </div>
           <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">备注</label>
              <textarea v-model="formData.remarks" rows="3" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="其他备注信息..." />
           </div>
         </div>
      </div>

      <!-- Section 3: Required Materials -->
      <div class="border-t border-slate-100 pt-6 space-y-4">
        <h3 class="text-lg font-bold text-slate-800">必要签约材料 (必填)</h3>
        <PhotoUploadField label="合同照片" :photos="formData.contractPhotos || []" @add="(p) => addPhoto('contractPhotos', p)" @remove="(id) => removePhoto('contractPhotos', id)" required />
        <PhotoUploadField label="产证照片" :photos="formData.propertyDeedPhotos || []" @add="(p) => addPhoto('propertyDeedPhotos', p)" @remove="(id) => removePhoto('propertyDeedPhotos', id)" required />
        <PhotoUploadField label="产调照片" :photos="formData.propertySurveyPhotos || []" @add="(p) => addPhoto('propertySurveyPhotos', p)" @remove="(id) => removePhoto('propertySurveyPhotos', id)" required />
        <PhotoUploadField label="业主身份证" :photos="formData.idCardPhotos || []" @add="(p) => addPhoto('idCardPhotos', p)" @remove="(id) => removePhoto('idCardPhotos', id)" required />
        <PhotoUploadField label="业主银行卡" :photos="formData.bankCardPhotos || []" @add="(p) => addPhoto('bankCardPhotos', p)" @remove="(id) => removePhoto('bankCardPhotos', id)" required />
      </div>

      <!-- Section 4: Optional Materials -->
      <div class="border-t border-slate-100 pt-6 space-y-4">
        <h3 class="text-lg font-bold text-slate-800">其他签约材料 (选填)</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
           <PhotoUploadField label="装修合同" :photos="formData.decorationContractPhotos || []" @add="(p) => addPhoto('decorationContractPhotos', p)" @remove="(id) => removePhoto('decorationContractPhotos', id)" />
           <PhotoUploadField label="房屋交接书" :photos="formData.houseHandoverPhotos || []" @add="(p) => addPhoto('houseHandoverPhotos', p)" @remove="(id) => removePhoto('houseHandoverPhotos', id)" />
           <PhotoUploadField label="收款收据" :photos="formData.receiptPhotos || []" @add="(p) => addPhoto('receiptPhotos', p)" @remove="(id) => removePhoto('receiptPhotos', id)" />
           <PhotoUploadField label="合作房源确认函" :photos="formData.cooperationConfirmationPhotos || []" @add="(p) => addPhoto('cooperationConfirmationPhotos', p)" @remove="(id) => removePhoto('cooperationConfirmationPhotos', id)" />
           <PhotoUploadField label="门店跟投协议书" :photos="formData.storeInvestmentAgreementPhotos || []" @add="(p) => addPhoto('storeInvestmentAgreementPhotos', p)" @remove="(id) => removePhoto('storeInvestmentAgreementPhotos', id)" />
           <PhotoUploadField label="增值服务确认书" :photos="formData.valueAddedServiceConfirmationPhotos || []" @add="(p) => addPhoto('valueAddedServiceConfirmationPhotos', p)" @remove="(id) => removePhoto('valueAddedServiceConfirmationPhotos', id)" />
           <PhotoUploadField label="其他材料" :photos="formData.otherPhotos || []" @add="(p) => addPhoto('otherPhotos', p)" @remove="(id) => removePhoto('otherPhotos', id)" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useProjectManagementStore } from './store';
import type { Project, PhotoRecord } from './types';
import PhotoUploadField from './PhotoUploadField.vue';

const props = defineProps<{
  projectId: string | null;
}>();

const emit = defineEmits<{
  (e: 'back'): void;
  (e: 'navigate', stage: string): void;
}>();

const store = useProjectManagementStore();

const formData = ref<Partial<Project>>({
  community: '',
  signingPrice: 0,
  signingPeriod: 30,
  plannedHandoverDate: '',
  signingDate: new Date().toISOString().split('T')[0],
  manager: '',
  otherAgreements: '',
  remarks: '',
  
  // Extended fields
  address: '',
  ownerName: '',
  ownerPhone: '',
  ownerIdCard: '',
  area: 0,
  extensionPeriod: 0,
  extensionRent: 0,
  costAssumption: '不承担',

  // Photos
  contractPhotos: [],
  propertyDeedPhotos: [],
  propertySurveyPhotos: [],
  idCardPhotos: [],
  bankCardPhotos: [],
  decorationContractPhotos: [],
  houseHandoverPhotos: [],
  receiptPhotos: [],
  cooperationConfirmationPhotos: [],
  storeInvestmentAgreementPhotos: [],
  valueAddedServiceConfirmationPhotos: [],
  otherPhotos: []
});

// Load existing project data
watch(() => props.projectId, (newId) => {
  if (newId) {
    const project = store.projects.find(p => p.id === newId);
    if (project) {
      formData.value = JSON.parse(JSON.stringify(project)); // Deep copy
    }
  }
}, { immediate: true });

const isAlreadyAdvanced = computed(() => {
  if (!props.projectId) return false;
  const project = store.projects.find(p => p.id === props.projectId);
  if (!project) return false;
  const statusOrder = ['signing', 'renovating', 'selling', 'sold'];
  return statusOrder.indexOf(project.status) > statusOrder.indexOf('signing');
});

const addPhoto = (field: keyof Project, photo: PhotoRecord) => {
  if (!formData.value[field]) {
    formData.value[field] = [] as any;
  }
  (formData.value[field] as PhotoRecord[]).push(photo);
};

const removePhoto = (field: keyof Project, photoId: string) => {
  if (formData.value[field]) {
    formData.value[field] = (formData.value[field] as PhotoRecord[]).filter(p => p.id !== photoId) as any;
  }
};

const validate = () => {
  if (!formData.value.community || !formData.value.signingPrice || !formData.value.manager) return false;
  // Check required photos
  if ((formData.value.contractPhotos?.length || 0) === 0) return false;
  if ((formData.value.propertyDeedPhotos?.length || 0) === 0) return false;
  if ((formData.value.propertySurveyPhotos?.length || 0) === 0) return false;
  if ((formData.value.idCardPhotos?.length || 0) === 0) return false;
  if ((formData.value.bankCardPhotos?.length || 0) === 0) return false;
  return true;
};

const handleSave = () => {
  if (props.projectId) {
    store.updateProject(props.projectId, formData.value);
    alert('已保存');
  } else {
    const newId = 'P' + Date.now();
    store.addProject({ 
        ...formData.value, 
        id: newId,
        status: 'signing',
        name: formData.value.community + ' ' + (formData.value.address || '')
    } as Project);
    alert('草稿已创建');
  }
};

const handleNext = () => {
  if (!validate()) {
    alert('请填写所有必填项并上传必要照片');
    return;
  }

  if (props.projectId) {
    const project = store.projects.find(p => p.id === props.projectId);
    const nextStatus = isAlreadyAdvanced.value ? project?.status : 'renovating';
    
    store.updateProject(props.projectId, {
      ...formData.value,
      status: nextStatus as any,
      renovationStartDate: isAlreadyAdvanced.value ? project?.renovationStartDate : new Date().toISOString().split('T')[0]
    });
    
    emit('navigate', 'renovating');
  } else {
    // New project
    const newId = 'P' + Date.now();
    store.addProject({
      ...formData.value,
      id: newId,
      status: 'renovating',
      name: formData.value.community + ' ' + (formData.value.address || ''),
      renovationStartDate: new Date().toISOString().split('T')[0]
    } as Project);
    
    alert('项目已创建并进入改造阶段');
    emit('back');
  }
};

const handleCancel = () => {
  emit('back');
};
</script>
