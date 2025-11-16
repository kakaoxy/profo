# Profo 房产数据中心 - 前端

Vue 3 + TypeScript + Vite 前端应用

## 技术栈

- **Vue 3.4+** - 使用 Composition API
- **TypeScript 5.3+** - 类型安全
- **Vite 5.0+** - 快速构建工具
- **Pinia 2.1+** - 状态管理
- **Vue Router 4.2+** - 路由管理
- **TailwindCSS 3.4+** - 样式框架
- **Axios 1.6+** - HTTP 客户端
- **@tanstack/vue-query 5.0+** - 数据获取和缓存
- **@tanstack/vue-virtual 3.0+** - 虚拟滚动

## 项目结构

```
frontend/
├── src/
│   ├── api/              # API 客户端
│   │   ├── client.ts     # Axios 配置和拦截器
│   │   ├── types.ts      # TypeScript 类型定义
│   │   ├── properties.ts # 房源相关 API
│   │   ├── upload.ts     # 上传相关 API
│   │   ├── admin.ts      # 管理相关 API
│   │   └── index.ts      # API 导出
│   ├── stores/           # Pinia 状态管理
│   │   ├── property.ts   # 房源状态
│   │   └── index.ts      # Store 导出
│   ├── router/           # Vue Router 配置
│   │   └── index.ts      # 路由定义
│   ├── pages/            # 页面组件
│   │   ├── HomeView.vue        # 主页（房源列表）
│   │   ├── UploadView.vue      # 上传页
│   │   └── AdminMergeView.vue  # 数据治理页
│   ├── components/       # 可复用组件（待实现）
│   ├── composables/      # 组合式函数
│   │   └── useToast.ts   # Toast 通知
│   ├── App.vue           # 根组件
│   ├── main.ts           # 应用入口
│   └── style.css         # 全局样式
├── index.html            # HTML 模板
├── vite.config.ts        # Vite 配置
├── tsconfig.json         # TypeScript 配置
├── tailwind.config.js    # TailwindCSS 配置
└── package.json          # 依赖配置

```

## 安装依赖

使用 pnpm（推荐）：
```bash
pnpm install
```

或使用 npm：
```bash
npm install
```

## 开发

启动开发服务器：
```bash
pnpm dev
```

应用将在 http://localhost:3000 启动

## 构建

生产构建：
```bash
pnpm build
```

预览生产构建：
```bash
pnpm preview
```

## API 配置

Vite 已配置代理，所有 `/api` 请求将转发到后端服务器 `http://localhost:8000`

## 状态管理

使用 Pinia 管理应用状态：

```typescript
import { usePropertyStore } from '@/stores/property'

const propertyStore = usePropertyStore()

// 更新筛选条件
propertyStore.updateFilter('status', '在售')

// 切换排序
propertyStore.toggleSort('listed_price_wan')

// 重置筛选
propertyStore.resetFilters()
```

## API 调用

```typescript
import { fetchProperties, uploadCSV, mergeCommunities } from '@/api'

// 获取房源列表
const response = await fetchProperties({
  status: '在售',
  page: 1,
  page_size: 50
})

// 上传 CSV
const result = await uploadCSV(file, (progress) => {
  console.log(`上传进度: ${progress}%`)
})

// 合并小区
const mergeResult = await mergeCommunities(primaryId, [id1, id2])
```

## 路由

- `/` - 主页（房源列表）
- `/upload` - CSV 上传页
- `/admin/merge` - 小区数据治理页

## 下一步

当前已完成前端项目初始化（任务 12），包括：
- ✅ Vue 3 + Vite + TypeScript 项目结构
- ✅ TailwindCSS 配置
- ✅ Pinia 状态管理
- ✅ Vue Router 路由配置
- ✅ Axios API 客户端
- ✅ @tanstack/vue-query 和 @tanstack/vue-virtual 依赖

待实现的任务：
- 任务 13: API 客户端（已创建基础结构）
- 任务 14: Pinia 状态管理（已创建基础结构）
- 任务 15: 路由配置（已完成）
- 任务 16-27: 各个组件和页面的具体实现
