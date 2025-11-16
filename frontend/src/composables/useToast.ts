import { ref } from 'vue'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: number
  message: string
  type: ToastType
}

const toasts = ref<Toast[]>([])
let toastId = 0

export const useToast = () => {
  const showToast = (message: string, type: ToastType = 'info', duration = 3000) => {
    const id = toastId++
    toasts.value.push({ id, message, type })
    
    setTimeout(() => {
      removeToast(id)
    }, duration)
  }
  
  const removeToast = (id: number) => {
    const index = toasts.value.findIndex((t: Toast) => t.id === id)
    if (index > -1) {
      toasts.value.splice(index, 1)
    }
  }
  
  const showSuccessToast = (message: string) => showToast(message, 'success')
  const showErrorToast = (message: string) => showToast(message, 'error')
  const showWarningToast = (message: string) => showToast(message, 'warning')
  const showInfoToast = (message: string) => showToast(message, 'info')
  
  return {
    toasts,
    showToast,
    showSuccessToast,
    showErrorToast,
    showWarningToast,
    showInfoToast,
    removeToast
  }
}
