# Implementation Plan

- [x] 1. 项目初始化与环境配置





  - 创建项目根目录结构 (backend/, frontend/)
  - 配置后端 Python 环境 (pyproject.toml, UV 依赖管理)
  - 配置前端 Node.js 环境 (package.json, pnpm, Vite, TypeScript)
  - 创建一键启动脚本 (start.sh, start.bat)
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. 后端核心基础设施





  - 创建数据库模型 (backend/models.py) 包含所有 6 个表定义
  - 实现数据库连接和初始化 (backend/db.py)
  - 配置 FastAPI 应用入口 (backend/main.py) 包含 CORS 和路由注册
  - 创建应用配置文件 (backend/settings.py)
  - _Requirements: 8.7, 8.8_

- [x] 3. 数据验证模型









  - 实现 PropertyIngestionModel (backend/schemas.py) 包含所有字段定义
  - 实现 root_validator 进行状态相关的动态验证
  - 实现 PropertyResponse 响应模型包含计算字段
  - 创建其他辅助 schema 模型 (CommunityResponse, UploadResult 等)
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 4. 楼层解析服务





  - 实现 FloorParser.parse_floor() 方法支持多种格式
  - 实现 FloorParser.calculate_floor_level() 计算楼层级别
  - 处理解析失败的边界情况
  - [x] 4.1 编写楼层解析单元测试 (tests/test_parser.py)






  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [x] 5. 数据导入核心服务





  - 实现 PropertyImporter.find_or_create_community() 方法
  - 实现 PropertyImporter.create_history_snapshot() 方法
  - 实现 PropertyImporter.import_property() 核心导入逻辑
  - 处理新房源创建和已有房源更新两种场景
  - 集成楼层解析服务
  - [x] 5.1 编写数据导入单元测试 (tests/test_importer.py)






  - _Requirements: 2.4, 2.5, 2.6, 2.7, 2.8, 10.1, 10.2_

- [x] 6. CSV 上传功能





  - 实现 /api/upload/csv 路由 (backend/routers/upload.py)
  - 实现 CSV 文件解析和批量导入逻辑
  - 实现失败记录收集和 CSV 生成
  - 返回上传结果统计
  - _Requirements: 2.1, 2.2, 2.3, 2.9, 2.10_

- [x] 7. JSON 推送 API





  - 实现 /api/push 路由 (backend/routers/push.py)
  - 实现 JSON 数组批量处理逻辑
  - 复用 PropertyImporter 服务
  - 返回处理结果统计
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 8. 房源查询 API





  - 实现 /api/properties 路由 (backend/routers/properties.py)
  - 实现多维度筛选逻辑 (状态、小区名、价格、面积、户型)
  - 实现排序功能
  - 实现分页功能
  - 计算并返回附加字段 (单价、成交周期)
  - [x] 8.1 编写 API 集成测试 (tests/test_api.py)













  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.10_

- [x] 9. 房源导出 API





  - 实现 /api/properties/export 路由
  - 复用查询逻辑但移除分页限制
  - 生成 CSV 文件流
  - 设置正确的响应头触发下载
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 10. 小区管理 API




  - 实现 /api/admin/communities 路由 (backend/routers/admin.py)
  - 实现小区搜索和列表功能
  - 实现 CommunityMerger.merge_communities() 服务
  - 实现 /api/admin/communities/merge 路由
  - 处理小区合并的事务性操作 (别名创建、房源更新、软删除)
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10_

- [x] 11. 后端错误处理





  - 实现统一的异常处理中间件
  - 为验证错误创建 failed_records 记录
  - 实现数据库错误处理和回滚
  - 返回用户友好的中文错误信息
  - _Requirements: 8.6, 12.1, 12.2, 12.3, 12.4, 12.5_

- [x] 12. 前端项目初始化





  - 创建 Vue 3 + Vite + TypeScript 项目
  - 配置 TailwindCSS
  - 安装并配置 Pinia 状态管理
  - 安装并配置 Vue Router
  - 安装 @tanstack/vue-virtual 和 @tanstack/vue-query
  - 配置 Axios
  - _Requirements: 11.6_

- [x] 13. API 客户端





  - 创建 Axios 实例配置 (frontend/src/api/client.ts)
  - 实现请求和响应拦截器
  - 实现 fetchProperties() 方法
  - 实现 exportProperties() 方法
  - 实现 uploadCSV() 方法
  - 实现 mergeCommunities() 方法
  - _Requirements: 12.2_

- [x] 14. Pinia 状态管理





  - 创建 property store (frontend/src/stores/property.ts)
  - 定义 PropertyFilters 接口
  - 实现 filters 状态和 updateFilter action
  - 实现 toggleSort action
  - 实现 resetFilters action
  - _Requirements: 11.6_

- [x] 15. 路由配置





  - 配置 Vue Router (frontend/src/router/index.ts)
  - 定义路由: / (主页), /upload (上传), /admin/merge (数据治理)
  - 实现路由懒加载
  - _Requirements: 11.7_

- [x] 16. 房源列表组件





  - 创建 PropertyList.vue 组件
  - 集成 @tanstack/vue-virtual 实现虚拟滚动
  - 实现表头和排序功能
  - 实现 PropertyRow 子组件
  - 处理加载状态
  - [x] 16.1 编写组件单元测试 (tests/components/PropertyList.spec.ts)






  - _Requirements: 4.9, 11.1, 11.3, 11.4, 11.5_

- [x] 17. 筛选面板组件




  - 创建 FilterPanel.vue 组件
  - 实现状态切换按钮 (全部/在售/成交)
  - 实现小区名文本输入
  - 实现价格双滑块范围选择
  - 实现面积双滑块范围选择
  - 实现户型多选下拉框
  - 绑定到 Pinia store
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

- [x] 18. 房源详情弹窗




  - 创建 PropertyDetailModal.vue 组件
  - 实现模态框基础结构
  - 按分组展示房源所有字段 (基础信息、价格与时间等)
  - 实现关闭功能 (按钮和 ESC 键)
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 19. 导出按钮组件






  - 创建 ExportBtn.vue 组件
  - 从 Pinia store 获取当前筛选条件
  - 调用 exportProperties API
  - 处理下载流程
  - 显示导出进度和结果
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 20. 文件上传组件





  - 创建 FileUpload.vue 组件
  - 实现拖拽上传区域
  - 实现点击选择文件
  - 实现上传进度条
  - 调用 uploadCSV API
  - 显示上传结果 (成功、失败统计)
  - 提供失败记录下载链接
  - [x] 20.1 编写组件单元测试 (tests/components/FileUpload.spec.ts)






  - _Requirements: 2.1, 2.9, 2.10_

- [x] 21. 小区合并操作台





  - 创建 CommunityList.vue 组件 (左侧列表)
  - 创建 CommunityMergeConsole.vue 组件 (右侧操作台)
  - 实现小区搜索功能
  - 实现多选功能
  - 实现主记录选择 (单选按钮)
  - 实现确认对话框显示影响的房源数
  - 调用 mergeCommunities API
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.10_

- [x] 22. 主页视图





  - 创建 HomeView.vue 页面组件
  - 集成 FilterPanel 组件
  - 集成 PropertyList 组件
  - 集成 ExportBtn 组件
  - 集成 PropertyDetailModal 组件
  - 使用 @tanstack/vue-query 管理数据获取
  - 实现分页组件
  - _Requirements: 4.6, 11.2_

- [x] 23. 上传页视图





  - 创建 UploadView.vue 页面组件
  - 集成 FileUpload 组件
  - 显示上传结果
  - _Requirements: 2.1_

- [x] 24. 数据治理页视图





  - 创建 AdminMergeView.vue 页面组件
  - 实现左右分栏布局
  - 集成 CommunityList 和 CommunityMergeConsole 组件
  - 处理合并成功后的列表刷新
  - _Requirements: 7.1_

- [x] 25. 前端错误处理





  - 在 API 客户端拦截器中实现统一错误处理
  - 创建 Toast 通知组件
  - 实现组件级错误边界
  - 实现用户操作前端验证
  - _Requirements: 12.1, 12.2_

- [x] 26. 样式和 UI 优化





  - 使用 TailwindCSS 实现响应式布局
  - 创建统一的颜色主题和间距规范
  - 实现加载状态指示器
  - 优化表格和列表的视觉效果
  - 实现空状态提示
  - _Requirements: 11.2, 11.3_

- [x] 27. 性能优化





  - 实现筛选条件的 debounce (300ms)
  - 配置 @tanstack/vue-query 缓存策略
  - 优化虚拟滚动的 buffer 大小
  - 实现路由级代码分割
  - 后端实现批量数据库操作
  - _Requirements: 11.1, 11.5_

- [x] 28. 数据库初始化脚本





  - 创建 backend/init_db.py 脚本
  - 调用 models.create_all() 创建所有表
  - 添加初始化成功提示
  - 在 README 中说明初始化步骤
  - _Requirements: 1.1_

- [x] 29. 启动脚本





  - 创建 start.sh (macOS/Linux)
  - 创建 start.bat (Windows)
  - 实现同时启动后端和前端服务
  - 实现 Ctrl+C 优雅关闭
  - 显示服务 URL
  - _Requirements: 1.2, 1.3, 1.5_

- [ ] 30. 文档和部署指南
  - 创建 README.md 包含项目介绍
  - 编写环境准备说明 (Python, Node.js, UV, pnpm)
  - 编写安装步骤
  - 编写启动步骤
  - 编写使用说明
  - 添加常见问题解答
  - _Requirements: 1.1, 1.2_

- [ ]* 31. 端到端测试 (可选)
  - [ ]* 31.1 配置 Playwright 测试环境
  - [ ]* 31.2 编写 CSV 上传 E2E 测试
  - [ ]* 31.3 编写房源查询和筛选 E2E 测试
  - [ ]* 31.4 编写小区合并 E2E 测试
  - _Requirements: 测试策略_
```