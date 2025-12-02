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
            <input v-model="formData.community_name" type="text" :readonly="isAlreadyAdvanced" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" placeholder="输入小区名称" :class="isAlreadyAdvanced ? 'bg-slate-50 cursor-not-allowed' : ''" />
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">签约人/负责人 <span class="text-red-500">*</span></label>
            <input v-model="formData.manager" type="text" :readonly="isAlreadyAdvanced" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" placeholder="输入负责人姓名" :class="isAlreadyAdvanced ? 'bg-slate-50 cursor-not-allowed' : ''" />
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">签约价格 (万元) <span class="text-red-500">*</span></label>
            <div class="relative">
              <span class="absolute left-3 top-2 text-slate-400">¥</span>
              <input v-model.number="formData.signing_price" type="number" :readonly="isAlreadyAdvanced" class="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" placeholder="0.00" :class="isAlreadyAdvanced ? 'bg-slate-50 cursor-not-allowed' : ''" />
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">签约日期</label>
            <input 
              v-model="formData.signing_date" 
              type="date" 
              :readonly="isAlreadyAdvanced" 
              class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" 
              :class="[
                isAlreadyAdvanced ? 'bg-slate-50 cursor-not-allowed border-slate-300' : 'border-slate-300',
                errors.signing_date ? 'border-red-500' : ''
              ]" 
            />
            <p v-if="errors.signing_date" class="text-red-500 text-xs mt-1">{{ errors.signing_date }}</p>
          </div>
           <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">签约周期 (天)</label>
            <input v-model.number="formData.signing_period" type="number" :readonly="isAlreadyAdvanced" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" placeholder="30" :class="isAlreadyAdvanced ? 'bg-slate-50 cursor-not-allowed' : ''" />
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">计划交房时间</label>
            <input 
              v-model="formData.planned_handover_date" 
              type="date" 
              :readonly="isAlreadyAdvanced" 
              class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" 
              :class="[
                isAlreadyAdvanced ? 'bg-slate-50 cursor-not-allowed border-slate-300' : 'border-slate-300',
                errors.planned_handover_date ? 'border-red-500' : ''
              ]" 
            />
            <p v-if="errors.planned_handover_date" class="text-red-500 text-xs mt-1">{{ errors.planned_handover_date }}</p>
          </div>
        </div>
      </div>

      <!-- Section 2: Property & Owner Info (Required) -->
      <div>
         <h3 class="text-lg font-bold text-slate-800 border-l-4 border-green-500 pl-3 mb-4">物业及业主信息 (必填)</h3>
         <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
           <div class="md:col-span-2">
              <label class="block text-sm font-medium text-slate-700 mb-1">物业地址 <span class="text-red-500">*</span></label>
              <input v-model="formData.address" type="text" :readonly="isAlreadyAdvanced" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="详细地址" :class="isAlreadyAdvanced ? 'bg-slate-50 cursor-not-allowed' : ''" />
           </div>
           <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">产证面积 (m²)</label>
              <input v-model.number="formData.area" type="number" :readonly="isAlreadyAdvanced" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" :class="isAlreadyAdvanced ? 'bg-slate-50 cursor-not-allowed' : ''" />
           </div>
           <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">业主姓名</label>
              <input v-model="formData.owner_name" type="text" :readonly="isAlreadyAdvanced" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" :class="isAlreadyAdvanced ? 'bg-slate-50 cursor-not-allowed' : ''" />
           </div>
           <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">联系方式</label>
              <input v-model="formData.owner_phone" type="text" :readonly="isAlreadyAdvanced" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" :class="isAlreadyAdvanced ? 'bg-slate-50 cursor-not-allowed' : ''" />
           </div>
           <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">身份证号</label>
              <input v-model="formData.owner_id_card" type="text" :readonly="isAlreadyAdvanced" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" maxlength="18" :class="isAlreadyAdvanced ? 'bg-slate-50 cursor-not-allowed' : ''" />
           </div>
           <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">顺延期 (月)</label>
              <input v-model.number="formData.extensionPeriod" type="number" :readonly="isAlreadyAdvanced" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" :class="isAlreadyAdvanced ? 'bg-slate-50 cursor-not-allowed' : ''" />
           </div>
           <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">顺延期租金 (元/月)</label>
              <input v-model.number="formData.extensionRent" type="number" :readonly="isAlreadyAdvanced" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" :class="isAlreadyAdvanced ? 'bg-slate-50 cursor-not-allowed' : ''" />
           </div>
           <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">税费及佣金承担</label>
              <select v-model="formData.costAssumption" :disabled="isAlreadyAdvanced" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white" :class="isAlreadyAdvanced ? 'bg-slate-50 cursor-not-allowed' : ''">
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
              <textarea v-model="formData.otherAgreements" rows="3" :readonly="isAlreadyAdvanced" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="如有其他约定事项请在此填写..." :class="isAlreadyAdvanced ? 'bg-slate-50 cursor-not-allowed' : ''" />
           </div>
           <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">备注</label>
              <textarea v-model="formData.remarks" rows="3" :readonly="isAlreadyAdvanced" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="其他备注信息..." :class="isAlreadyAdvanced ? 'bg-slate-50 cursor-not-allowed' : ''" />
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
import { 
  formatDateToInput, 
  isValidDateFormat, 
  isDateInRange,
  getCurrentDate 
} from '../../utils/dateUtils';

const props = defineProps<{
  projectId: string | null;
}>();

const emit = defineEmits<{
  (e: 'back'): void;
  (e: 'navigate', stage: string): void;
  (e: 'create', projectId: string): void;
}>();

const store = useProjectManagementStore();

const isLoading = ref(false);
const error = ref<string | null>(null);

const formData = ref<Partial<Project>>({
  community_name: '',
  signing_price: 0,
  signing_period: 30,
  planned_handover_date: undefined,
  signing_date: new Date().toISOString().split('T')[0],
  manager: '',
  otherAgreements: '',
  remarks: '',
  
  // Extended fields
  address: '',
  owner_name: '',
  owner_phone: '',
  owner_id_card: '',
  owner_info: undefined,
  area: 0,
  extensionPeriod: 0,
  extensionRent: 0,
  costAssumption: '不承担',
  
  // Sales related fields
  channelManager: '',
  client_agent: '',
  first_viewer: '',
  list_price: 0,
  property_agent: '',
  presenter: '',
  negotiator: '',
  viewingRecords: [],
  offerRecords: [],
  negotiationRecords: [],
  
  // Sold related fields
  soldPrice: 0,
  soldDate: undefined,
  sale_price: 0,
  sold_at: undefined,
  
  // Renovation related fields
  renovation_stage: undefined,
  renovationStageDates: undefined,
  stage_completed_at: undefined,
  
  // Metadata fields
  notes: '',
  tags: [],

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

// Error state for form validation
const errors = ref<Record<string, string>>({});

// Validate date fields in real-time
const validateDateField = (field: string, value: string | null | undefined) => {
  if (!value || value === '') {
    delete errors.value[field];
    return true;
  }
  
  if (!isValidDateFormat(value)) {
    errors.value[field] = '日期格式不正确，请使用yyyy-MM-dd格式';
    return false;
  }
  
  if (!isDateInRange(value, '1900-01-01', getCurrentDate())) {
    errors.value[field] = '日期超出有效范围';
    return false;
  }
  
  delete errors.value[field];
  return true;
};

// Watch date fields for real-time validation
watch(() => formData.value.signing_date, (newValue) => {
  validateDateField('signing_date', newValue);
});

watch(() => formData.value.planned_handover_date, (newValue) => {
  validateDateField('planned_handover_date', newValue);
});

const loadProjectData = async (id: string) => {
  isLoading.value = true;
  error.value = null;
  try {
    const project = await store.fetchProject(id);
    if (project) {
      // Deep copy to avoid mutating store directly before save
      formData.value = JSON.parse(JSON.stringify(project));
      
      // Format date fields to yyyy-MM-dd format for input elements using utility function
      const dateFields = ['signing_date', 'planned_handover_date'] as const;
      dateFields.forEach(field => {
        if (formData.value[field]) {
          formData.value[field] = formatDateToInput(formData.value[field] as string);
        }
      });
      
      // Unpack signing_materials if exists, but only for photo fields
      if (project.signing_materials) {
        // Only merge photo fields from signing_materials, not other fields
        const photoFields = [
          'contractPhotos', 'propertyDeedPhotos', 'propertySurveyPhotos', 
          'idCardPhotos', 'bankCardPhotos', 'decorationContractPhotos',
          'houseHandoverPhotos', 'receiptPhotos', 'cooperationConfirmationPhotos',
          'storeInvestmentAgreementPhotos', 'valueAddedServiceConfirmationPhotos',
          'otherPhotos'
        ] as const;
        
        // Merge only photo fields
        photoFields.forEach(field => {
          const signingMaterials = project.signing_materials as Record<string, any>;
          if (signingMaterials[field]) {
            (formData.value as any)[field] = signingMaterials[field];
          }
        });
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

// 移除签约阶段的修改限制，允许在任何阶段补充和修改签约信息
const isAlreadyAdvanced = computed(() => false);

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
  let isValid = true;
  
  // Basic required fields validation
  if (!formData.value.community_name || !formData.value.signing_price || !formData.value.manager || !formData.value.address) {
    isValid = false;
  }
  
  // Date fields validation
  if (!validateDateField('signing_date', formData.value.signing_date)) {
    isValid = false;
  }
  
  if (formData.value.planned_handover_date) {
    if (!validateDateField('planned_handover_date', formData.value.planned_handover_date)) {
      isValid = false;
    }
    // Additional validation: planned_handover_date should be after or equal to signing_date
    if (formData.value.signing_date && formData.value.planned_handover_date) {
      const signingDate = new Date(formData.value.signing_date);
      const handoverDate = new Date(formData.value.planned_handover_date);
      if (handoverDate < signingDate) {
        errors.value.planned_handover_date = '计划交房时间不能早于签约日期';
        isValid = false;
      }
    }
  }
  
  // Check required photos
  if ((formData.value.contractPhotos?.length || 0) === 0) isValid = false;
  if ((formData.value.propertyDeedPhotos?.length || 0) === 0) isValid = false;
  if ((formData.value.propertySurveyPhotos?.length || 0) === 0) isValid = false;
  if ((formData.value.idCardPhotos?.length || 0) === 0) isValid = false;
  if ((formData.value.bankCardPhotos?.length || 0) === 0) isValid = false;
  
  return isValid;
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
  // 构造payload，过滤掉无效的日期字段和冗余的照片字段
  const payload = { ...formData.value };
  
  // 移除照片字段，因为它们会被打包到signing_materials中，避免数据冗余
  const photoFields = [
    'contractPhotos', 'propertyDeedPhotos', 'propertySurveyPhotos', 
    'idCardPhotos', 'bankCardPhotos', 'decorationContractPhotos',
    'houseHandoverPhotos', 'receiptPhotos', 'cooperationConfirmationPhotos',
    'storeInvestmentAgreementPhotos', 'valueAddedServiceConfirmationPhotos',
    'otherPhotos'
  ] as const;
  
  photoFields.forEach(field => {
    delete (payload as any)[field];
  });
  
  // 过滤掉空的或无效的字段
  const filteredPayload: Partial<Project> = {};
  for (const [key, value] of Object.entries(payload)) {
    // 过滤掉空字符串、空数组、null值，但保留0值
    if (value !== '' && value !== null && !(Array.isArray(value) && value.length === 0) && value !== undefined) {
      (filteredPayload as any)[key] = value;
    }
  }
  
  // 打包照片字段到signing_materials中
  filteredPayload.signing_materials = packMaterials();

  if (props.projectId) {
    try {
        await store.updateProject(props.projectId, filteredPayload);
        alert('已保存');
    } catch (e) {
        console.error('Save failed', e);
        alert('保存失败，请重试');
    }
  } else {
    try {
        const newProject = await store.addProject({
            ...filteredPayload,
            status: 'signing',
            name: formData.value.community_name + ' ' + (formData.value.address || '')
        } as Project);
        emit('create', newProject.id);
        alert('草稿已创建');
    } catch (e) {
        console.error('Save failed', e);
        alert('保存失败，请重试');
    }
  }
};

const handleNext = async () => {
  if (!validate()) {
    alert('请填写所有必填项并上传必要照片');
    return;
  }

  // 构造payload，过滤掉无效的日期字段和冗余的照片字段
  const payload = { ...formData.value };
  
  // 移除照片字段，因为它们会被打包到signing_materials中，避免数据冗余
  const photoFields = [
    'contractPhotos', 'propertyDeedPhotos', 'propertySurveyPhotos', 
    'idCardPhotos', 'bankCardPhotos', 'decorationContractPhotos',
    'houseHandoverPhotos', 'receiptPhotos', 'cooperationConfirmationPhotos',
    'storeInvestmentAgreementPhotos', 'valueAddedServiceConfirmationPhotos',
    'otherPhotos'
  ];
  
  const payloadAny = payload as any;
  photoFields.forEach(field => {
    delete payloadAny[field];
  });
  
  // 过滤掉空的或无效的字段
  const filteredPayload: Partial<Project> = {};
  const filteredPayloadAny = filteredPayload as any;
  for (const [key, value] of Object.entries(payload)) {
    // 过滤掉空字符串、空数组、null值，但保留0值
    if (value !== '' && value !== null && !(Array.isArray(value) && value.length === 0) && value !== undefined) {
      filteredPayloadAny[key] = value;
    }
  }
  
  // 打包照片字段到signing_materials中
  filteredPayload.signing_materials = packMaterials();

  if (props.projectId) {
    try {
        const project = store.projects.find(p => p.id === props.projectId);
        
        // 1. Update project data (excluding status)
        await store.updateProject(props.projectId, {
          ...filteredPayload,
          // Note: Backend ignores status in updateProject, so we must call updateProjectStatus separately if needed
        });

        // 2. Update status only if current status is signing
        if (project && project.status === 'signing') {
             // Use direct API call to avoid potential store sync issues
             await updateProjectStatus(props.projectId, 'renovating');
             // Update local store manually
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
    try {
        const newProject = await store.addProject({
          ...filteredPayload,
          status: 'renovating',
          name: formData.value.community_name + ' ' + (formData.value.address || ''),
          renovationStartDate: new Date().toISOString().split('T')[0]
        } as Project);
        emit('create', newProject.id);
        emit('navigate', 'renovating');
    } catch (e) {
        console.error('Update failed', e);
        alert('提交失败，请重试');
    }
  }
};

const handleCancel = () => {
  emit('back');
};
</script>
