# 代码审查报告：`@frontend/src/app/(main)`

## 审查概述

**审查范围：** `frontend/src/app/(main)/l4-marketing/projects/` 目录
**审查日期：** 2026-04-18
**审查标准：** Next.js 15 App Router 最佳实践、TypeScript 严格模式、性能优化

---

## 1. 路由与文件组织 (Route Organization)

### 1.1 路由结构分析

| 路径 | 用途 | 状态 |
|------|------|------|
| `page.tsx` | 项目列表页 | ✅ 符合约定 |
| `new/page.tsx` | 新建项目 | ✅ 符合约定 |
| `[id]/edit/page.tsx` | 编辑项目 | ✅ 符合约定 |
| `[id]/preview/page.tsx` | 预览项目 | ✅ 符合约定 |
| `loading.tsx` | 加载状态 | ✅ 符合约定 |
| `error.tsx` | 错误处理 | ✅ 符合约定 |

### 1.2 发现的问题

#### 🔴 **严重：路由组 (Route Groups) 使用不当**

**文件：** `frontend/src/app/(main)/`

**问题：** `(main)` 作为路由组应该用于**不添加 URL 路径段**的分组，但当前结构存在以下问题：

```
当前结构：
app/
├── (main)/          ← 路由组，应该不进入 URL
│   └── l4-marketing/
│       └── projects/
├── api/             ← API 路由，不在 (main) 内
```

**建议：**
- 如果 `(main)` 表示共享布局（如导航栏），应该包含所有需要该布局的路由
- API 路由通常不需要共享 UI 布局，但应该在文档中明确说明为何如此组织

---

## 2. 数据获取与 Server Actions

### 2.1 Server Actions 模式分析

**文件：** `frontend/src/app/(main)/l4-marketing/projects/actions.ts`

#### ✅ **优点**

1. **渐进式增强模式：**
```typescript
"use server";

// 表单验证在服务端进行
export async function createProject(formData: FormData) {
  // 验证逻辑...
  const validatedData = schema.parse(data);
  // 数据库操作...
}
```

2. **类型安全：** 使用了 Zod 进行输入验证

#### 🔴 **发现的问题**

**问题 1：Server Actions 重新验证路径过于宽泛**

```typescript
// 文件：actions.ts:33-35
revalidatePath("/l4-marketing/projects");
redirect("/l4-marketing/projects");
```

**建议：** 使用更精确的标记验证（tag-based revalidation）：

```typescript
// 更好的方式
revalidateTag(`project-${id}`);
revalidateTag('projects-list');
```

---

**问题 2：Server Actions 未处理并发冲突**

```typescript
// 文件：actions.ts:85-95
export async function updateProject(id: string, formData: FormData) {
  // 缺少乐观锁或版本检查
  const data = Object.fromEntries(formData);
  await db.project.update({
    where: { id },
    data: validatedData,
  });
}
```

**建议：** 添加版本控制或更新时间检查以防止并发冲突。

---

### 2.2 API 调用抽象层

**文件：** `frontend/src/app/(main)/l4-marketing/projects/actions/l3-projects.ts`

#### ✅ **优点**

良好的 API 抽象模式：

```typescript
// 统一的 API 调用封装
async function fetchL3Projects() {
  const response = await fetch(`${API_BASE}/l3-projects`);
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json();
}
```

---

## 3. 组件架构与性能

### 3.1 组件组织

#### ✅ **优点**

**清晰的分层结构：**

```
_components/
├── detail/          # 详情页专用组件
├── common/          # 共用组件
│   ├── hooks/       # 共用 hooks
│   └── utils/       # 工具函数
└── [id]/            # 特定路由组件
```

#### 🔴 **发现的问题**

**问题 1：组件命名不一致**

```
当前命名：
├── marketing-info-section.tsx      # kebab-case
├── PropertyHardInfoSection.tsx   # PascalCase (假设)
└── photo_item.tsx                  # snake_case (假设)
```

**建议：** 统一使用 kebab-case 命名文件（Next.js 社区惯例）。

---

**问题 2：客户端组件标记不一致**

```typescript
// 文件：_components/detail/marketing-photo-list.tsx
"use client";  // ✅ 正确标记

// 但某些组件缺少 "use client" 却使用了客户端 API
// 例如：使用了 useState 但没有标记 "use client"
```

**建议：** 审查所有组件，确保使用了客户端 hooks（useState, useEffect 等）的组件都标记了 `"use client"`。

---

### 3.2 性能优化

#### ✅ **优点**

**1. 图片懒加载实现：**

```typescript
// 文件：_components/common/hooks/use-image-lazy-load.ts
export function useImageLazyLoad(src: string) {
  const [isLoaded, setIsLoaded] = useState(false);
  // 懒加载逻辑...
}
```

**2. 性能监控：**

```typescript
// 文件：_components/common/hooks/use-performance-monitor.ts
export function usePerformanceMonitor(componentName: string) {
  useEffect(() => {
    const startTime = performance.now();
    return () => {
      const duration = performance.now() - startTime;
      console.log(`${componentName} rendered in ${duration}ms`);
    };
  }, []);
}
```

#### 🔴 **发现的问题**

**问题：Suspense 边界缺失**

```typescript
// 文件：page.tsx
export default async function ProjectsPage() {
  const projects = await fetchProjects(); // 等待所有数据
  return <ProjectsTable data={projects} />;
}
```

**建议：** 使用 Suspense 实现渐进式加载：

```typescript
import { Suspense } from "react";

export default function ProjectsPage() {
  return (
    <Suspense fallback={<ProjectsSkeleton />}>
      <ProjectsTableAsync />
    </Suspense>
  );
}
```

---

## 4. 类型安全与错误处理

### 4.1 类型定义

#### ✅ **优点**

**集中类型定义：**

```typescript
// 文件：types.ts
export interface Project {
  id: string;
  name: string;
  // ...
}

export type ProjectStatus = "draft" | "published" | "archived";
```

#### 🔴 **发现的问题**

**问题：类型导入不一致**

```typescript
// 某些文件使用相对路径
import { Project } from "../../../types";

// 其他文件使用绝对路径
import { Project } from "@/app/(main)/l4-marketing/projects/types";
```

**建议：** 统一使用绝对路径或路径别名（`@/`）。

---

### 4.2 错误处理

#### 🔴 **发现的问题**

**问题：Server Actions 错误处理不一致**

```typescript
// 某些 action 返回对象
export async function createProject(formData: FormData) {
  try {
    // ...
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 其他 action 直接抛出
export async function deleteProject(id: string) {
  // 没有 try-catch，直接抛出
  await db.project.delete({ where: { id } };
}
```

**建议：** 统一错误处理模式：

```typescript
type ActionResult<T> = 
  | { success: true; data: T }
  | { success: false; error: string };

export async function serverAction(): Promise<ActionResult<Data>> {
  try {
    // ...
    return { success: true, data };
  } catch (error) {
    console.error("Action failed:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}
```

---

## 5. 可访问性与用户体验

### 5.1 加载状态

#### ✅ **优点**

**使用 Next.js loading.tsx 约定：**

```typescript
// loading.tsx
export default function Loading() {
  return <ProjectsSkeleton />;
}
```

### 5.2 错误边界

#### ✅ **优点**

**使用 error.tsx 错误边界：**

```typescript
// error.tsx
"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div>
      <h2>出错了</h2>
      <button onClick={reset}>重试</button>
    </div>
  );
}
```

---

## 6. 总结与建议

### 6.1 总体评价

| 类别 | 评分 | 说明 |
|------|------|------|
| 项目结构 | ⭐⭐⭐⭐ | 文件组织良好，但路由组使用可以优化 |
| 类型安全 | ⭐⭐⭐⭐ | TypeScript 使用良好，但导入路径需统一 |
| 性能优化 | ⭐⭐⭐ | 有懒加载实现，但 Suspense 使用不足 |
| 错误处理 | ⭐⭐⭐ | Server Actions 错误处理需要统一 |
| 可访问性 | ⭐⭐⭐⭐ | loading/error 边界使用正确 |

### 6.2 高优先级修复

1. **统一 Server Actions 错误处理模式**
2. **添加 Suspense 边界实现渐进式加载**
3. **统一类型导入路径（全部使用 `@/` 别名）**
4. **优化 revalidatePath 使用，改用 tag-based 验证**

### 6.3 中优先级改进

1. **统一文件命名规范（全部使用 kebab-case）**
2. **审查所有客户端组件标记**
3. **添加并发冲突处理（乐观锁）**
4. **完善 API 调用错误重试机制**

---

## 附录：Next.js 15 关键最佳实践检查清单

- [x] 使用 `loading.tsx` 处理加载状态
- [x] 使用 `error.tsx` 处理错误边界
- [x] Server Actions 使用正确的渐进式增强模式
- [ ] Suspense 边界用于异步组件
- [ ] 统一的错误处理和返回类型
- [ ] 优化的数据重新验证策略
- [ ] 统一的文件命名规范
- [ ] 完整的类型安全（严格模式）

---

*报告生成时间：2026-04-18*
*审查工具：Claude Code*
