async function globalTeardown() {
  console.log('🧹 Starting global test teardown...');
  
  // Clean up test data if needed
  // Note: In a real scenario, you might want to clean up test database
  
  console.log('✅ Global test teardown completed');
}

export default globalTeardown;
