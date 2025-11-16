import { onErrorCaptured, ref } from 'vue'
import { useToast } from './useToast'

export interface ErrorInfo {
  error: Error
  info: string
  timestamp: Date
}

export const useErrorBoundary = (componentName?: string) => {
  const { showErrorToast } = useToast()
  const hasError = ref(false)
  const errorInfo = ref<ErrorInfo | null>(null)

  onErrorCaptured((err: Error, instance, info: string) => {
    // Log error for debugging
    console.error(`[Error Boundary${componentName ? ` - ${componentName}` : ''}]:`, {
      error: err,
      info,
      component: instance?.$options.name || 'Unknown',
      timestamp: new Date()
    })

    // Store error info
    hasError.value = true
    errorInfo.value = {
      error: err,
      info,
      timestamp: new Date()
    }

    // Show user-friendly error message
    const message = componentName 
      ? `${componentName}加载失败，请刷新页面重试`
      : '组件加载失败，请刷新页面重试'
    
    showErrorToast(message)

    // Prevent error from propagating to parent components
    return false
  })

  const resetError = () => {
    hasError.value = false
    errorInfo.value = null
  }

  return {
    hasError,
    errorInfo,
    resetError
  }
}
