<template>
  <div class="space-y-6 px-4 relative min-h-screen">
    <!-- Loading State -->
    <div v-if="isLoading" class="absolute inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm">
      <div class="flex flex-col items-center">
        <div class="animate-spin rounded-full h-10 w-10 border-4 border-blue-600 border-t-transparent"></div>
        <p class="mt-4 text-slate-600 font-medium">加载签约数据...</p>
      </div>
    </div>

    <!-- Error State -->
    <div v-if="error" class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center justify-between animate-fade-in">
      <div class="flex items-center">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
        </svg>
        <span>{{ error }}</span>
      </div>
      <button @click="retryFetch" class="text-sm font-medium hover:text-red-800 underline">重试</button>
    </div>

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
            <input v-model="formData.community_name" type="text" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" placeholder="输入小区名称" />
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">签约人/负责人 <span class="text-red-500">*</span></label>
            <input v-model="formData.manager" type="text" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" placeholder="输入负责人姓名" />
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">签约价格 (万元) <span class="text-red-500">*</span></label>
            <div class="relative">
              <span class="absolute left-3 top-2 text-slate-400">¥</span>
              <input v-model.number="formData.signing_price" type="number" class="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" placeholder="0.00" />
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">签约日期</label>
            <input v-model="formData.signing_date" type="date" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
          </div>
           <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">签约周期 (天)</label>
            <input v-model.number="formData.signing_period" type="number" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" placeholder="30" />
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">计划交房时间</label>
            <input v-model="formData.planned_handover_date" type="date" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
          </div>
        </div>
      </div>

      <!-- Section 2: Property & Owner Info (Required) -->
      <div>
         <h3 class="text-lg font-bold text-slate-800 border-l-4 border-green-500 pl-3 mb-4">物业及业主信息 (必填)</h3>
         <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
           <div class="md:col-span-2">
              <label class="block text-sm font-medium text-slate-700 mb-1">物业地址 <span class="text-red-500">*</span></label>
              <input v-model="formData.address" type="text" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="详细地址" />
           </div>
           <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">产证面积 (m²)</label>
              <input v-model.number="formData.area" type="number" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
           </div>
           <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">业主姓名</label>
              <input v-model="formData.owner_name" type="text" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
           </div>
           <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">联系方式</label>
              <input v-model="formData.owner_phone" type="text" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
           </div>
           <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">身份证号</label>
              <input v-model="formData.owner_id_card" type="text" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" maxlength="18" />
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
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <h3 class="text-lg font-bold text-slate-800">必要签约材料 (必填)</h3>
        <PhotoUploadField label="合同照片" :photos="formData.contractPhotos || []" @add="(p) => addPhoto('contractPhotos', p)" @remove="(id) => removePhoto('contractPhotos', id)" required />
        <PhotoUploadField label="产证照片" :photos="formData.propertyDeedPhotos || []" @add="(p) => addPhoto('propertyDeedPhotos', p)" @remove="(id) => removePhoto('propertyDeedPhotos', id)" required />
        <PhotoUploadField label="产调照片" :photos="formData.propertySurveyPhotos || []" @add="(p) => addPhoto('propertySurveyPhotos', p)" @remove="(id) => removePhoto('propertySurveyPhotos', id)" required />
        <PhotoUploadField label="业主身份证" :photos="formData.idCardPhotos || []" @add="(p) => addPhoto('idCardPhotos', p)" @remove="(id) => removePhoto('idCardPhotos', id)" required />
        <PhotoUploadField label="业主银行卡" :photos="formData.bankCardPhotos || []" @add="(p) => addPhoto('bankCardPhotos', p)" @remove="(id) => removePhoto('bankCardPhotos', id)" required />
      </div>

      <!-- Section 4: Optional Materials -->
      <div class="border-t border-slate-100 pt-6">
        <h3 class="text-lg font-bold text-slate-800 mb-4">其他签约材料 (选填)</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
import { AxiosError } from 'axios';
import { updateProjectStatus } from '../../api/projects';

const props = defineProps<{
  projectId: string | null;
}>();

const emit = defineEmits<{
  (e: 'back'): void;
  (e: 'navigate', stage: string): void;
}>();

const store = useProjectManagementStore();

const isLoading = ref(false);
const error = ref<string | null>(null);

const formData = ref<Partial<Project>>({
  community_name: '',
  signing_price: 0,
  signing_period: 30,
  planned_handover_date: '',
  signing_date: new Date().toISOString().split('T')[0],
  manager: '',
  otherAgreements: '',
  remarks: '',
  
  // Extended fields
  address: '',
  owner_name: '',
  owner_phone: '',
  owner_id_card: '',
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

const loadProjectData = async (id: string) => {
  isLoading.value = true;
  error.value = null;
  try {
    const project = await store.fetchProject(id);
    if (project) {
      // Deep copy to avoid mutating store directly before save
      formData.value = JSON.parse(JSON.stringify(project));
      
      // Unpack signing_materials if exists
      if (project.signing_materials) {
        // Merge signing_materials into formData so photo fields are populated
        Object.assign(formData.value, project.signing_materials);
      }
    } else {
        error.value = '未找到该项目数据';
    }
  } catch (err) {
    console.error('Failed to load project:', err);
    if (err instanceof AxiosError) {
        if (err.response) {
            // Server responded with 4xx/5xx
            const status = err.response.status;
            if (status === 404) {
                error.value = '未找到该项目数据 (404)';
            } else if (status >= 500) {
                error.value = `服务器内部错误 (${status})，请联系管理员`;
            } else {
                error.value = `请求失败 (${status}): ${err.response.data?.detail || '未知错误'}`;
            }
        } else if (err.request) {
            // No response received (Network error)
            error.value = '网络连接失败，无法连接到服务器。请检查您的网络设置。';
        } else {
            error.value = `请求配置错误: ${err.message}`;
        }
        if (err.code === 'ECONNABORTED') {
            error.value = '请求超时，请稍后重试';
        }
    } else {
        error.value = '获取签约数据失败，请检查网络或联系管理员';
    }
  } finally {
    isLoading.value = false;
  }
};

const retryFetch = () => {
  if (props.projectId) {
    loadProjectData(props.projectId);
  }
};

// Load existing project data
watch(() => props.projectId, (newId) => {
  if (newId) {
    loadProjectData(newId);
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
  if (!formData.value.community_name || !formData.value.signing_price || !formData.value.manager || !formData.value.address) return false;
  // Check required photos
  if ((formData.value.contractPhotos?.length || 0) === 0) return false;
  if ((formData.value.propertyDeedPhotos?.length || 0) === 0) return false;
  if ((formData.value.propertySurveyPhotos?.length || 0) === 0) return false;
  if ((formData.value.idCardPhotos?.length || 0) === 0) return false;
  if ((formData.value.bankCardPhotos?.length || 0) === 0) return false;
  return true;
};

const packMaterials = () => {
    const photos: Record<string, PhotoRecord[]> = {};
    const photoFields = [
        'contractPhotos', 'propertyDeedPhotos', 'propertySurveyPhotos', 
        'idCardPhotos', 'bankCardPhotos', 'decorationContractPhotos',
        'houseHandoverPhotos', 'receiptPhotos', 'cooperationConfirmationPhotos',
        'storeInvestmentAgreementPhotos', 'valueAddedServiceConfirmationPhotos',
        'otherPhotos'
    ];
    
    photoFields.forEach(field => {
        const val = (formData.value as any)[field];
        if (val && val.length > 0) {
            photos[field] = val;
        }
    });
    return photos;
};

const handleSave = async () => {
  const payload = { ...formData.value };
  payload.signing_materials = packMaterials();

  if (props.projectId) {
    try {
        await store.updateProject(props.projectId, payload);
        alert('已保存');
    } catch (e) {
        console.error('Save failed', e);
        alert('保存失败，请重试');
    }
  } else {
    const newId = 'P' + Date.now();
    store.addProject({ 
        ...payload, 
        id: newId,
        status: 'signing',
        name: formData.value.community_name + ' ' + (formData.value.address || '')
    } as Project);
    alert('草稿已创建');
  }
};

const handleNext = async () => {
  if (!validate()) {
    alert('请填写所有必填项并上传必要照片');
    return;
  }

  const payload = { ...formData.value };
  payload.signing_materials = packMaterials();

  if (props.projectId) {
    // If already advanced (e.g. status is renovating/selling/sold), we keep it.
    // If not advanced (status is signing), we want to move to renovating.
    const shouldUpdateStatus = !isAlreadyAdvanced.value;
    
    try {
        // 1. Update project data (excluding status)
        await store.updateProject(props.projectId, {
          ...payload,
          // Note: Backend ignores status in updateProject, so we must call updateProjectStatus separately if needed
        });

        // 2. Update status if needed
        if (shouldUpdateStatus) {
             // Use direct API call to avoid potential store sync issues
             await updateProjectStatus(props.projectId, 'renovating');
             // Update local store manually
             const project = store.projects.find(p => p.id === props.projectId);
             if (project) {
                 project.status = 'renovating';
             }
        }
        
        emit('navigate', 'renovating');
    } catch (e) {
        console.error('Update failed', e);
        alert('提交失败，请重试');
    }
  } else {
    // New project
    const newId = 'P' + Date.now();
    store.addProject({
      ...payload,
      id: newId,
      status: 'renovating',
      name: formData.value.community_name + ' ' + (formData.value.address || ''),
      renovationStartDate: new Date().toISOString().split('T')[0]
    } as Project);
    
    emit('navigate', 'renovating');
  }
};

const handleCancel = () => {
  emit('back');
};
</script>
