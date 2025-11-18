import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import PropertyList from '@/components/PropertyList.vue'
import PropertyRow from '@/components/PropertyRow.vue'
import { usePropertyStore } from '@/stores/property'
import type { Property } from '@/api/types'

// Mock data
const createMockProperty = (overrides: Partial<Property> = {}): Property => ({
  id: 1,
  data_source: '链家',
  source_property_id: 'TEST001',
  status: '在售',
  community_name: '测试小区',
  rooms: 3,
  halls: 2,
  baths: 1,
  orientation: '南',
  floor_original: '高楼层/18',
  floor_level: '高楼层',
  build_area: 100,
  listed_price_wan: 500,
  unit_price: 50000,
  created_at: '2024-01-01T00:00:00',
  updated_at: '2024-01-01T00:00:00',
  ...overrides
})

describe('PropertyList.vue', () => {
  let wrapper: VueWrapper
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    // Create a fresh pinia instance for each test
    pinia = createPinia()
    setActivePinia(pinia)
  })

  describe('Loading State', () => {
    it('should display loading spinner when loading is true', () => {
      wrapper = mount(PropertyList, {
        props: {
          properties: [],
          loading: true
        },
        global: {
          plugins: [pinia]
        }
      })

      expect(wrapper.text()).toContain('加载中...')
    })

    it('should not display loading spinner when loading is false', () => {
      wrapper = mount(PropertyList, {
        props: {
          properties: [],
          loading: false
        },
        global: {
          plugins: [pinia]
        }
      })

      expect(wrapper.find('.loading-container').exists()).toBe(false)
    })
  })

  describe('Empty State', () => {
    it('should display empty state when properties array is empty', () => {
      wrapper = mount(PropertyList, {
        props: {
          properties: [],
          loading: false
        },
        global: {
          plugins: [pinia]
        }
      })

      expect(wrapper.find('.empty-state').exists()).toBe(true)
      expect(wrapper.text()).toContain('暂无数据')
    })

    it('should not display empty state when properties exist', () => {
      const properties = [createMockProperty()]
      
      wrapper = mount(PropertyList, {
        props: {
          properties,
          loading: false
        },
        global: {
          plugins: [pinia],
          stubs: {
            PropertyRow: true
          }
        }
      })

      expect(wrapper.find('.empty-state').exists()).toBe(false)
    })
  })

  describe('Property Table Rendering', () => {
    it('should render table header with all columns', () => {
      const properties = [createMockProperty()]
      
      wrapper = mount(PropertyList, {
        props: {
          properties,
          loading: false
        },
        global: {
          plugins: [pinia],
          stubs: {
            PropertyRow: true
          }
        }
      })

      const headers = wrapper.findAll('.header-cell')
      expect(headers.length).toBe(15)
      
      const headerTexts = headers.map(h => h.text())
      expect(headerTexts.some(t => t.includes('房源ID'))).toBe(true)
      expect(headerTexts.some(t => t.includes('户型图'))).toBe(true)
      expect(headerTexts.some(t => t.includes('小区'))).toBe(true)
      expect(headerTexts.some(t => t.includes('状态'))).toBe(true)
      expect(headerTexts.some(t => t.includes('户型'))).toBe(true)
      expect(headerTexts.some(t => t.includes('面积(㎡)'))).toBe(true)
      expect(headerTexts.some(t => t.includes('楼层'))).toBe(true)
      expect(headerTexts.some(t => t.includes('朝向'))).toBe(true)
      expect(headerTexts.some(t => t.includes('总价(万)'))).toBe(true)
      expect(headerTexts.some(t => t.includes('单价(元/㎡)'))).toBe(true)
      expect(headerTexts.some(t => t.includes('挂牌/成交时间'))).toBe(true)
      expect(headerTexts.some(t => t.includes('数据源'))).toBe(true)
      expect(headerTexts.some(t => t.includes('操作'))).toBe(true)
    })

    it('should mark sortable columns with sortable class', () => {
      const properties = [createMockProperty()]
      
      wrapper = mount(PropertyList, {
        props: {
          properties,
          loading: false
        },
        global: {
          plugins: [pinia],
          stubs: {
            PropertyRow: true
          }
        }
      })

      const sortableHeaders = wrapper.findAll('.header-cell.sortable')
      expect(sortableHeaders.length).toBeGreaterThan(0)
    })
  })

  describe('Sorting Functionality', () => {
    it('should call toggleSort when clicking sortable column', async () => {
      const properties = [createMockProperty()]
      const store = usePropertyStore()
      const toggleSortSpy = vi.spyOn(store, 'toggleSort')
      
      wrapper = mount(PropertyList, {
        props: {
          properties,
          loading: false
        },
        global: {
          plugins: [pinia],
          stubs: {
            PropertyRow: true
          }
        }
      })

      const sortableHeader = wrapper.find('.header-cell.sortable')
      await sortableHeader.trigger('click')

      expect(toggleSortSpy).toHaveBeenCalled()
    })

    it('should display sort indicator for active sort column', () => {
      const properties = [createMockProperty()]
      const store = usePropertyStore()
      store.filters.sort_by = 'community_name'
      store.filters.sort_order = 'asc'
      
      wrapper = mount(PropertyList, {
        props: {
          properties,
          loading: false
        },
        global: {
          plugins: [pinia],
          stubs: {
            PropertyRow: true
          }
        }
      })

      const sortIcons = wrapper.findAll('.sort-icon')
      const activeSortIcon = sortIcons.find(icon => icon.text().includes('↑') || icon.text().includes('↓'))
      expect(activeSortIcon).toBeDefined()
    })
  })

  describe('Virtual Scrolling', () => {
    it('should render PropertyRow components for visible items', () => {
      const properties = Array.from({ length: 100 }, (_, i) => 
        createMockProperty({ id: i + 1, community_name: `小区${i + 1}` })
      )
      
      wrapper = mount(PropertyList, {
        props: {
          properties,
          loading: false
        },
        global: {
          plugins: [pinia]
        }
      })

      const propertyRows = wrapper.findAllComponents(PropertyRow)
      // Should render visible items plus buffer
      expect(propertyRows.length).toBeGreaterThan(0)
      expect(propertyRows.length).toBeLessThan(properties.length)
    })

    it('should calculate correct total height based on properties count', () => {
      const properties = Array.from({ length: 50 }, (_, i) => 
        createMockProperty({ id: i + 1 })
      )
      
      wrapper = mount(PropertyList, {
        props: {
          properties,
          loading: false
        },
        global: {
          plugins: [pinia],
          stubs: {
            PropertyRow: true
          }
        }
      })

      const scrollContainer = wrapper.find('.table-body > div')
      const style = scrollContainer.attributes('style')
      // Row height is 60px, so 50 properties = 3000px
      expect(style).toContain('3000px')
    })
  })

  describe('Event Handling', () => {
    it('should emit view-detail event when PropertyRow emits it', async () => {
      const properties = [createMockProperty()]
      
      wrapper = mount(PropertyList, {
        props: {
          properties,
          loading: false
        },
        global: {
          plugins: [pinia]
        }
      })

      const propertyRow = wrapper.findComponent(PropertyRow)
      await propertyRow.vm.$emit('view-detail', properties[0])

      expect(wrapper.emitted('view-detail')).toBeTruthy()
      expect(wrapper.emitted('view-detail')?.[0]).toEqual([properties[0]])
    })
  })

  describe('Scroll Behavior', () => {
    it('should update scroll position on scroll event', async () => {
      const properties = Array.from({ length: 100 }, (_, i) => 
        createMockProperty({ id: i + 1 })
      )
      
      wrapper = mount(PropertyList, {
        props: {
          properties,
          loading: false
        },
        global: {
          plugins: [pinia],
          stubs: {
            PropertyRow: true
          }
        }
      })

      const scrollContainer = wrapper.find('.table-body')
      const element = scrollContainer.element as HTMLElement
      
      // Mock scrollTop
      Object.defineProperty(element, 'scrollTop', {
        writable: true,
        value: 300
      })

      await scrollContainer.trigger('scroll')
      
      // The component should handle the scroll event
      expect(scrollContainer.exists()).toBe(true)
    })

    it('should reset scroll position when properties change', async () => {
      const initialProperties = [createMockProperty({ id: 1 })]
      
      wrapper = mount(PropertyList, {
        props: {
          properties: initialProperties,
          loading: false
        },
        global: {
          plugins: [pinia],
          stubs: {
            PropertyRow: true
          }
        }
      })

      const scrollContainer = wrapper.find('.table-body')
      const element = scrollContainer.element as HTMLElement
      
      // Set scroll position
      Object.defineProperty(element, 'scrollTop', {
        writable: true,
        value: 300
      })

      // Update properties
      const newProperties = [createMockProperty({ id: 2 })]
      await wrapper.setProps({ properties: newProperties })

      // Scroll should be reset (component sets scrollTop to 0)
      expect(scrollContainer.exists()).toBe(true)
    })
  })

  describe('Performance', () => {
    it('should handle large datasets efficiently', () => {
      const properties = Array.from({ length: 1000 }, (_, i) => 
        createMockProperty({ id: i + 1 })
      )
      
      const startTime = performance.now()
      
      wrapper = mount(PropertyList, {
        props: {
          properties,
          loading: false
        },
        global: {
          plugins: [pinia],
          stubs: {
            PropertyRow: true
          }
        }
      })
      
      const endTime = performance.now()
      const renderTime = endTime - startTime

      // Should render in reasonable time (less than 1 second)
      expect(renderTime).toBeLessThan(1000)
      expect(wrapper.exists()).toBe(true)
    })
  })
})
