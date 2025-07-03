# 房源管理系统 - 前端

基于 Vue 3 + TailwindCSS 构建的现代化房源管理系统前端应用。

## 功能特性

### 🏠 核心功能模块

- **数据看板**: 核心指标展示、交易趋势图表、近期动态
- **房源管理**: 房源列表、详情查看、新增编辑、复合搜索筛选
- **个人看房**: 看房笔记管理、评分系统、关联房源和经纪人
- **数据导入**: CSV文件导入、模板下载、API数据同步
- **小区分析**: 小区统计数据、价格趋势分析
- **基础数据**: 城市、中介公司、经纪人、小区管理

### 🔐 用户认证

- 用户名密码登录/注册
- JWT Token 认证
- 微信小程序登录支持
- 自动登录状态恢复

### 🎨 设计特色

- **现代简约**: 扁平化设计，类似高端金融分析工具风格
- **信息优先**: 清晰的数据呈现，合理的布局和对比度
- **沉浸专注**: 中性冷静色调，彩色作为功能性焦点
- **呼吸感**: 大量留白，避免元素堆砌

## 技术栈

- **框架**: Vue 3 (Composition API)
- **构建工具**: Vite
- **样式**: TailwindCSS + 自定义组件样式
- **路由**: Vue Router 4
- **HTTP客户端**: Axios
- **图表**: Chart.js + vue-chartjs
- **图标**: Heroicons
- **UI组件**: Headless UI

## 开发环境设置

### 前置要求

- Node.js 16+
- pnpm (推荐) 或 npm

### 安装依赖

```bash
pnpm install
```

### 启动开发服务器

```bash
pnpm dev
```

应用将在 http://localhost:3000 启动

### 构建生产版本

```bash
pnpm build
```

### 预览生产构建

```bash
pnpm preview
```

## API 配置

前端默认连接到 `http://localhost:8000/api/v1` 的后端API。

如需修改API地址，请编辑 `src/services/api.js` 中的 `baseURL` 配置。

## 开发指南

### 添加新页面

1. 在 `src/views/` 下创建页面组件
2. 在 `src/router/index.js` 中添加路由配置
3. 如需要，在 `src/components/Layout.vue` 中添加导航链接

### 添加新API

1. 在 `src/services/api.js` 中添加API函数
2. 在页面组件中导入并使用

### 样式开发

- 优先使用 TailwindCSS 工具类
- 自定义组件样式定义在 `src/assets/main.css` 的 `@layer components` 中
- 页面特定样式使用 `<style scoped>`

## 浏览器支持

- Chrome 88+
- Firefox 85+
- Safari 14+
- Edge 88+

## 许可证

MIT License
