import { chromium } from '@playwright/test';

async function globalSetup() {
  console.log('🚀 Starting global test setup...');
  
  // Launch browser for setup
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Wait for frontend to be ready
    console.log('⏳ Waiting for frontend server...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    console.log('✅ Frontend server is ready');

    // Wait for backend to be ready
    console.log('⏳ Waiting for backend server...');
    await page.goto('http://localhost:8000/docs', { waitUntil: 'networkidle' });
    console.log('✅ Backend server is ready');

    // Create test user for authentication tests
    console.log('👤 Creating test user...');
    try {
      const response = await page.request.post('http://localhost:8000/api/v1/auth/register', {
        data: {
          username: 'testuser',
          password: 'testpass123',
          nickname: 'Test User'
        }
      });
      
      if (response.ok()) {
        console.log('✅ Test user created successfully');
      } else {
        console.log('ℹ️ Test user might already exist');
      }
    } catch (error) {
      console.log('ℹ️ Test user creation skipped:', error.message);
    }

    // Create test data
    console.log('📊 Setting up test data...');
    await setupTestData(page);
    
  } catch (error) {
    console.error('❌ Global setup failed:', error);
    throw error;
  } finally {
    await browser.close();
  }

  console.log('✅ Global test setup completed');
}

async function setupTestData(page) {
  try {
    // Login as test user to create test data
    const loginResponse = await page.request.post('http://localhost:8000/api/v1/auth/login', {
      data: {
        username: 'testuser',
        password: 'testpass123'
      }
    });

    if (!loginResponse.ok()) {
      console.log('⚠️ Could not login test user for data setup');
      return;
    }

    const loginData = await loginResponse.json();
    const token = loginData.access_token;

    // Create test city
    await page.request.post('http://localhost:8000/api/v1/cities', {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      data: {
        name: '测试城市',
        province: '测试省份'
      }
    });

    // Create test agency
    await page.request.post('http://localhost:8000/api/v1/agencies', {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      data: {
        name: '测试中介公司',
        phone: '13800138000',
        address: '测试地址'
      }
    });

    // Create test community
    await page.request.post('http://localhost:8000/api/v1/communities', {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      data: {
        name: '测试小区',
        city_id: 1,
        district: '测试区域',
        address: '测试小区地址',
        build_year: 2020
      }
    });

    console.log('✅ Test data setup completed');
  } catch (error) {
    console.log('⚠️ Test data setup failed:', error.message);
  }
}

export default globalSetup;
