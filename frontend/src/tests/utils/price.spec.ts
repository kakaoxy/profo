import { describe, it, expect } from 'vitest'
import { normalizeStatus, getDisplayPriceWan, getUnitPriceYuanPerSqm } from '@/utils/price'
import type { Property } from '@/api/types'

const baseProperty: Property = {
  id: 1,
  data_source: '测试',
  source_property_id: 'P1',
  status: '在售',
  community_name: '小区',
  rooms: 2,
  halls: 1,
  baths: 1,
  orientation: '南',
  floor_original: '高楼层',
  build_area: 100,
  created_at: '2024-01-01T00:00:00',
  updated_at: '2024-01-01T00:00:00'
}

describe('price utils', () => {
  it('normalizeStatus supports Chinese and English enumerations', () => {
    expect(normalizeStatus('在售')).toBe('FOR_SALE')
    expect(normalizeStatus('成交')).toBe('SOLD')
    expect(normalizeStatus('FOR_SALE')).toBe('FOR_SALE')
    expect(normalizeStatus('SOLD')).toBe('SOLD')
    expect(normalizeStatus('LISTED')).toBe('FOR_SALE')
    expect(normalizeStatus('CLOSED')).toBe('SOLD')
    expect(normalizeStatus('OFF_MARKET')).toBe('OTHER')
    expect(normalizeStatus(undefined)).toBe('OTHER')
  })

  it('getDisplayPriceWan selects listed price for for-sale', () => {
    const p = { ...baseProperty, status: 'FOR_SALE', listed_price_wan: 500 }
    expect(getDisplayPriceWan(p)).toBe(500)
  })

  it('getDisplayPriceWan selects sold price for sold', () => {
    const p = { ...baseProperty, status: 'SOLD', sold_price_wan: 600 }
    expect(getDisplayPriceWan(p)).toBe(600)
  })

  it('getDisplayPriceWan falls back to listed when sold missing', () => {
    const p = { ...baseProperty, status: 'SOLD', listed_price_wan: 520 }
    expect(getDisplayPriceWan(p)).toBe(520)
  })

  it('getDisplayPriceWan handles OTHER with fallback', () => {
    const p1 = { ...baseProperty, status: 'OFF_MARKET', listed_price_wan: 480 }
    expect(getDisplayPriceWan(p1)).toBe(480)
    const p2 = { ...baseProperty, status: 'OFF_MARKET' }
    expect(getDisplayPriceWan(p2)).toBeNull()
  })

  it('getUnitPriceYuanPerSqm returns provided unit_price', () => {
    const p = { ...baseProperty, unit_price: 45000 }
    expect(getUnitPriceYuanPerSqm(p)).toBe(45000)
  })

  it('getUnitPriceYuanPerSqm computes from total and area', () => {
    const p = { ...baseProperty, status: '在售', listed_price_wan: 500, unit_price: undefined }
    expect(getUnitPriceYuanPerSqm(p)).toBe(50000)
  })

  it('getUnitPriceYuanPerSqm returns null when insufficient data', () => {
    const p = { ...baseProperty, listed_price_wan: undefined, sold_price_wan: undefined, build_area: 0 }
    expect(getUnitPriceYuanPerSqm(p)).toBeNull()
  })
})