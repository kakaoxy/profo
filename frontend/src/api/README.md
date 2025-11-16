# API Client Documentation

This directory contains the API client implementation for the Profo Real Estate Data Center frontend application.

## Overview

The API client is built using Axios and provides a clean, type-safe interface for communicating with the backend FastAPI server.

## Architecture

```
api/
├── client.ts          # Axios instance with interceptors
├── types.ts           # TypeScript type definitions
├── properties.ts      # Property-related API calls
├── upload.ts          # File upload API calls
├── admin.ts           # Admin/community management API calls
├── index.ts           # Barrel export file
├── test-client.ts     # Manual testing utilities
└── README.md          # This file
```

## Core Components

### 1. API Client (`client.ts`)

The base Axios instance with request/response interceptors.

**Features:**
- Base URL configuration: `/api`
- 30-second timeout
- Automatic error handling with toast notifications
- Request/response logging
- Support for authentication tokens (ready for future use)

**Error Handling:**
- 400: Bad Request - Parameter validation errors
- 404: Not Found - Resource doesn't exist
- 500: Internal Server Error
- 503: Service Unavailable
- Network errors (timeout, connection failed)

### 2. Type Definitions (`types.ts`)

TypeScript interfaces for all API requests and responses.

**Key Types:**
- `PropertyFilters` - Query parameters for property search
- `Property` - Property entity
- `PropertyListResponse` - Paginated property list
- `UploadResult` - CSV upload result
- `Community` - Community entity
- `CommunityListResponse` - Community list
- `MergeResult` - Community merge result

### 3. API Methods

#### Properties API (`properties.ts`)

**`fetchProperties(filters: PropertyFilters): Promise<PropertyListResponse>`**

Fetch properties with filters and pagination.

```typescript
const result = await fetchProperties({
  status: '在售',
  community_name: '测试小区',
  min_price: 500,
  max_price: 1000,
  min_area: 50,
  max_area: 150,
  rooms: [2, 3],
  sort_by: 'listed_price_wan',
  sort_order: 'desc',
  page: 1,
  page_size: 50
})
```

**`exportProperties(filters: PropertyFilters): Promise<void>`**

Export properties as CSV file with current filters.

```typescript
await exportProperties({
  status: '在售',
  min_price: 500,
  max_price: 1000
})
// File will be automatically downloaded
```

#### Upload API (`upload.ts`)

**`uploadCSV(file: File, onProgress?: (percent: number) => void): Promise<UploadResult>`**

Upload CSV file with progress tracking.

```typescript
const result = await uploadCSV(file, (percent) => {
  console.log(`Upload progress: ${percent}%`)
})

console.log(`Total: ${result.total}, Success: ${result.success}, Failed: ${result.failed}`)
```

#### Admin API (`admin.ts`)

**`fetchCommunities(search?: string, page?: number, pageSize?: number): Promise<CommunityListResponse>`**

Fetch communities with optional search.

```typescript
const result = await fetchCommunities('测试', 1, 50)
```

**`mergeCommunities(primaryId: number, mergeIds: number[]): Promise<MergeResult>`**

Merge multiple communities into one.

```typescript
const result = await mergeCommunities(1, [2, 3, 4])
console.log(`Merged successfully, affected ${result.affected_properties} properties`)
```

## Usage Examples

### Basic Usage

```typescript
import { fetchProperties, uploadCSV, mergeCommunities } from '@/api'

// Fetch properties
const properties = await fetchProperties({ status: '在售', page: 1 })

// Upload CSV
const uploadResult = await uploadCSV(file)

// Merge communities
const mergeResult = await mergeCommunities(primaryId, [id1, id2])
```

### With Vue Composition API

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { fetchProperties } from '@/api'
import type { PropertyFilters } from '@/api'

const properties = ref([])
const loading = ref(false)

const loadProperties = async () => {
  loading.value = true
  try {
    const filters: PropertyFilters = {
      status: '在售',
      page: 1,
      page_size: 50
    }
    const result = await fetchProperties(filters)
    properties.value = result.items
  } catch (error) {
    // Error is already handled by interceptor
    console.error('Failed to load properties')
  } finally {
    loading.value = false
  }
}
</script>
```

### With @tanstack/vue-query

```vue
<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import { fetchProperties } from '@/api'
import { computed } from 'vue'
import { usePropertyStore } from '@/stores/property'

const propertyStore = usePropertyStore()
const filters = computed(() => propertyStore.filters)

const { data, isLoading, error } = useQuery({
  queryKey: ['properties', filters],
  queryFn: () => fetchProperties(filters.value)
})
</script>
```

## Error Handling

All API errors are automatically handled by the response interceptor:

1. **Toast Notifications**: User-friendly error messages are displayed via toast
2. **Console Logging**: Detailed error information is logged for debugging
3. **Promise Rejection**: Errors are still rejected for component-level handling

### Custom Error Handling

If you need custom error handling, catch the error in your component:

```typescript
try {
  await fetchProperties(filters)
} catch (error) {
  // Custom error handling
  // Note: Toast notification has already been shown
  console.log('Custom error handling')
}
```

## Testing

### Manual Testing

Use the test utilities in `test-client.ts`:

```typescript
import { runAllTests } from '@/api/test-client'

// Run all API tests
await runAllTests()
```

Or in browser console:

```javascript
// Tests are exposed on window.apiTests
await window.apiTests.runAllTests()
await window.apiTests.testFetchProperties()
```

### Integration Testing

For integration tests, you can mock the API client:

```typescript
import { vi } from 'vitest'
import * as api from '@/api'

vi.mock('@/api', () => ({
  fetchProperties: vi.fn().mockResolvedValue({
    total: 100,
    page: 1,
    page_size: 50,
    items: [/* mock data */]
  })
}))
```

## Configuration

### Base URL

The base URL is configured in `client.ts`:

```typescript
const apiClient = axios.create({
  baseURL: '/api',  // Proxied by Vite to http://localhost:8000/api
  timeout: 30000
})
```

### Vite Proxy Configuration

In `vite.config.ts`, the `/api` path is proxied to the backend:

```typescript
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true
      }
    }
  }
})
```

## Best Practices

1. **Always use TypeScript types** - Import types from `@/api/types`
2. **Let interceptors handle errors** - Don't duplicate error handling
3. **Use vue-query for data fetching** - Automatic caching and refetching
4. **Debounce filter changes** - Avoid excessive API calls
5. **Handle loading states** - Show loading indicators during API calls

## Future Enhancements

- [ ] Add authentication token support
- [ ] Implement request cancellation for pending requests
- [ ] Add retry logic for failed requests
- [ ] Implement request deduplication
- [ ] Add API response caching layer
- [ ] Support for WebSocket connections (real-time updates)

## Requirements Mapping

This implementation satisfies the following requirements:

- **Requirement 12.2**: Unified error handling with user-friendly messages
- **Requirement 4.6**: Automatic API request triggering on filter changes
- **Requirement 2.10**: Failed record download support
- **Requirement 5.4**: CSV export with timestamp filename
- **Requirement 7.10**: Community merge confirmation and feedback

## Related Files

- Backend API: `backend/routers/`
- Frontend Store: `frontend/src/stores/property.ts`
- Toast Notifications: `frontend/src/composables/useToast.ts`
- Type Definitions: `frontend/src/api/types.ts`
