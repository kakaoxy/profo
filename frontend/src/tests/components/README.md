# PropertyList Component Tests

## Overview

This directory contains unit tests for the PropertyList component, which is responsible for displaying property data with virtual scrolling capabilities.

## Test Coverage

The `PropertyList.spec.ts` file covers the following requirements:

### Requirement 4.9: Virtual Scrolling
- Tests that the component uses virtual scrolling for rendering large datasets (100+ records)
- Verifies that only visible items plus buffer are rendered

### Requirement 11.1: Debouncing
- Tests component behavior with filter changes (debouncing is handled at the page level)

### Requirement 11.3: Fast Updates
- Tests that the list view updates quickly when data changes
- Performance test ensures rendering completes in reasonable time

### Requirement 11.4: Virtual Scrolling with Buffer
- Tests that the component renders visible rows plus a buffer zone
- Verifies correct calculation of visible range

### Requirement 11.5: Smooth Rendering
- Tests that the component can handle large datasets efficiently
- Performance test ensures smooth rendering (< 1 second for 1000 items)

## Test Scenarios

### 1. Loading State
- ✓ Displays loading spinner when `loading` prop is true
- ✓ Hides loading spinner when `loading` prop is false

### 2. Empty State
- ✓ Displays "暂无数据" when properties array is empty
- ✓ Hides empty state when properties exist

### 3. Table Rendering
- ✓ Renders all 10 column headers correctly
- ✓ Marks sortable columns with appropriate class

### 4. Sorting
- ✓ Calls store's `toggleSort` method when clicking sortable columns
- ✓ Displays sort indicator (↑/↓) for active sort column

### 5. Virtual Scrolling
- ✓ Renders only visible PropertyRow components
- ✓ Calculates correct total height based on row count
- ✓ Handles scroll events properly

### 6. Event Handling
- ✓ Emits `view-detail` event when PropertyRow emits it

### 7. Scroll Behavior
- ✓ Updates scroll position on scroll events
- ✓ Resets scroll position when properties change

### 8. Performance
- ✓ Handles 1000+ properties efficiently (< 1 second render time)

## Running Tests

```bash
# Run tests once
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with UI
pnpm test:ui
```

## Test Structure

Each test follows the Arrange-Act-Assert pattern:

1. **Arrange**: Set up test data and mount the component
2. **Act**: Trigger user interactions or prop changes
3. **Assert**: Verify expected behavior

## Mock Data

The tests use a `createMockProperty` helper function to generate test property data with sensible defaults. This ensures consistent test data across all test cases.

## Dependencies

- **vitest**: Test runner
- **@vue/test-utils**: Vue component testing utilities
- **happy-dom**: Lightweight DOM implementation for tests
- **pinia**: State management (used in tests to provide store context)
