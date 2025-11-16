import type { Property } from '@/api/types'

const STATUS_MAP: Record<string, 'FOR_SALE' | 'SOLD' | 'OTHER'> = {
  在售: 'FOR_SALE',
  成交: 'SOLD',
  FOR_SALE: 'FOR_SALE',
  SOLD: 'SOLD',
  LISTED: 'FOR_SALE',
  ON_MARKET: 'FOR_SALE',
  AVAILABLE: 'FOR_SALE',
  CLOSED: 'SOLD',
  COMPLETED: 'SOLD',
  OFF_MARKET: 'OTHER',
  WITHDRAWN: 'OTHER',
  CANCELLED: 'OTHER',
  PENDING: 'OTHER',
  UNDER_CONTRACT: 'OTHER'
}

export const normalizeStatus = (status?: string): 'FOR_SALE' | 'SOLD' | 'OTHER' => {
  if (!status) return 'OTHER'
  if (STATUS_MAP[status]) return STATUS_MAP[status]
  const upper = status.toUpperCase()
  return STATUS_MAP[upper] ?? 'OTHER'
}

export const getDisplayPriceWan = (property: Property): number | null => {
  const n = normalizeStatus(property.status)
  if (n === 'FOR_SALE') return property.listed_price_wan ?? null
  if (n === 'SOLD') return property.sold_price_wan ?? property.listed_price_wan ?? null
  return property.listed_price_wan ?? property.sold_price_wan ?? null
}

export const getUnitPriceYuanPerSqm = (property: Property): number | null => {
  if (property.unit_price) return property.unit_price
  const totalWan = getDisplayPriceWan(property)
  if (totalWan && property.build_area) return (totalWan * 10000) / property.build_area
  return null
}

export const statusBadgeClass = (status?: string): string => {
  const n = normalizeStatus(status)
  if (n === 'FOR_SALE') return 'status-for-sale'
  if (n === 'SOLD') return 'status-sold'
  return 'status-sold'
}

export const isForSale = (status?: string): boolean => normalizeStatus(status) === 'FOR_SALE'
export const isSold = (status?: string): boolean => normalizeStatus(status) === 'SOLD'