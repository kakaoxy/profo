<template>
  <div class="max-w-4xl mx-auto space-y-6 px-4">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-bold text-slate-800">改造施工阶段</h2>
        <p class="text-slate-500 text-sm mt-1" v-if="project">{{ project.community }} - {{ project.name }}</p>
      </div>
      <div class="flex space-x-3">
        <button @click="handleCancel" class="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">返回总览</button>
        <button @click="handleSave" class="px-4 py-2 flex items-center bg-white border border-blue-600 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-50">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
          </svg> 保存
        </button>
        <button @click="handleNextStage" class="px-4 py-2 flex items-center bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm">
           {{ currentStage === RenovationStage.DELIVER ? (isAlreadyAdvanced ? '下一步: 在售' : '完成改造') : '下一阶段' }} 
           <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </button>
      </div>
    </div>

    <div class="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
      <div class="mb-6">
        <label class="block text-sm font-medium text-slate-700 mb-2">当前施工阶段</label>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="stage in stages"
            :key="stage"
            @click="currentStage = stage"
            class="px-4 py-2 rounded-full text-sm font-medium transition-colors"
            :class="currentStage === stage ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'"
          >
            {{ stage }}
          </button>
        </div>
      </div>

      <div class="border-t border-slate-100 pt-6">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-4">
           <h3 class="text-lg font-medium text-slate-800 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-blue-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {{ currentStage }} - 进度记录
          </h3>
          <div class="flex items-center space-x-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
             <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
             </svg>
             <span class="text-sm text-slate-600">本阶段完成时间:</span>
             <input 
               type="date" 
               :value="getCurrentDateValue()" 
               @input="handleDateChange"
               class="bg-white border border-slate-300 rounded px-2 py-1 text-sm focus:ring-1 focus:ring-blue-500 outline-none"
             />
          </div>
        </div>
        
        <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
           <div v-for="photo in (photos[currentStage] || [])" :key="photo.id" class="relative group aspect-square bg-slate-100 rounded-lg overflow-hidden border border-slate-200 shadow-sm">
             <img :src="photo.url" :alt="currentStage" class="w-full h-full object-cover" />
             <button
               @click="removePhoto(photo.id)"
               class="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
             >
               <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
               </svg>
             </button>
           </div>
          <label class="flex flex-col items-center justify-center aspect-square border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-slate-50 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <span class="mt-2 text-xs text-slate-500">上传照片</span>
            <input type="file" accept="image/*" class="hidden" @change="handleFileChange" />
          </label>
        </div>
        
        <div class="mt-4 p-4 bg-blue-50 text-blue-800 rounded-lg text-sm">
          <p>提示：根据阶段不同，请上传相关照片（如设计阶段上传效果图、施工阶段上传现场图等）。默认完成时间为当天，如有变动请手动调整。</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useProjectManagementStore } from './store';
import { RenovationStage, type PhotoRecord } from './types';

const props = defineProps<{
  projectId: string;
}>();

const emit = defineEmits<{
  (e: 'back'): void;
  (e: 'navigate', stage: string): void;
}>();

const store = useProjectManagementStore();
const project = computed(() => store.projects.find(p => p.id === props.projectId));

const stages = Object.values(RenovationStage);
const currentStage = ref<RenovationStage>(project.value?.currentRenovationStage || RenovationStage.DEMOLITION);

const photos = ref<Record<RenovationStage, PhotoRecord[]>>({
  [RenovationStage.DEMOLITION]: [],
  [RenovationStage.DESIGN]: [],
  [RenovationStage.HYDRO]: [],
  [RenovationStage.WOOD]: [],
  [RenovationStage.PAINT]: [],
  [RenovationStage.INSTALL]: [],
  [RenovationStage.DELIVER]: [],
});

const stageDates = ref<Record<string, string>>({});

// Initialize data
watch(project, (newVal) => {
  if (newVal) {
    if (newVal.currentRenovationStage) {
      currentStage.value = newVal.currentRenovationStage;
    }
    if (newVal.renovationPhotos) {
      photos.value = { ...photos.value, ...newVal.renovationPhotos };
    }
    if (newVal.renovationStageDates) {
      stageDates.value = { ...newVal.renovationStageDates };
    }
  }
}, { immediate: true });

const isAlreadyAdvanced = computed(() => {
  if (!project.value) return false;
  const statusOrder = ['signing', 'renovating', 'selling', 'sold'];
  return statusOrder.indexOf(project.value.status) > statusOrder.indexOf('renovating');
});

const getCurrentDateValue = () => {
  return stageDates.value[currentStage.value] || new Date().toISOString().split('T')[0];
};

const handleDateChange = (e: Event) => {
  const input = e.target as HTMLInputElement;
  stageDates.value = {
    ...stageDates.value,
    [currentStage.value]: input.value
  };
};

const handleFileChange = (e: Event) => {
  const input = e.target as HTMLInputElement;
  if (input.files && input.files[0]) {
    const file = input.files[0];
    const reader = new FileReader();
    reader.onloadend = () => {
      const newPhoto: PhotoRecord = {
        id: Date.now().toString(),
        url: reader.result as string,
        category: currentStage.value,
        timestamp: Date.now()
      };
      
      if (!photos.value[currentStage.value]) {
        photos.value[currentStage.value] = [];
      }
      photos.value[currentStage.value].push(newPhoto);
    };
    reader.readAsDataURL(file);
  }
};

const removePhoto = (photoId: string) => {
  if (photos.value[currentStage.value]) {
    photos.value[currentStage.value] = photos.value[currentStage.value].filter(p => p.id !== photoId);
  }
};

const handleSave = () => {
  if (project.value) {
    const updatedDates = { ...stageDates.value, [currentStage.value]: getCurrentDateValue() };
    store.updateProject(project.value.id, {
      currentRenovationStage: currentStage.value,
      renovationPhotos: photos.value,
      renovationStageDates: updatedDates
    });
    stageDates.value = updatedDates;
    alert('阶段进度及时间已保存');
  }
};

const handleNextStage = () => {
  handleSave();
  const currentIndex = stages.indexOf(currentStage.value);

  if (currentIndex < stages.length - 1) {
    currentStage.value = stages[currentIndex + 1];
  } else {
    // Finished all stages
    if (isAlreadyAdvanced.value) {
      emit('navigate', 'selling');
    } else {
      if (confirm('确认所有改造阶段已完成，准备进入【在售】阶段？')) {
        if (project.value) {
          store.updateProject(project.value.id, {
            status: 'selling',
            renovationEndDate: new Date().toISOString().split('T')[0]
          });
          emit('navigate', 'selling');
        }
      }
    }
  }
};

const handleCancel = () => {
  emit('back');
};
</script>
