# L4 市场营销层代码修复清单

> 生成时间: 2026-03-27
> 审查范围: backend/models/l4_marketing.py, schemas/l4_marketing.py, services/l4_marketing_service.py, routers/l4_marketing.py
> 审查范围: frontend/src/app/(main)/minipro/

---

## 修复进度概览

| 优先级 | 问题数量 | 已完成 | 进行中 | 待修复 |
|--------|----------|--------|--------|--------|
| 🔴 P0-紧急 | 3 | 3 | 0 | 0 |
| 🟠 P1-高 | 3 | 0 | 0 | 3 |
| 🟡 P2-中 | 4 | 1 | 0 | 3 |
| 🟢 P3-低 | 4 | 0 | 0 | 4 |

---

## 🔴 P0-紧急 (立即修复)

### P0-001: 文件行数超标 - columns.tsx

- **问题描述**: columns.tsx 文件共 315 行，超过项目规范规定的 250 行限制
- **影响范围**: frontend/src/app/(main)/minipro/projects/columns.tsx
- **严重程度**: 🔴 高 - 违反项目硬性规范
- **初步解决方案**:
  1. 将 ActionCell 组件拆分到单独文件: `action-cell.tsx`
  2. 将格式化函数 (formatPrice, formatUnitPrice, formatArea) 提取到工具文件
  3. 将列定义拆分为独立文件或按功能分组
- **状态**: ✅ 已完成
- **验证方式**: 修复后文件行数 193 行 <= 250 行，TypeScript 检查通过
- **备注**:
  - 创建了 `frontend/src/lib/formatters.ts` 工具文件
  - 创建了 `frontend/src/app/(main)/minipro/projects/_components/action-cell.tsx`
  - columns.tsx 从 315 行减少到 193 行 

### P0-002: 文件行数超标 - actions.ts

- **问题描述**: actions.ts 文件共 351 行，超过项目规范规定的 250 行限制
- **影响范围**: frontend/src/app/(main)/minipro/projects/actions.ts
- **严重程度**: 🔴 高 - 违反项目硬性规范
- **初步解决方案**:
  1. 按功能模块拆分: projects-actions.ts 和 media-actions.ts
  2. 或者创建 actions/ 目录，按功能拆分多个文件
- **状态**: ✅ 已完成
- **验证方式**: 修复后每个文件行数 <= 250 行，功能正常
- **备注**:
  - 创建了 `actions/index.ts` (23行) - 统一导出
  - 创建了 `actions/projects.ts` (175行) - 项目相关 actions
  - 创建了 `actions/media.ts` (174行) - 媒体相关 actions
  - 原 actions.ts 改为兼容导出 (23行)
  - 所有文件均符合 <= 250 行规范 

### P0-003: 文件行数超标 - preview/page.tsx

- **问题描述**: preview/page.tsx 文件共 327 行，超过项目规范规定的 250 行限制
- **影响范围**: frontend/src/app/(main)/minipro/projects/[id]/preview/page.tsx
- **严重程度**: 🔴 高 - 违反项目硬性规范
- **初步解决方案**:
  1. 将格式化函数提取到工具文件
  2. 将 UI 组件（如 Hero 部分、Sidebar 部分）拆分为独立组件
  3. 创建 preview/_components/ 目录存放子组件
- **状态**: ✅ 已完成
- **验证方式**: 修复后文件行数 193 行 <= 250 行，页面渲染正常
- **备注**:
  - 创建了 `preview/_components/hero-gallery.tsx` (146行)
  - 创建了 `preview/_components/property-specs.tsx` (58行)
  - 创建了 `preview/_components/property-info.tsx` (68行)
  - 创建了 `preview/_components/price-sidebar.tsx` (119行)
  - page.tsx 从 327 行减少到 193 行 

---

## 🟠 P1-高 (本周修复)

### P1-001: 前后端类型不一致 - images 字段

- **问题描述**: 后端 images 字段为逗号分隔的字符串，前端使用数组，转换逻辑复杂且容易出错
- **影响范围**: 
  - 后端: schemas/l4_marketing.py (L4MarketingProjectCreate.images)
  - 前端: form-schema.ts, 多个表单组件
- **严重程度**: 🟠 高 - 增加维护成本，容易出错
- **初步解决方案**:
  1. 方案A: 后端添加数组格式的接受支持（保持向后兼容）
  2. 方案B: 前端统一使用字符串格式，在表单层做转换
  3. 推荐方案A，更符合现代 API 设计
- **状态**: ⬜ 待修复
- **验证方式**: 前后端类型一致，表单提交和显示正常
- **备注**: 

### P1-002: 前后端类型不一致 - tags 字段

- **问题描述**: 后端 tags 字段为逗号分隔的字符串，前端使用数组
- **影响范围**: 
  - 后端: schemas/l4_marketing.py
  - 前端: form-schema.ts, TagInputField 组件
- **严重程度**: 🟠 高 - 与 images 字段问题相同
- **初步解决方案**: 同 P1-001，保持与 images 字段处理一致
- **状态**: ⬜ 待修复
- **验证方式**: 标签添加、编辑、显示功能正常
- **备注**: 

### P1-003: 目录命名不符合规范

- **问题描述**: 前端目录使用 `minipro` 命名，不符合项目 L1-L4 层级命名规范
- **影响范围**: frontend/src/app/(main)/minipro/
- **严重程度**: 🟠 高 - 影响项目结构一致性
- **初步解决方案**:
  1. 将 `minipro` 重命名为 `l4-marketing`
  2. 更新所有相关导入路径
  3. 检查并更新路由配置
- **状态**: ⬜ 待修复
- **验证方式**: 目录重命名后，所有页面和组件正常加载
- **备注**: 此修改影响范围大，需要谨慎执行

---

## 🟡 P2-中 (两周内修复)

### P2-001: 重复代码 - 格式化函数

- **问题描述**: formatPrice, formatUnitPrice, formatArea 函数在多个文件中重复定义
- **影响范围**: 
  - columns.tsx (第27-48行)
  - preview/page.tsx (第11-32行)
  - 其他可能使用这些函数的文件
- **严重程度**: 🟡 中 - 违反 DRY 原则
- **初步解决方案**:
  1. 创建 `frontend/src/lib/formatters.ts` 工具文件
  2. 统一导出所有格式化函数
  3. 替换所有重复定义的地方
- **状态**: ⬜ 待修复
- **验证方式**: 所有使用格式化函数的地方功能正常
- **备注**: 

### P2-002: 图片加载无优化

- **问题描述**: 使用原生 `img` 标签而非 Next.js `Image` 组件，缺少自动优化
- **影响范围**: columns.tsx (第151行), preview/page.tsx (多处)
- **严重程度**: 🟡 中 - 影响性能和用户体验
- **初步解决方案**:
  1. 替换所有 `img` 标签为 Next.js `Image` 组件
  2. 配置适当的 width/height 或 fill 属性
  3. 添加 placeholder 和 loading 优化
- **状态**: ⬜ 待修复
- **验证方式**: 图片正常加载，Lighthouse 性能评分提升
- **备注**: 

### P2-003: 枚举类定义不规范

- **问题描述**: 枚举类继承 `str` 的方式不是 Python 标准做法
- **影响范围**: 
  - backend/models/l4_marketing.py (第14-25行)
  - backend/schemas/l4_marketing.py (第15-31行)
- **严重程度**: 🟡 中 - 代码风格问题
- **初步解决方案**:
  ```python
  from enum import Enum
  
  class PublishStatus(str, Enum):
      DRAFT = "草稿"
      PUBLISHED = "发布"
  ```
- **状态**: ⬜ 待修复
- **验证方式**: 枚举功能正常，类型检查通过
- **备注**: 

### P2-004: 错误处理不够完善

- **问题描述**: actions.ts 中所有错误都被统一处理为"网络错误"，无法区分具体错误类型
- **影响范围**: frontend/src/app/(main)/minipro/projects/actions.ts
- **严重程度**: 🟡 中 - 影响调试和用户体验
- **初步解决方案**:
  1. 创建错误类型区分逻辑
  2. 根据错误类型返回不同的错误信息
  3. 保留原始错误信息用于调试
- **状态**: ⬜ 待修复
- **验证方式**: 不同类型的错误显示不同的提示信息
- **备注**: 

---

## 🟢 P3-低 (后续优化)

### P3-001: 服务层行数接近限制

- **问题描述**: l4_marketing_service.py 共 283 行，接近 250 行限制
- **影响范围**: backend/services/l4_marketing_service.py
- **严重程度**: 🟢 低 - 当前未超标但需关注
- **初步解决方案**:
  1. 监控后续开发，避免继续增长
  2. 如需扩展，拆分为 project_service.py 和 media_service.py
- **状态**: ⬜ 待修复
- **验证方式**: 后续开发注意控制行数
- **备注**: 当前可不处理，作为技术债务记录

### P3-002: 类型定义重复

- **问题描述**: L4MarketingProject 类型在前端进行了不必要的扩展
- **影响范围**: frontend/src/app/(main)/minipro/projects/types.ts (第10-13行)
- **严重程度**: 🟢 低 - 轻微冗余
- **初步解决方案**:
  1. 检查后端 Schema 是否已包含 community_name
  2. 如已包含，移除前端扩展
  3. 如未包含，考虑后端添加
- **状态**: ⬜ 待修复
- **验证方式**: 类型定义简化，功能正常
- **备注**: 

### P3-003: 类型处理不够严谨

- **问题描述**: page.tsx 中错误处理使用了复杂的类型断言
- **影响范围**: frontend/src/app/(main)/minipro/projects/page.tsx (第46-51行)
- **严重程度**: 🟢 低 - 代码可读性问题
- **初步解决方案**:
  1. 定义明确的 ApiError 接口
  2. 使用类型守卫函数替代复杂断言
- **状态**: ⬜ 待修复
- **验证方式**: 类型检查通过，代码更清晰
- **备注**: 

### P3-004: XSS 潜在风险

- **问题描述**: tags 渲染存在理论上的 XSS 风险
- **影响范围**: frontend/src/app/(main)/minipro/projects/[id]/preview/page.tsx
- **严重程度**: 🟢 低 - React 默认转义，风险较低
- **初步解决方案**:
  1. 确认 React 自动转义已足够
  2. 或添加额外的内容过滤
- **状态**: ⬜ 待修复
- **验证方式**: 安全扫描通过
- **备注**: 可暂不处理，React 默认已提供保护

---

## 修复执行记录

### 2026-03-27

| 任务ID | 操作 | 状态 | 备注 |
|--------|------|------|------|
| - | 创建修复清单 | ✅ 完成 | 初始版本 |
| P0-001 | 修复 columns.tsx 行数超标 | ✅ 完成 | 从 315 行减少到 193 行 |
| P0-002 | 修复 actions.ts 行数超标 | ✅ 完成 | 拆分为 actions/projects.ts 和 actions/media.ts |
| P0-003 | 修复 preview/page.tsx 行数超标 | ✅ 完成 | 从 327 行减少到 193 行 |
| - | TypeScript 类型检查 | ✅ 通过 | pnpm exec tsc --noEmit 无错误 |
| P2-001 | 重复代码 - 格式化函数 | ✅ 完成 | 创建 lib/formatters.ts 统一导出 |
| - | 修复 Build Error | ✅ 完成 | 修复 actions.ts 和 actions/*.ts 文件末尾换行符问题 |

---

## 附录：验证命令

```bash
# TypeScript 类型检查
cd frontend && pnpm exec tsc --noEmit

# 后端类型检查
cd backend && mypy .

# 运行测试
# 后端: pytest
# 前端: pnpm test
```

---

## 附录：文件清单

### 后端文件
- backend/models/l4_marketing.py
- backend/schemas/l4_marketing.py
- backend/services/l4_marketing_service.py
- backend/routers/l4_marketing.py

### 前端文件
- frontend/src/app/(main)/minipro/projects/columns.tsx
- frontend/src/app/(main)/minipro/projects/actions.ts
- frontend/src/app/(main)/minipro/projects/[id]/preview/page.tsx
- frontend/src/app/(main)/minipro/projects/_components/form-schema.ts
- frontend/src/app/(main)/minipro/projects/types.ts
- frontend/src/app/(main)/minipro/projects/page.tsx
