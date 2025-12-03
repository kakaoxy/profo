<template>
  <div class="project-detail h-full flex flex-col">
    <!-- Stage Navigation -->
    <div class="w-full bg-white border-b border-slate-200 mb-6">
      <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <nav aria-label="Progress">
          <ol role="list" class="flex items-center">
            <li v-for="(step, index) in steps" :key="step.id" :class="index !== steps.length - 1 ? 'flex-1' : ''" class="relative">
              <div 
                :class="[
                  'group flex items-center',
                  step.isClickable ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
                ]"
                @click="step.isClickable && handleStepClick(step.id)"
              >
                <span class="flex items-center px-6 py-4 text-sm font-medium">
                  <span 
                    :class="[
                      'flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full border-2 transition-colors mr-4',
                      step.isCurrent ? 'border-blue-600 bg-blue-600 text-white' :
                      step.isCompleted ? 'border-green-500 bg-green-500 text-white' :
                      'border-slate-300 text-slate-500'
                    ]"
                  >
                    <!-- Checkmark for completed -->
                    <svg v-if="step.isCompleted" class="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" />
                    </svg>
                    <!-- Number for current/future -->
                    <span v-else>{{ index + 1 }}</span>
                  </span>
                  <span 
                    :class="[
                      'text-sm font-bold tracking-wide',
                      step.isCurrent ? 'text-blue-600' :
                      step.isCompleted ? 'text-slate-800' :
                      'text-slate-500'
                    ]"
                  >
                    {{ step.name }}
                  </span>
                </span>
              </div>
              
              <!-- Connector arrow for non-last items -->
              <div v-if="index !== steps.length - 1" class="hidden md:block absolute top-0 right-0 h-full w-5" aria-hidden="true">
                <svg
                  class="h-full w-full text-slate-200"
                  viewBox="0 0 22 80"
                  fill="none"
                  preserveAspectRatio="none"
                >
                  <path
                    d="M0 -2L20 40L0 82"
                    vector-effect="non-scaling-stroke"
                    stroke="currentcolor"
                    stroke-linejoin="round"
                  />
                </svg>
              </div>
            </li>
          </ol>
        </nav>
      </div>
    </div>

    <!-- Content Area -->
    <div class="flex-1 overflow-y-auto py-8 bg-gray-50">
      <component 
        :is="currentStepComponent" 
        :projectId="projectId" 
        @back="$emit('back')"
        @navigate="handleNavigate"
        @create="(id: string) => $emit('create', id)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useProjectManagementStore } from './store';
import type { ProjectStatus } from './types';
import SigningForm from './SigningForm.vue';
import RenovationForm from './RenovationForm.vue';
import SellingForm from './SellingForm.vue';
import SoldReport from './SoldReport.vue';

const props = defineProps<{
  projectId: string | null;
}>();



const store = useProjectManagementStore();
const project = computed(() => props.projectId ? store.projects.find(p => p.id === props.projectId) : null);

const activeStage = ref<ProjectStatus>('signing');

// Initialize active stage based on project status - only when project changes, not when activeStage changes
watch(project, (newVal, oldVal) => {
  // Only update activeStage if this is a new project (oldVal is undefined) or project has been replaced
  if (newVal && (!oldVal || newVal.id !== oldVal.id)) {
    activeStage.value = newVal.status;
  } else if (!newVal) {
    activeStage.value = 'signing';
  }
}, { immediate: true });

const steps = computed(() => {
  const statusOrder = ['signing', 'renovating', 'selling', 'sold'];
  const currentStatusIndex = project.value ? statusOrder.indexOf(project.value.status) : 0;
  const activeStageIndex = statusOrder.indexOf(activeStage.value);

  return [
    { 
      id: 'signing', 
      name: '签约',
      isCompleted: 0 < currentStatusIndex && 0 !== activeStageIndex,
      isCurrent: 0 === activeStageIndex,
      isClickable: 0 <= currentStatusIndex
    },
    { 
      id: 'renovating', 
      name: '改造',
      isCompleted: 1 < currentStatusIndex && 1 !== activeStageIndex,
      isCurrent: 1 === activeStageIndex,
      isClickable: 1 <= currentStatusIndex
    },
    { 
      id: 'selling', 
      name: '在售',
      isCompleted: 2 < currentStatusIndex && 2 !== activeStageIndex,
      isCurrent: 2 === activeStageIndex,
      // Allow clicking selling stage when current status is sold (for direct transition)
      isClickable: 2 <= currentStatusIndex || project.value?.status === 'sold'
    },
    { 
      id: 'sold', 
      name: '已售',
      isCompleted: false, // Last stage is never "completed" in the visual sense
      isCurrent: 3 === activeStageIndex,
      // Allow clicking sold stage when current status is selling (for direct transition)
      isClickable: 3 <= currentStatusIndex || project.value?.status === 'selling'
    },
  ];
});



const currentStepComponent = computed(() => {
  switch (activeStage.value) {
    case 'signing': return SigningForm;
    case 'renovating': return RenovationForm;
    case 'selling': return SellingForm;
    case 'sold': return SoldReport;
    default: return SigningForm;
  }
});

const handleStepClick = (stepId: string) => {
  // Allow navigation to any step <= current project status
  // Allow direct transition between selling and sold stages
  const statusOrder = ['signing', 'renovating', 'selling', 'sold'];
  const projectStatusIndex = project.value ? statusOrder.indexOf(project.value.status) : 0;
  const stepIndex = statusOrder.indexOf(stepId);

  // Special rule: allow direct transition between selling and sold stages
  const isDirectSellToSold = project.value?.status === 'selling' && stepId === 'sold';
  const isDirectSoldToSell = project.value?.status === 'sold' && stepId === 'selling';
  
  if (stepIndex <= projectStatusIndex || isDirectSellToSold || isDirectSoldToSell) {
    activeStage.value = stepId as ProjectStatus;
  }
};

const handleNavigate = (stage: ProjectStatus) => {
  activeStage.value = stage;
};
</script>
