<template>
  <div class="space-y-1.5">
    <label class="block text-sm font-medium text-slate-700">
      {{ label }} <span v-if="required" class="text-red-500">*</span>
    </label>
    <div class="grid grid-cols-4 gap-2">
      <div v-for="photo in photos" :key="photo.id" class="relative group aspect-square bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
        <img :src="photo.url" :alt="label" class="w-full h-full object-cover" />
        <button
          @click="$emit('remove', photo.id)"
          class="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <label class="flex flex-col items-center justify-center aspect-square border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-slate-50 transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        <span class="mt-1 text-xs text-slate-500">上传</span>
        <input type="file" accept="image/*" class="hidden" @change="handleFileChange" />
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PhotoRecord } from './types';

const props = defineProps<{
  label: string;
  photos: PhotoRecord[];
  required?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:photos', photos: PhotoRecord[]): void;
  (e: 'remove', id: string): void;
  (e: 'add', photo: PhotoRecord): void;
}>();

const handleFileChange = (e: Event) => {
  const input = e.target as HTMLInputElement;
  if (input.files && input.files[0]) {
    const file = input.files[0];
    const reader = new FileReader();
    reader.onloadend = () => {
      const newPhoto: PhotoRecord = {
        id: Date.now().toString(),
        url: reader.result as string,
        category: props.label,
        timestamp: Date.now()
      };
      emit('add', newPhoto);
    };
    reader.readAsDataURL(file);
  }
};
</script>
