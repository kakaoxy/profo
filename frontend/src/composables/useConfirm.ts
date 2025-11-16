import { ref } from 'vue'

export interface ConfirmOptions {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  type?: 'warning' | 'danger' | 'info'
}

interface ConfirmState extends ConfirmOptions {
  visible: boolean
  resolve?: (value: boolean) => void
}

const confirmState = ref<ConfirmState>({
  visible: false,
  title: '',
  message: '',
  confirmText: '确认',
  cancelText: '取消',
  type: 'warning'
})

export const useConfirm = () => {
  const showConfirm = (options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      confirmState.value = {
        ...options,
        visible: true,
        confirmText: options.confirmText || '确认',
        cancelText: options.cancelText || '取消',
        type: options.type || 'warning',
        resolve
      }
    })
  }
  
  const handleConfirm = () => {
    if (confirmState.value.resolve) {
      confirmState.value.resolve(true)
    }
    confirmState.value.visible = false
  }
  
  const handleCancel = () => {
    if (confirmState.value.resolve) {
      confirmState.value.resolve(false)
    }
    confirmState.value.visible = false
  }
  
  return {
    confirmState,
    showConfirm,
    handleConfirm,
    handleCancel
  }
}
