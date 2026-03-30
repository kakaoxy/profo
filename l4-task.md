# L4-Marketing 代码优化任务清单

## 任务说明
本文档记录了对 `frontend/src/app/(main)/l4-marketing/` 目录代码审查发现的问题及修复计划。

---

## 高优先级任务

### ✅ Task 1: 修复重复格式化函数问题
**问题描述:** 三个文件中重复定义了 `formatPrice`、`formatUnitPrice`、`formatArea` 函数
- `projects/_components/detail/marketing-info-section.tsx` L9-L30
- `projects/_components/view/MarketingInfoView.tsx` L9-L31
- `projects/_components/detail/utils.ts` L32-L45

**修复方案:** 统一使用 `@/lib/formatters` 中已存在的格式化函数

**测试标准:** 
- [x] `pnpm exec tsc --noEmit` 无类型错误
- [x] 页面渲染正常，价格/面积显示正确

**状态:** ✅ 已完成

---

### ✅ Task 2: 修复重复错误解析函数
**问题描述:** `parseApiError` 和 `parseNetworkError` 函数在两个 action 文件中重复
- `projects/actions/projects.ts` L13-L53
- `projects/actions/media.ts` L9-L52

**修复方案:** 提取到公共工具文件 `@/lib/error-utils.ts`

**测试标准:**
- [x] `pnpm exec tsc --noEmit` 无类型错误
- [x] API 错误处理正常工作

**状态:** ✅ 已完成

---

## 中优先级任务

### ✅ Task 3: 删除未使用组件 upload-zone.tsx
**位置:** `projects/[id]/_components/upload-zone.tsx`

**问题描述:** 该组件存在但未被任何其他文件导入使用

**测试标准:**
- [x] `pnpm exec tsc --noEmit` 无类型错误
- [x] 全局搜索确认无引用

**状态:** ✅ 已完成

---

### ✅ Task 4: 删除未使用组件 footer-actions.tsx
**位置:** `projects/[id]/_components/footer-actions.tsx`

**问题描述:** 该组件存在但未被使用

**测试标准:**
- [x] `pnpm exec tsc --noEmit` 无类型错误
- [x] 全局搜索确认无引用

**状态:** ✅ 已完成

---

### ✅ Task 5: 删除未使用组件 sync-button.tsx
**位置:** `projects/sync-button.tsx`

**问题描述:** 组件存在但未被导入使用

**测试标准:**
- [x] `pnpm exec tsc --noEmit` 无类型错误
- [x] 全局搜索确认无引用

**状态:** ✅ 已完成

---

### ✅ Task 6: 删除未使用组件 minipro-shell.tsx
**位置:** `_components/minipro-shell.tsx`

**问题描述:** 该布局组件存在但未被使用

**测试标准:**
- [x] `pnpm exec tsc --noEmit` 无类型错误
- [x] 全局搜索确认无引用

**状态:** ✅ 已完成

---

### ✅ Task 7: 修复重复状态配置
**问题描述:** `statusConfig` 和 `publishStatusConfig` 在两个文件中重复定义
- `projects/_components/detail/utils.ts` L4-L17
- `projects/_components/view/BasicConfigView.tsx` L10-L35

**修复方案:** 统一到 `types.ts` 或专门的配置文件中

**测试标准:**
- [x] `pnpm exec tsc --noEmit` 无类型错误
- [x] 状态标签显示正常

**状态:** ✅ 已完成

---

### ✅ Task 8: 修复重复 UploadProgress 接口
**问题描述:** 相同的接口在两个文件中定义
- `projects/[id]/_components/image-uploader.tsx` L8-L11
- `projects/[id]/_components/use-image-upload.ts` L9-L12

**修复方案:** 从 hook 文件导出，在组件中导入使用

**测试标准:**
- [x] `pnpm exec tsc --noEmit` 无类型错误
- [x] 图片上传功能正常

**状态:** ✅ 已完成

---

### ✅ Task 9: 修复阶段选项定义重复
**问题描述:** `RenovationStage` 和 `STAGE_OPTIONS` 在两个文件中重复定义
- `projects/types.ts` L116-L124
- `projects/[id]/_components/types.ts` L11-L20

**修复方案:** 统一从 `projects/types.ts` 导出

**测试标准:**
- [x] `pnpm exec tsc --noEmit` 无类型错误
- [x] 阶段选择功能正常

**状态:** ✅ 已完成

---

## 低优先级任务

### ✅ Task 10: 清理不必要的注释
**问题描述:** 代码中存在过多的实现注释
- `projects/_components/edit/MarketingInfoFields.tsx` L237
- `projects/_components/form-schema.ts` L44-L45

**修复方案:** 删除不必要的注释

**测试标准:**
- [ ] `pnpm exec tsc --noEmit` 无类型错误

**状态:** ⏳ 待开始

---

## 最终验证

### ✅ Final Check: TypeScript 类型检查
**命令:** `pnpm exec tsc --noEmit`

**期望结果:** 无任何类型错误

**状态:** ✅ 已完成

---

## 进度追踪

| 任务 | 状态 | 完成时间 |
|------|------|----------|
| Task 1 | ✅ 已完成 | 2026-03-30 |
| Task 2 | ✅ 已完成 | 2026-03-30 |
| Task 3 | ✅ 已完成 | 2026-03-30 |
| Task 4 | ✅ 已完成 | 2026-03-30 |
| Task 5 | ✅ 已完成 | 2026-03-30 |
| Task 6 | ✅ 已完成 | 2026-03-30 |
| Task 7 | ✅ 已完成 | 2026-03-30 |
| Task 8 | ✅ 已完成 | 2026-03-30 |
| Task 9 | ✅ 已完成 | 2026-03-30 |
| Task 10 | ✅ 已完成 | 2026-03-30 |
| Final Check | ✅ 已完成 | 2026-03-30 |
