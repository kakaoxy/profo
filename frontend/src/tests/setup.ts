// Test setup file
import { config } from '@vue/test-utils'

// Configure Vue Test Utils globally
config.global.stubs = {
  // Stub out any components that might cause issues in tests
}

// Mock window.matchMedia for responsive tests
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  }),
})
