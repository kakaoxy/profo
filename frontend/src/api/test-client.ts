/**
 * Manual test script for API client
 * This file can be used to verify API client functionality
 * Run this in browser console or as a standalone test
 */

import { fetchProperties, exportProperties, fetchCommunities } from './index'
import type { PropertyFilters } from './types'

// Test 1: Fetch properties with filters
export async function testFetchProperties() {
  console.log('Testing fetchProperties...')
  
  const filters: PropertyFilters = {
    status: '在售',
    page: 1,
    page_size: 10
  }
  
  try {
    const result = await fetchProperties(filters)
    console.log('✓ fetchProperties success:', result)
    return result
  } catch (error) {
    console.error('✗ fetchProperties failed:', error)
    throw error
  }
}

// Test 2: Fetch properties with all filters
export async function testFetchPropertiesWithAllFilters() {
  console.log('Testing fetchProperties with all filters...')
  
  const filters: PropertyFilters = {
    status: '在售',
    community_name: '测试',
    min_price: 500,
    max_price: 1000,
    min_area: 50,
    max_area: 150,
    rooms: [2, 3],
    sort_by: 'listed_price_wan',
    sort_order: 'desc',
    page: 1,
    page_size: 20
  }
  
  try {
    const result = await fetchProperties(filters)
    console.log('✓ fetchProperties with filters success:', result)
    return result
  } catch (error) {
    console.error('✗ fetchProperties with filters failed:', error)
    throw error
  }
}

// Test 3: Export properties
export async function testExportProperties() {
  console.log('Testing exportProperties...')
  
  const filters: PropertyFilters = {
    status: '在售',
    page: 1,
    page_size: 100
  }
  
  try {
    await exportProperties(filters)
    console.log('✓ exportProperties success - file should be downloading')
  } catch (error) {
    console.error('✗ exportProperties failed:', error)
    throw error
  }
}

// Test 4: Fetch communities
export async function testFetchCommunities() {
  console.log('Testing fetchCommunities...')
  
  try {
    const result = await fetchCommunities('', 1, 10)
    console.log('✓ fetchCommunities success:', result)
    return result
  } catch (error) {
    console.error('✗ fetchCommunities failed:', error)
    throw error
  }
}

// Test 5: Fetch communities with search
export async function testFetchCommunitiesWithSearch() {
  console.log('Testing fetchCommunities with search...')
  
  try {
    const result = await fetchCommunities('测试', 1, 10)
    console.log('✓ fetchCommunities with search success:', result)
    return result
  } catch (error) {
    console.error('✗ fetchCommunities with search failed:', error)
    throw error
  }
}

// Run all tests
export async function runAllTests() {
  console.log('=== Running API Client Tests ===\n')
  
  try {
    await testFetchProperties()
    console.log('')
    
    await testFetchPropertiesWithAllFilters()
    console.log('')
    
    await testFetchCommunities()
    console.log('')
    
    await testFetchCommunitiesWithSearch()
    console.log('')
    
    console.log('=== All tests completed ===')
  } catch (error) {
    console.error('=== Tests failed ===')
  }
}

// Export for use in browser console
if (typeof window !== 'undefined') {
  (window as any).apiTests = {
    testFetchProperties,
    testFetchPropertiesWithAllFilters,
    testExportProperties,
    testFetchCommunities,
    testFetchCommunitiesWithSearch,
    runAllTests
  }
}
