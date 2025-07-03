# 房源管理系统 E2E 测试文档

## 概述

本项目使用 Playwright 框架进行端到端（E2E）测试，覆盖房源管理系统前端的所有功能模块。测试确保系统在真实浏览器环境中的功能正确性和用户体验。

## 测试架构

### 测试框架
- **Playwright**: 现代化的端到端测试框架
- **多浏览器支持**: Chrome, Firefox, Safari (WebKit)
- **移动端测试**: 支持移动设备视图测试
- **并行执行**: 支持测试并行运行（CI环境中使用单线程）

### 项目结构

```
frontend/tests/
├── e2e/                          # E2E测试目录
│   ├── pages/                    # 页面对象模型
│   │   ├── LoginPage.js          # 登录页面对象
│   │   └── DashboardPage.js      # 看板页面对象
│   ├── utils/                    # 测试工具
│   │   └── test-helpers.js       # 通用测试辅助函数
│   ├── auth.spec.js              # 用户认证测试
│   ├── dashboard.spec.js         # 数据看板测试
│   ├── properties.spec.js        # 房源管理测试
│   ├── viewings.spec.js          # 看房管理测试
│   ├── data-import.spec.js       # 数据导入测试
│   ├── communities.spec.js       # 小区分析测试
│   ├── admin.spec.js             # 基础数据管理测试
│   ├── global-setup.js           # 全局测试设置
│   └── global-teardown.js        # 全局测试清理
├── README.md                     # 本文档
└── test-results/                 # 测试结果输出目录
```

## 测试模块

### 1. 用户认证模块 (`auth.spec.js`)
- **登录功能**: 正确/错误凭据、记住我、表单验证
- **注册功能**: 新用户注册、密码确认、服务条款
- **认证状态**: 登录状态保持、自动登出、token过期处理
- **错误处理**: 网络错误、服务器错误
- **响应式设计**: 移动端适配

### 2. 数据看板模块 (`dashboard.spec.js`)
- **核心指标**: 成交套数、房源总数、看房记录显示
- **趋势图表**: Chart.js图表渲染、时间段切换、图表交互
- **近期动态**: 最近房源、看房笔记、快捷链接
- **数据一致性**: 看板与详细页面数据验证
- **性能测试**: 加载时间、响应速度

### 3. 房源管理模块 (`properties.spec.js`)
- **房源列表**: 分页、搜索、筛选、排序
- **CRUD操作**: 创建、查看、更新、删除房源
- **表单验证**: 必填字段、数据格式验证
- **详情页面**: 房源信息展示、快捷操作
- **搜索筛选**: 多条件组合搜索

### 4. 个人看房管理模块 (`viewings.spec.js`)
- **笔记列表**: 卡片式展示、评分系统
- **笔记表单**: 房源关联、经纪人选择、评分功能
- **CRUD操作**: 创建、编辑、删除看房笔记
- **数据展示**: 时间格式、评分星星、内容截断

### 5. 数据导入模块 (`data-import.spec.js`)
- **CSV导入**: 文件上传、格式验证、大小限制
- **模板下载**: CSV模板生成和下载
- **API同步**: 外部数据同步功能
- **手动录入**: 快捷跳转到新增页面
- **结果展示**: 导入成功/失败统计、错误详情

### 6. 小区分析模块 (`communities.spec.js`)
- **小区列表**: 搜索、筛选、统计概览
- **小区详情**: 基本信息、价格趋势图、房源列表
- **统计数据**: 平均单价、在售/已售房源数量
- **图表交互**: 价格趋势时间段切换

### 7. 基础数据管理模块 (`admin.spec.js`)
- **标签页切换**: 城市、中介公司、经纪人、小区管理
- **数据列表**: 表格展示、操作按钮
- **CRUD操作**: 新增、编辑、删除基础数据
- **数据一致性**: 不同标签页间数据保持

## 测试工具和辅助函数

### TestHelpers 类 (`test-helpers.js`)
提供通用的测试辅助方法：

- `loginTestUser()`: 登录测试用户
- `waitForPageLoad()`: 等待页面加载完成
- `checkPageTitle()`: 检查页面标题
- `fillForm()`: 批量填写表单
- `checkTableData()`: 验证表格数据
- `testSearch()`: 测试搜索功能
- `checkResponsiveDesign()`: 检查响应式设计
- `mockApiError()`: 模拟API错误

### 页面对象模型 (POM)
- **LoginPage**: 登录页面的元素和操作
- **DashboardPage**: 看板页面的元素和操作
- 封装页面元素选择器和常用操作
- 提高测试代码的可维护性

## 运行测试

### 本地开发环境

#### 1. 安装依赖
```bash
cd frontend
npm install
npx playwright install
```

#### 2. 启动服务
```bash
# 启动后端服务
cd backend
python start_server.py

# 启动前端服务
cd frontend
npm run dev
```

#### 3. 运行测试
```bash
# 运行所有测试
npm run test:e2e

# 运行特定测试文件
npx playwright test auth.spec.js

# 在有头模式下运行（显示浏览器）
npm run test:e2e:headed

# 在调试模式下运行
npm run test:e2e:debug

# 使用UI模式运行
npm run test:e2e:ui
```

#### 4. 使用便捷脚本
```bash
# 自动启动服务并运行测试
./run-e2e-tests.sh

# 在有头模式下运行
./run-e2e-tests.sh --headed

# 只在Firefox中运行
./run-e2e-tests.sh --browser=firefox

# 运行特定测试
./run-e2e-tests.sh --spec=auth.spec.js
```

### CI/CD 环境

测试在 GitHub Actions 中自动运行：

- **触发条件**: Push到main分支、Pull Request
- **多浏览器测试**: Chrome, Firefox, Safari
- **单线程执行**: 提高稳定性
- **测试报告**: 自动生成HTML报告和截图

## 测试配置

### Playwright 配置 (`playwright.config.js`)
- **并行执行**: 本地并行，CI单线程
- **重试机制**: CI环境2次重试
- **超时设置**: 全局60秒，操作10秒
- **报告格式**: HTML、JSON、JUnit
- **截图和视频**: 失败时自动捕获

### 测试数据
- **测试用户**: `testuser` / `testpass123`
- **测试数据**: 全局设置中创建基础测试数据
- **数据隔离**: 每个测试使用独立的数据

## 最佳实践

### 1. 测试编写
- 使用描述性的测试名称
- 遵循 AAA 模式（Arrange, Act, Assert）
- 使用页面对象模型封装页面操作
- 添加适当的等待和超时

### 2. 元素选择
- 优先使用 `data-testid` 属性
- 避免使用易变的CSS选择器
- 使用语义化的文本选择器

### 3. 错误处理
- 测试正常流程和异常情况
- 模拟网络错误和API失败
- 验证错误消息和用户反馈

### 4. 性能考虑
- 使用 `waitForLoadState('networkidle')`
- 避免不必要的等待时间
- 合理使用并行执行

## 测试报告

### HTML 报告
- 详细的测试执行结果
- 失败测试的截图和视频
- 测试执行时间统计
- 浏览器兼容性报告

### 查看报告
```bash
# 生成并查看报告
npm run test:e2e:report

# 或者
npx playwright show-report
```

## 故障排除

### 常见问题

1. **浏览器未安装**
   ```bash
   npx playwright install
   ```

2. **服务未启动**
   - 确保后端服务在 8000 端口运行
   - 确保前端服务在 3000 端口运行

3. **测试超时**
   - 检查网络连接
   - 增加超时时间配置

4. **元素未找到**
   - 检查元素选择器
   - 添加适当的等待条件

### 调试技巧

1. **使用调试模式**
   ```bash
   npx playwright test --debug
   ```

2. **查看浏览器**
   ```bash
   npx playwright test --headed
   ```

3. **截图调试**
   ```javascript
   await page.screenshot({ path: 'debug.png' });
   ```

4. **控制台日志**
   ```javascript
   page.on('console', msg => console.log(msg.text()));
   ```

## 维护和更新

### 定期维护
- 更新 Playwright 版本
- 检查和更新元素选择器
- 优化测试性能
- 添加新功能的测试覆盖

### 测试数据管理
- 定期清理测试数据
- 更新测试用户凭据
- 维护测试环境一致性

---

## 联系信息

如有测试相关问题，请联系开发团队或查看项目文档。
