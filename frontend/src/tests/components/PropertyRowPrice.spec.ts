import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PropertyRow from '@/components/PropertyRow/PropertyRow'
import type { Property } from '@/api/types'

const createProperty = (overrides: Partial<Property> = {}): Property => ({
  id: 1,
  data_source: '测试',
  source_property_id: 'P1',
  status: 'FOR_SALE',
  community_name: '小区',
  rooms: 2,
  halls: 1,
  baths: 1,
  orientation: '南',
  floor_original: '高楼层',
  build_area: 100,
  listed_price_wan: 500,
  created_at: '2024-01-01T00:00:00',
  updated_at: '2024-01-01T00:00:00',
  ...overrides
})

describe('PropertyRow price display', () => {
  it('displays listed price for FOR_SALE', () => {
    const p = createProperty({ status: 'FOR_SALE', listed_price_wan: 500 })
    const w = mount(PropertyRow, { props: { property: p } })
    const cell = w.find('.col-total_price')
    expect(cell.text()).toBe('500')
  })

  it('displays sold price for SOLD', () => {
    const p = createProperty({ status: 'SOLD', sold_price_wan: 650, listed_price_wan: 600 })
    const w = mount(PropertyRow, { props: { property: p } })
    const cell = w.find('.col-total_price')
    expect(cell.text()).toBe('650')
  })

  it('falls back to listed when sold missing', () => {
    const p = createProperty({ status: 'SOLD', sold_price_wan: undefined, listed_price_wan: 620 })
    const w = mount(PropertyRow, { props: { property: p } })
    const cell = w.find('.col-total_price')
    expect(cell.text()).toBe('620')
  })

  it('shows dash when no price available', () => {
    const p = createProperty({ status: 'OFF_MARKET', listed_price_wan: undefined, sold_price_wan: undefined })
    const w = mount(PropertyRow, { props: { property: p } })
    const cell = w.find('.col-total_price')
    expect(cell.text()).toBe('-')
  })
})