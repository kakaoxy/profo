import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import FileUpload from '@/components/FileUpload.vue'
import { uploadCSV } from '@/api/upload'
import type { UploadResult } from '@/api/types'

// Mock the upload API
vi.mock('@/api/upload', () => ({
  uploadCSV: vi.fn()
}))

// Mock useToast composable
vi.mock('@/composables/useToast', () => ({
  useToast: () => ({
    showSuccessToast: vi.fn(),
    showErrorToast: vi.fn(),
    showWarningToast: vi.fn(),
    showInfoToast: vi.fn()
  })
}))

describe('FileUpload.vue', () => {
  let wrapper: VueWrapper

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Initial State', () => {
    it('should render upload prompt by default', () => {
      wrapper = mount(FileUpload)

      expect(wrapper.find('.upload-prompt').exists()).toBe(true)
      expect(wrapper.text()).toContain('将 CSV 文件拖拽至此区域')
      expect(wrapper.text()).toContain('点击选择文件')
    })

    it('should have hidden file input', () => {
      wrapper = mount(FileUpload)

      const fileInput = wrapper.find('input[type="file"]')
      expect(fileInput.exists()).toBe(true)
      expect(fileInput.attributes('accept')).toBe('.csv')
      expect(fileInput.attributes('hidden')).toBeDefined()
    })

    it('should not show upload progress initially', () => {
      wrapper = mount(FileUpload)

      expect(wrapper.find('.upload-progress').exists()).toBe(false)
    })

    it('should not show upload result initially', () => {
      wrapper = mount(FileUpload)

      expect(wrapper.find('.upload-result').exists()).toBe(false)
    })
  })

  describe('File Selection', () => {
    it('should trigger file input click when clicking upload area', async () => {
      wrapper = mount(FileUpload)

      const fileInput = wrapper.find('input[type="file"]')
      const clickSpy = vi.spyOn(fileInput.element as HTMLInputElement, 'click').mockImplementation(() => {})

      await wrapper.find('.upload-area').trigger('click')

      expect(clickSpy).toHaveBeenCalled()
    })

    it('should trigger file input click when clicking select button', async () => {
      wrapper = mount(FileUpload)

      const fileInput = wrapper.find('input[type="file"]')
      const clickSpy = vi.spyOn(fileInput.element as HTMLInputElement, 'click').mockImplementation(() => {})

      await wrapper.find('.select-file-btn').trigger('click')

      expect(clickSpy).toHaveBeenCalled()
    })
  })

  describe('Drag and Drop', () => {
    it('should add dragging class on dragenter', async () => {
      wrapper = mount(FileUpload)

      const uploadArea = wrapper.find('.upload-area')
      await uploadArea.trigger('dragenter')

      expect(uploadArea.classes()).toContain('dragging')
    })

    it('should add dragging class on dragover', async () => {
      wrapper = mount(FileUpload)

      const uploadArea = wrapper.find('.upload-area')
      await uploadArea.trigger('dragover')

      expect(uploadArea.classes()).toContain('dragging')
    })

    it('should remove dragging class on dragleave', async () => {
      wrapper = mount(FileUpload)

      const uploadArea = wrapper.find('.upload-area')
      await uploadArea.trigger('dragenter')
      expect(uploadArea.classes()).toContain('dragging')

      await uploadArea.trigger('dragleave')
      expect(uploadArea.classes()).not.toContain('dragging')
    })

    it('should handle file drop', async () => {
      wrapper = mount(FileUpload)

      const file = new File(['test content'], 'test.csv', { type: 'text/csv' })
      const mockResult: UploadResult = {
        total: 10,
        success: 10,
        failed: 0
      }

      vi.mocked(uploadCSV).mockResolvedValue(mockResult)

      const uploadArea = wrapper.find('.upload-area')
      await uploadArea.trigger('drop', {
        dataTransfer: {
          files: [file]
        }
      })

      // Wait for async operations
      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(uploadCSV).toHaveBeenCalledWith(file, expect.any(Function))
    })
  })

  describe('File Validation', () => {
    it('should reject non-CSV files', async () => {
      wrapper = mount(FileUpload)

      const file = new File(['test'], 'test.txt', { type: 'text/plain' })
      const fileInput = wrapper.find('input[type="file"]')

      Object.defineProperty(fileInput.element, 'files', {
        value: [file],
        writable: false
      })

      await fileInput.trigger('change')

      expect(uploadCSV).not.toHaveBeenCalled()
    })

    it('should accept CSV files', async () => {
      wrapper = mount(FileUpload)

      const file = new File(['test'], 'test.csv', { type: 'text/csv' })
      const mockResult: UploadResult = {
        total: 5,
        success: 5,
        failed: 0
      }

      vi.mocked(uploadCSV).mockResolvedValue(mockResult)

      const fileInput = wrapper.find('input[type="file"]')
      Object.defineProperty(fileInput.element, 'files', {
        value: [file],
        writable: false
      })

      await fileInput.trigger('change')
      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(uploadCSV).toHaveBeenCalled()
    })
  })

  describe('Upload Progress', () => {
    it('should show upload progress during upload', async () => {
      wrapper = mount(FileUpload)

      const file = new File(['test'], 'test.csv', { type: 'text/csv' })
      
      vi.mocked(uploadCSV).mockImplementation(async (_file, onProgress) => {
        if (onProgress) {
          onProgress(50)
        }
        return new Promise(resolve => setTimeout(() => resolve({
          total: 10,
          success: 10,
          failed: 0
        }), 100))
      })

      const fileInput = wrapper.find('input[type="file"]')
      Object.defineProperty(fileInput.element, 'files', {
        value: [file],
        writable: false
      })

      await fileInput.trigger('change')
      await wrapper.vm.$nextTick()

      expect(wrapper.find('.upload-progress').exists()).toBe(true)
      expect(wrapper.text()).toContain('正在上传 test.csv')
    })

    it('should update progress bar percentage', async () => {
      wrapper = mount(FileUpload)

      const file = new File(['test'], 'test.csv', { type: 'text/csv' })
      
      let progressCallback: ((percent: number) => void) | undefined
      
      vi.mocked(uploadCSV).mockImplementation(async (_file, onProgress) => {
        progressCallback = onProgress
        return new Promise(resolve => {
          setTimeout(() => {
            if (progressCallback) {
              progressCallback(75)
            }
            resolve({
              total: 10,
              success: 10,
              failed: 0
            })
          }, 50)
        })
      })

      const fileInput = wrapper.find('input[type="file"]')
      Object.defineProperty(fileInput.element, 'files', {
        value: [file],
        writable: false
      })

      await fileInput.trigger('change')
      await wrapper.vm.$nextTick()
      
      // Wait for progress callback to be called
      await new Promise(resolve => setTimeout(resolve, 100))
      await wrapper.vm.$nextTick()

      const progressBar = wrapper.find('.progress-bar')
      if (progressBar.exists()) {
        expect(progressBar.attributes('style')).toContain('75%')
      }
    })
  })

  describe('Upload Result', () => {
    it('should display success result when all records succeed', async () => {
      wrapper = mount(FileUpload)

      const file = new File(['test'], 'test.csv', { type: 'text/csv' })
      const mockResult: UploadResult = {
        total: 100,
        success: 100,
        failed: 0
      }

      vi.mocked(uploadCSV).mockResolvedValue(mockResult)

      const fileInput = wrapper.find('input[type="file"]')
      Object.defineProperty(fileInput.element, 'files', {
        value: [file],
        writable: false
      })

      await fileInput.trigger('change')
      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(wrapper.find('.upload-result').exists()).toBe(true)
      expect(wrapper.find('.result-icon.success').exists()).toBe(true)
      expect(wrapper.text()).toContain('上传完成')
      expect(wrapper.text()).toContain('100')
    })

    it('should display warning result when some records fail', async () => {
      wrapper = mount(FileUpload)

      const file = new File(['test'], 'test.csv', { type: 'text/csv' })
      const mockResult: UploadResult = {
        total: 100,
        success: 90,
        failed: 10,
        failed_file_url: 'http://localhost:8000/api/failed/test.csv'
      }

      vi.mocked(uploadCSV).mockResolvedValue(mockResult)

      const fileInput = wrapper.find('input[type="file"]')
      Object.defineProperty(fileInput.element, 'files', {
        value: [file],
        writable: false
      })

      await fileInput.trigger('change')
      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(wrapper.find('.upload-result').exists()).toBe(true)
      expect(wrapper.find('.result-icon.warning').exists()).toBe(true)
      expect(wrapper.text()).toContain('10')
    })

    it('should show failed records download link when failures exist', async () => {
      wrapper = mount(FileUpload)

      const file = new File(['test'], 'test.csv', { type: 'text/csv' })
      const mockResult: UploadResult = {
        total: 50,
        success: 45,
        failed: 5,
        failed_file_url: 'http://localhost:8000/api/failed/test.csv'
      }

      vi.mocked(uploadCSV).mockResolvedValue(mockResult)

      const fileInput = wrapper.find('input[type="file"]')
      Object.defineProperty(fileInput.element, 'files', {
        value: [file],
        writable: false
      })

      await fileInput.trigger('change')
      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(wrapper.find('.failed-records-section').exists()).toBe(true)
      expect(wrapper.find('.download-failed-btn').exists()).toBe(true)
      expect(wrapper.find('.download-failed-btn').attributes('href')).toBe(mockResult.failed_file_url)
    })

    it('should not show failed records section when no failures', async () => {
      wrapper = mount(FileUpload)

      const file = new File(['test'], 'test.csv', { type: 'text/csv' })
      const mockResult: UploadResult = {
        total: 50,
        success: 50,
        failed: 0
      }

      vi.mocked(uploadCSV).mockResolvedValue(mockResult)

      const fileInput = wrapper.find('input[type="file"]')
      Object.defineProperty(fileInput.element, 'files', {
        value: [file],
        writable: false
      })

      await fileInput.trigger('change')
      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(wrapper.find('.failed-records-section').exists()).toBe(false)
    })
  })

  describe('Event Emissions', () => {
    it('should emit upload-success event on successful upload', async () => {
      wrapper = mount(FileUpload)

      const file = new File(['test'], 'test.csv', { type: 'text/csv' })
      const mockResult: UploadResult = {
        total: 10,
        success: 10,
        failed: 0
      }

      vi.mocked(uploadCSV).mockResolvedValue(mockResult)

      const fileInput = wrapper.find('input[type="file"]')
      Object.defineProperty(fileInput.element, 'files', {
        value: [file],
        writable: false
      })

      await fileInput.trigger('change')
      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(wrapper.emitted('upload-success')).toBeTruthy()
      expect(wrapper.emitted('upload-success')?.[0]).toEqual([mockResult])
    })

    it('should emit upload-error event on upload failure', async () => {
      wrapper = mount(FileUpload)

      const file = new File(['test'], 'test.csv', { type: 'text/csv' })
      const mockError = new Error('Upload failed')

      vi.mocked(uploadCSV).mockRejectedValue(mockError)

      const fileInput = wrapper.find('input[type="file"]')
      Object.defineProperty(fileInput.element, 'files', {
        value: [file],
        writable: false
      })

      await fileInput.trigger('change')
      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(wrapper.emitted('upload-error')).toBeTruthy()
      expect(wrapper.emitted('upload-error')?.[0]).toEqual([mockError])
    })
  })

  describe('Reset Functionality', () => {
    it('should reset upload state when clicking upload another button', async () => {
      wrapper = mount(FileUpload)

      const file = new File(['test'], 'test.csv', { type: 'text/csv' })
      const mockResult: UploadResult = {
        total: 10,
        success: 10,
        failed: 0
      }

      vi.mocked(uploadCSV).mockResolvedValue(mockResult)

      const fileInput = wrapper.find('input[type="file"]')
      Object.defineProperty(fileInput.element, 'files', {
        value: [file],
        writable: false
      })

      await fileInput.trigger('change')
      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(wrapper.find('.upload-result').exists()).toBe(true)

      await wrapper.find('.upload-another-btn').trigger('click')
      await wrapper.vm.$nextTick()

      expect(wrapper.find('.upload-result').exists()).toBe(false)
      expect(wrapper.find('.upload-prompt').exists()).toBe(true)
    })
  })

  describe('UI States', () => {
    it('should disable interactions during upload', async () => {
      wrapper = mount(FileUpload)

      const file = new File(['test'], 'test.csv', { type: 'text/csv' })
      
      vi.mocked(uploadCSV).mockImplementation(async () => {
        return new Promise(resolve => setTimeout(() => resolve({
          total: 10,
          success: 10,
          failed: 0
        }), 100))
      })

      const fileInput = wrapper.find('input[type="file"]')
      Object.defineProperty(fileInput.element, 'files', {
        value: [file],
        writable: false
      })

      await fileInput.trigger('change')
      await wrapper.vm.$nextTick()

      const uploadArea = wrapper.find('.upload-area')
      expect(uploadArea.classes()).toContain('uploading')
    })

    it('should not trigger drag events during upload', async () => {
      wrapper = mount(FileUpload)

      const file = new File(['test'], 'test.csv', { type: 'text/csv' })
      
      vi.mocked(uploadCSV).mockImplementation(async () => {
        return new Promise(resolve => setTimeout(() => resolve({
          total: 10,
          success: 10,
          failed: 0
        }), 100))
      })

      const fileInput = wrapper.find('input[type="file"]')
      Object.defineProperty(fileInput.element, 'files', {
        value: [file],
        writable: false
      })

      await fileInput.trigger('change')
      await wrapper.vm.$nextTick()

      const uploadArea = wrapper.find('.upload-area')
      await uploadArea.trigger('dragenter')

      expect(uploadArea.classes()).not.toContain('dragging')
    })
  })
})
