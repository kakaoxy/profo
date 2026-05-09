# 前端代码质量迭代计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 消除前端代码库中的重复实现、硬编码配置和架构不一致问题，统一格式化函数、状态颜色系统和公共组件复用。

**Architecture:** 按依赖关系分层推进：先建立统一的基础层（格式化函数、常量、状态系统），再逐模块替换引用，最后处理架构层面的重构。每个任务聚焦单一模块/文件，避免跨模块混合改动。

**Tech Stack:** Next.js 16 + React 19 + TypeScript + shadcn/ui + Tailwind CSS + date-fns + Zod

---

## 依赖关系总览

```
Phase 1 (基础层)
  T01 ──→ T02 ──→ T03 ──→ T04
                                ──→ Phase 2 (替换层)
  T05                                 T06, T07, T08, T09, T10, T11
                                        ──→ Phase 3 (重构层)
                                          T12, T13, T14
                                            ──→ Phase 4 (增强层)
                                              T15, T16, T17
```

---

## Phase 1: 基础层 — 建立统一入口

### T01: 统一格式化函数到 `lib/formatters.ts`

**优先级:** P0  
**前置条件:** 无  
**关联报告:** 问题一 (#2) — P0-1

**任务描述:** 将 `lib/formatters.ts` 确立为唯一格式化函数入口。统一 `formatPrice`、`formatArea` 语义，添加 `formatCurrency`、`formatRelativeTime`、`formatFileSize` 函数。使用 `date-fns` 的 `formatDistanceToNow` 实现相对时间。

**Files:**
- Modify: `frontend/src/lib/formatters.ts`

**Step 1: 在 `lib/formatters.ts` 中添加 `formatCurrency`**

将 `_lib/format-utils.ts` 中的 `formatCurrency` 逻辑统一进来，以"万"为单位的版本作为标准（与 `formatPrice` 一致）：

```typescript
export function formatCurrency(amount?: number | string): string {
  if (amount === undefined || amount === null || amount === "") return "-";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "-";
  if (num >= 10000) {
    return `${(num / 10000).toFixed(1).replace(/\.0$/, "")}万`;
  }
  return num.toLocaleString();
}
```

**Step 2: 在 `lib/formatters.ts` 中添加 `formatRelativeTime`（基于 date-fns）**

```typescript
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";

export function formatRelativeTime(dateStr: string): string {
  if (!dateStr) return "-";
  try {
    return formatDistanceToNow(new Date(dateStr), { locale: zhCN, addSuffix: true });
  } catch {
    return "-";
  }
}
```

**Step 3: 在 `lib/formatters.ts` 中添加 `formatFileSize`**

采用 `upload/utils.ts` 的版本（有空格，更规范）：

```typescript
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
```

**Step 4: 运行类型检查**

```bash
cd frontend && pnpm exec tsc --noEmit
```

Expected: PASS（仅新增函数，不影响现有代码）

**Step 5: Commit**

```bash
git add frontend/src/lib/formatters.ts
git commit -m "feat: add formatCurrency, formatRelativeTime, formatFileSize to lib/formatters.ts"
```

**验收标准:**
- [x] `lib/formatters.ts` 包含 `formatPrice`、`formatUnitPrice`、`formatArea`、`formatNumber`、`formatCurrency`、`formatRelativeTime`、`formatFileSize`
- [x] `formatRelativeTime` 使用 `date-fns` 的 `formatDistanceToNow`
- [x] 类型检查通过

---

### T02: 创建 `lib/constants.ts` 统一常量

**优先级:** P1  
**前置条件:** 无  
**关联报告:** 问题二 (#3) — P1-4

**任务描述:** 创建 `lib/constants.ts`，提取图片上传相关的散落常量。

**Files:**
- Create: `frontend/src/lib/constants.ts`

**Step 1: 创建常量文件**

```typescript
export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

export const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
```

**Step 2: 运行类型检查**

```bash
cd frontend && pnpm exec tsc --noEmit
```

Expected: PASS

**Step 3: Commit**

```bash
git add frontend/src/lib/constants.ts
git commit -m "feat: create lib/constants.ts with image upload constants"
```

**验收标准:**
- [x] `lib/constants.ts` 存在并导出 `ALLOWED_IMAGE_TYPES` 和 `MAX_IMAGE_SIZE`
- [x] 类型检查通过

---

### T03: 替换 `_lib/format-utils.ts` 中的重复函数

**优先级:** P0  
**前置条件:** T01  
**关联报告:** 问题一 (#2) — P0-1

**任务描述:** 将 `_lib/format-utils.ts` 改为从 `lib/formatters.ts` re-export，消除独立实现。

**Files:**
- Modify: `frontend/src/app/(main)/_lib/format-utils.ts`

**Step 1: 重写 `_lib/format-utils.ts` 为 re-export**

```typescript
export { formatCurrency, formatRelativeTime } from "@/lib/formatters";
```

**Step 2: 全局搜索所有从 `_lib/format-utils` 导入的文件，确认无破坏性变更**

```bash
cd frontend && rg "from.*_lib/format-utils" src/
```

确认所有消费者使用 `formatCurrency` 和 `formatRelativeTime` 的签名不变。

**Step 3: 运行类型检查**

```bash
cd frontend && pnpm exec tsc --noEmit
```

Expected: PASS

**Step 4: Commit**

```bash
git add frontend/src/app/(main)/_lib/format-utils.ts
git commit -m "refactor: replace _lib/format-utils with re-exports from lib/formatters"
```

**验收标准:**
- [x] `_lib/format-utils.ts` 仅包含 re-export，无独立实现
- [x] 所有消费者无类型错误
- [x] `formatRelativeTime` 现在输出 date-fns 风格（如 "3 分钟前" 而非 "3分钟前"）

---

### T04: 替换 L4 `detail/utils.ts` 中的重复函数

**优先级:** P0  
**前置条件:** T01, T05（statusConfig 部分需先迁移）  
**关联报告:** 问题一 (#2) — P0-1, 问题四 (#5) — P0

**任务描述:** 删除 L4 `detail/utils.ts` 中的 `formatPrice`、`formatArea`、`getRelativeTime`，改为从 `lib/formatters.ts` 导入。删除本地 `statusConfig` 和 `publishStatusConfig`，改用全局 `status-colors.ts` 系统。

**Files:**
- Modify: `frontend/src/app/(main)/l4-marketing/projects/_components/detail/utils.ts`

**Step 1: 找到所有从 `detail/utils.ts` 导入的文件**

```bash
cd frontend && rg "from.*detail/utils" src/app/(main)/l4-marketing/
```

列出所有消费者及其使用的导出。

**Step 2: 重写 `detail/utils.ts`**

保留 `formatDate`（全局无此函数）和从 `../common/utils` 的 re-export。其他函数改为从 `@/lib/formatters` 和 `@/lib/status-colors` 导入并 re-export：

```typescript
"use client";

import { formatPrice, formatArea, formatRelativeTime } from "@/lib/formatters";
import { getStatusStyleConfig } from "@/lib/status-colors";

export { formatPrice, formatArea, formatRelativeTime };

export function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return "-";
  }
}

export function getStatusConfig(status: string) {
  return getStatusStyleConfig(status);
}

export function getPublishStatusConfig(status: string): {
  label: string;
  className: string;
} {
  if (status === "发布") return { label: "已发布", className: "bg-green-100 text-green-700" };
  if (status === "草稿") return { label: "草稿", className: "bg-gray-100 text-gray-700" };
  return { label: status, className: "bg-muted text-muted-foreground" };
}

export { getFileUrl, getOptimizedImageUrl, preloadImage, preloadImages } from "../common/utils";
```

**Step 3: 确认消费者兼容性**

逐一检查 L4 详情页中使用 `formatPrice` 的位置，确认"万"单位的输出是否符合预期。如果 L4 详情页展示的原始数据单位是"元"（需要除以 10000），则需在调用处做转换，而非在格式化函数中。

**Step 4: 运行类型检查**

```bash
cd frontend && pnpm exec tsc --noEmit
```

Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/app/(main)/l4-marketing/projects/_components/detail/utils.ts
git commit -m "refactor: replace duplicate formatters and statusConfig in L4 detail/utils.ts"
```

**验收标准:**
- [x] `detail/utils.ts` 中不再有独立的 `formatPrice`、`formatArea`、`getRelativeTime` 实现
- [x] `statusConfig` 已删除，改用 `getStatusStyleConfig`
- [x] `publishStatusConfig` 保留（全局系统暂无此映射），但改为函数形式
- [x] 所有 L4 消费者无类型错误

---

### T05: 将 `publishStatusConfig` 纳入全局状态系统

**优先级:** P1  
**前置条件:** 无  
**关联报告:** 问题四 (#5) — P1

**任务描述:** 在 `lib/status-colors.ts` 中添加 `PUBLISH_STATUS_CONFIG`，统一管理发布/草稿状态。

**Files:**
- Modify: `frontend/src/lib/status-colors.ts`

**Step 1: 在 `status-colors.ts` 中添加发布状态配置**

在文件末尾（`getStatusStyleConfig` 之后）添加：

```typescript
export const PUBLISH_STATUS_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
  published: { label: "已发布", className: "bg-green-100 text-green-700" },
  draft: { label: "草稿", className: "bg-gray-100 text-gray-700" },
};

export function getPublishStatusConfig(status: string): {
  label: string;
  className: string;
} {
  return (
    PUBLISH_STATUS_CONFIG[status] ?? {
      label: status,
      className: "bg-muted text-muted-foreground",
    }
  );
}
```

**Step 2: 运行类型检查**

```bash
cd frontend && pnpm exec tsc --noEmit
```

Expected: PASS

**Step 3: Commit**

```bash
git add frontend/src/lib/status-colors.ts
git commit -m "feat: add PUBLISH_STATUS_CONFIG to global status system"
```

**验收标准:**
- [x] `status-colors.ts` 导出 `PUBLISH_STATUS_CONFIG` 和 `getPublishStatusConfig`
- [x] 类型检查通过

---

## Phase 2: 替换层 — 消除各模块的重复实现

### T06: 替换 `project-card-status.ts` 使用全局状态系统

**优先级:** P0  
**前置条件:** T01 完成（无直接依赖，但应在基础层之后）  
**关联报告:** 问题四 (#5) — P0

**任务描述:** 删除 `project-card-status.ts` 中的本地 `statusMap`，改用全局 `status-colors.ts` 的 `getProjectStatusClassName` 和 `getStatusLabel`。

**Files:**
- Modify: `frontend/src/app/(main)/_components/project-card-status.ts`
- Modify: 消费此文件的组件（需搜索确认）

**Step 1: 找到所有导入 `project-card-status` 的文件**

```bash
cd frontend && rg "from.*project-card-status" src/
```

**Step 2: 重写 `project-card-status.ts`**

```typescript
import { getStatusLabel, getProjectStatusClassName } from "@/lib/status-colors";

export function getStatusDisplay(status: string): { label: string; color: string } {
  return {
    label: getStatusLabel(status),
    color: getProjectStatusClassName(status),
  };
}
```

**Step 3: 更新消费者**

检查 Step 1 中找到的所有消费者，将 `statusMap[status]` 用法替换为 `getStatusDisplay(status)`。

**Step 4: 运行类型检查**

```bash
cd frontend && pnpm exec tsc --noEmit
```

Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/app/(main)/_components/project-card-status.ts
git commit -m "refactor: replace local statusMap with global status-colors system"
```

**验收标准:**
- [x] `project-card-status.ts` 中不再有硬编码的 `statusMap`
- [x] Dashboard 项目卡片状态标签和颜色与项目列表页一致
- [x] 类型检查通过

---

### T07: 替换 Leads 图片上传为通用 `ImageUpload` 组件

**优先级:** P1  
**前置条件:** T02（需 `lib/constants.ts` 中的常量）  
**关联报告:** 问题二 (#3) — P1-1

**任务描述:** 将 `leads/_components/add-lead-parts/image-upload.tsx` 替换为使用 `components/common/image-upload/` 的 `ImageUpload` 组件。

**Files:**
- Modify: `frontend/src/app/(main)/leads/_components/add-lead-parts/image-upload.tsx`
- Modify: 父组件中对此组件的引用（如果 props 需要调整）

**Step 1: 分析接口差异**

Leads 版本：`images: string[]` → `onChange: (images: string[]) => void`  
通用版本：通过 `onImagesChange` 回调返回 `ImageItem[]`

需要在 Leads 父组件中做 `ImageItem[]` → `string[]` 的转换（提取 `response.url`）。

**Step 2: 重写 Leads image-upload 为通用组件封装**

```tsx
"use client";

import { ImageUpload } from "@/components/common/image-upload";
import type { ImageItem } from "@/components/common/image-upload";

interface LeadImageUploadProps {
  images: string[];
  onChange: (images: string[]) => void;
  maxImages?: number;
}

export function LeadImageUpload({ images, onChange, maxImages = 9 }: LeadImageUploadProps) {
  const handleImagesChange = (items: ImageItem[]) => {
    const urls = items
      .filter((item) => item.status === "success" && item.response?.url)
      .map((item) => item.response!.url);
    onChange(urls);
  };

  return (
    <ImageUpload
      images={images.map((url, index) => ({
        id: `existing-${index}`,
        url,
        status: "success" as const,
        response: { url },
      }))}
      onImagesChange={handleImagesChange}
      maxImages={maxImages}
    />
  );
}
```

**Step 3: 运行类型检查**

```bash
cd frontend && pnpm exec tsc --noEmit
```

Expected: PASS

**Step 4: 手动验证**

启动前端应用，进入 Leads 新增页面，测试图片上传、预览、删除功能。

**Step 5: Commit**

```bash
git add frontend/src/app/(main)/leads/_components/add-lead-parts/image-upload.tsx
git commit -m "refactor: replace Leads image-upload with common ImageUpload component"
```

**验收标准:**
- [x] Leads 新增/编辑线索的图片上传功能正常
- [x] 图片上传后 URL 正确保存到 `string[]`
- [x] 已有图片正确显示和删除
- [x] 删除约 150 行重复代码

---

### T08: 替换 L4 `ImagePreviewDialog` 为通用 `ImagePreview`

**优先级:** P1  
**前置条件:** T01（通用 ImagePreview 可能需要小幅扩展接口）  
**关联报告:** 问题六 (#6) — P1-2

**任务描述:** 扩展通用 `ImagePreview` 组件支持 `imageUrl?: string` 参数，然后将 L4 的 `image-preview-dialog.tsx` 替换为通用组件。

**Files:**
- Modify: `frontend/src/components/common/image-upload/image-preview.tsx`
- Modify: `frontend/src/components/common/image-upload/types.ts`
- Modify: `frontend/src/app/(main)/l4-marketing/projects/_components/detail/` 中使用 `ImagePreviewDialog` 的文件

**Step 1: 扩展 `ImagePreview` 的 props**

在 `types.ts` 的 `ImagePreviewProps` 中添加 `imageUrl?: string` 字段：

```typescript
export interface ImagePreviewProps {
  item: ImageItem | null;
  imageUrl?: string;
  onClose: () => void;
}
```

**Step 2: 修改 `image-preview.tsx` 支持 `imageUrl`**

```tsx
const displayUrl = imageUrl || (item ? item.response?.url || item.url : null);

if (!displayUrl) return null;

// ... 在 Image src 中使用 displayUrl
```

**Step 3: 替换 L4 中所有 `ImagePreviewDialog` 的引用**

```bash
cd frontend && rg "ImagePreviewDialog" src/app/(main)/l4-marketing/
```

将每个引用替换为：
```tsx
import { ImagePreview } from "@/components/common/image-upload";

// 替换前:
<ImagePreviewDialog imageUrl={previewUrl} onClose={() => setPreviewUrl(null)} />

// 替换后:
<ImagePreview item={null} imageUrl={previewUrl} onClose={() => setPreviewUrl(null)} />
```

**Step 4: 删除 `image-preview-dialog.tsx`**

**Step 5: 运行类型检查**

```bash
cd frontend && pnpm exec tsc --noEmit
```

Expected: PASS

**Step 6: Commit**

```bash
git add -A frontend/src/components/common/image-upload/ frontend/src/app/(main)/l4-marketing/projects/_components/detail/
git commit -m "refactor: replace L4 ImagePreviewDialog with common ImagePreview"
```

**验收标准:**
- [x] 通用 `ImagePreview` 支持 `imageUrl` 参数
- [x] L4 详情页图片预览功能正常（全屏弹窗、关闭）
- [x] `image-preview-dialog.tsx` 已删除
- [x] 类型检查通过

---

### T09: 替换 `attachment-types.ts` 中的 `formatFileSize`

**优先级:** P1  
**前置条件:** T01  
**关联报告:** 问题一 (#2) — P1

**任务描述:** 删除 `attachment-types.ts` 中的 `formatFileSize`，改为从 `lib/formatters.ts` 导入。

**Files:**
- Modify: `frontend/src/app/(main)/projects/_components/create-project/attachment-types.ts`

**Step 1: 替换导入**

在 `attachment-types.ts` 顶部添加：
```typescript
import { formatFileSize } from "@/lib/formatters";
```

删除本地的 `formatFileSize` 函数定义（约 5 行）。

**Step 2: 搜索 `attachment-types.ts` 中 `formatFileSize` 的消费者，确认无破坏**

```bash
cd frontend && rg "formatFileSize.*from.*attachment-types" src/
```

如果有外部消费者，需同步更新导入。

**Step 3: 运行类型检查**

```bash
cd frontend && pnpm exec tsc --noEmit
```

Expected: PASS

**Step 4: Commit**

```bash
git add frontend/src/app/(main)/projects/_components/create-project/attachment-types.ts
git commit -m "refactor: replace local formatFileSize with lib/formatters import"
```

**验收标准:**
- [x] `attachment-types.ts` 中不再有 `formatFileSize` 函数定义
- [x] 项目创建页附件上传的大小显示格式一致
- [x] 类型检查通过

---

### T10: 替换 `upload/utils.ts` 中的 `formatFileSize`

**优先级:** P1  
**前置条件:** T01  
**关联报告:** 问题一 (#2) — P1

**任务描述:** 删除 `upload/utils.ts` 中的 `formatFileSize`，改为从 `lib/formatters.ts` 导入并 re-export（保持 API 兼容）。

**Files:**
- Modify: `frontend/src/components/common/upload/utils.ts`

**Step 1: 替换实现为 re-export**

在 `upload/utils.ts` 中删除 `formatFileSize` 函数定义，改为：
```typescript
export { formatFileSize } from "@/lib/formatters";
```

**Step 2: 运行类型检查**

```bash
cd frontend && pnpm exec tsc --noEmit
```

Expected: PASS

**Step 3: Commit**

```bash
git add frontend/src/components/common/upload/utils.ts
git commit -m "refactor: replace upload/utils formatFileSize with lib/formatters re-export"
```

**验收标准:**
- [x] `upload/utils.ts` 中不再有 `formatFileSize` 函数定义
- [x] 所有通过 `@/components/common/upload` 使用 `formatFileSize` 的代码无破坏
- [x] 文件大小显示格式统一（有空格版本）

---

### T11: 图片上传常量统一引用

**优先级:** P1  
**前置条件:** T02  
**关联报告:** 问题二 (#3) — P1-4

**任务描述:** 将所有硬编码的 `ALLOWED_IMAGE_TYPES` 和 `MAX_IMAGE_SIZE` 替换为从 `lib/constants.ts` 导入。

**Files:**
- Modify: `frontend/src/components/common/upload/types.ts`（如有硬编码）
- Modify: `frontend/src/components/common/image-upload/use-image-upload.ts`（如有硬编码）
- Modify: `frontend/src/app/(main)/l4-marketing/projects/_components/photo-manager/use-image-upload.ts`（如有硬编码）
- Modify: `frontend/src/app/(main)/leads/_components/add-lead-parts/image-upload.tsx`（如有硬编码）

**Step 1: 搜索所有硬编码的图片类型和大小常量**

```bash
cd frontend && rg "image/jpeg|image/png|image/gif|image/webp" src/ --type ts --type tsx
cd frontend && rg "10.*1024.*1024|10485760" src/ --type ts --type tsx
```

**Step 2: 逐一替换**

在每个文件中将硬编码值替换为：
```typescript
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_SIZE } from "@/lib/constants";
```

**Step 3: 运行类型检查**

```bash
cd frontend && pnpm exec tsc --noEmit
```

Expected: PASS

**Step 4: Commit**

```bash
git add -A frontend/src/
git commit -m "refactor: replace hardcoded image constants with lib/constants imports"
```

**验收标准:**
- [x] 所有文件中不再有硬编码的图片 MIME 类型数组
- [x] 所有文件中不再有硬编码的 10MB 常量
- [x] 上传验证功能不受影响
- [x] 类型检查通过

---

## Phase 3: 重构层 — 提升架构一致性

### T12: LeadDrawer 改用 shadcn `Sheet`

**优先级:** P2  
**前置条件:** T06（状态颜色已统一，LeadDrawer 中可能使用状态相关展示）  
**关联报告:** 问题三 (#4) — P2-1

**任务描述:** 将 `lead-drawer.tsx` 中的自定义 CSS 动画替换为 shadcn `<Sheet>` 组件。

**Files:**
- Modify: `frontend/src/app/(main)/leads/_components/lead-drawer.tsx`

**Step 1: 分析当前 LeadDrawer 的自定义实现**

当前实现：固定定位遮罩 + `translate-x` 动画 + 右侧面板。

**Step 2: 重写为 shadcn Sheet**

```tsx
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export function LeadDrawer({ lead, isOpen, onClose, ... }: LeadDrawerProps) {
  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:w-[550px] md:w-[650px] p-0">
        <SheetHeader className="sr-only">
          <SheetTitle>线索详情</SheetTitle>
        </SheetHeader>
        {/* 原有内容 */}
      </SheetContent>
    </Sheet>
  );
}
```

**Step 3: 删除自定义遮罩和动画 CSS**

删除 `bg-black/40` 遮罩 div 和 `translate-x` 相关的 CSS/类名。

**Step 4: 运行类型检查 + 手动验证**

```bash
cd frontend && pnpm exec tsc --noEmit
```

手动验证：打开 Lead 详情面板，确认打开/关闭动画、遮罩、内容显示正常。

**Step 5: Commit**

```bash
git add frontend/src/app/(main)/leads/_components/lead-drawer.tsx
git commit -m "refactor: replace LeadDrawer custom CSS animation with shadcn Sheet"
```

**验收标准:**
- [x] LeadDrawer 使用 shadcn `<Sheet>` 组件
- [x] 打开/关闭动画平滑
- [x] 遮罩层行为正确（点击遮罩关闭）
- [x] 面板内所有 Tab、内容显示正常
- [x] 删除约 50 行自定义 CSS/遮罩代码

---

### T13: Dashboard `project-card-*` 文件合并

**优先级:** P2  
**前置条件:** T06（`project-card-status.ts` 已改造完成）  
**关联报告:** 问题七 (#7) — P2-2

**任务描述:** 将 9 个 `project-card-*` 文件合并为 3 个：`types.ts`、`utils.ts`、`mapper.ts`。

**Files:**
- Create: `frontend/src/app/(main)/_components/project-card/types.ts`
- Create: `frontend/src/app/(main)/_components/project-card/utils.ts`
- Create: `frontend/src/app/(main)/_components/project-card/mapper.ts`
- Create: `frontend/src/app/(main)/_components/project-card/index.ts`
- Delete: 9 个 `project-card-*` 文件
- Modify: 所有导入这些文件的消费者

**Step 1: 列出所有消费者**

```bash
cd frontend && rg "from.*project-card-" src/ --type ts --type tsx
```

**Step 2: 规划合并策略**

| 新文件 | 来源 |
|--------|------|
| `types.ts` | `project-card-types.ts` + `project-card-validation.ts` 的类型相关部分 |
| `utils.ts` | `project-card-date.ts` + `project-card-status.ts` + `project-card-stats.ts` + `project-card-validation.ts` 的验证函数 |
| `mapper.ts` | `project-card-mapper.ts`（保持不变） |
| `index.ts` | 统一导出 + `project-card-client.tsx` + `project-card-list.tsx` |

**Step 3: 创建新文件**

将对应内容合并到新文件中，确保所有导出名称不变。

**Step 4: 更新所有消费者的导入路径**

```bash
# 将所有 project-card-xxx 导入替换为 project-card/xxx 或 project-card
```

**Step 5: 删除旧文件**

```bash
Remove-Item frontend/src/app/(main)/_components/project-card-types.ts
Remove-Item frontend/src/app/(main)/_components/project-card-validation.ts
Remove-Item frontend/src/app/(main)/_components/project-card-date.ts
Remove-Item frontend/src/app/(main)/_components/project-card-status.ts
Remove-Item frontend/src/app/(main)/_components/project-card-stats.ts
Remove-Item frontend/src/app/(main)/_components/project-card-mapper.ts
Remove-Item frontend/src/app/(main)/_components/project-card-utils.ts
Remove-Item frontend/src/app/(main)/_components/project-card-client.tsx
Remove-Item frontend/src/app/(main)/_components/project-card-list.tsx
```

**Step 6: 运行类型检查**

```bash
cd frontend && pnpm exec tsc --noEmit
```

Expected: PASS

**Step 7: Commit**

```bash
git add -A frontend/src/app/(main)/_components/
git commit -m "refactor: consolidate 9 project-card files into project-card/ directory"
```

**验收标准:**
- [x] 旧的 9 个 `project-card-*` 文件已删除
- [x] 新的 `project-card/` 目录包含 3 个逻辑文件 + 1 个 barrel + 2 个组件
- [x] 所有消费者导入路径已更新
- [x] Dashboard 项目卡片功能不变
- [x] 类型检查通过

---

### T14: 创建 `TableActionCell` 通用组件

**优先级:** P2  
**前置条件:** 无  
**关联报告:** 问题九 (#10) — P2

**任务描述:** 在 `components/common/` 中创建 `TableActionCell` 组件，统一操作列的样式和交互模式。

**Files:**
- Create: `frontend/src/components/common/table-action-cell.tsx`
- Modify: `frontend/src/components/common/index.ts`（添加导出）

**Step 1: 定义组件接口**

```typescript
interface ActionDef {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: "ghost" | "default" | "destructive";
  disabled?: boolean;
  confirm?: { title: string; description?: string };
}

interface TableActionCellProps {
  actions: ActionDef[];
}
```

**Step 2: 实现组件**

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { DeleteConfirmButton } from "@/components/common/delete-confirm-button";

export function TableActionCell({ actions }: TableActionCellProps) {
  return (
    <div className="flex items-center gap-1">
      {actions.map((action, i) =>
        action.confirm ? (
          <DeleteConfirmButton
            key={i}
            onConfirm={action.onClick}
            variant="ghost"
            size="sm"
            {...action.confirm}
          >
            {action.label}
          </DeleteConfirmButton>
        ) : (
          <Button
            key={i}
            variant={action.variant ?? "ghost"}
            size="sm"
            onClick={action.onClick}
            disabled={action.disabled}
          >
            {action.icon}
            {action.label}
          </Button>
        )
      )}
    </div>
  );
}
```

**Step 3: 添加到 barrel 导出**

在 `components/common/index.ts` 中添加 `TableActionCell` 导出。

**Step 4: 运行类型检查**

```bash
cd frontend && pnpm exec tsc --noEmit
```

Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/components/common/table-action-cell.tsx frontend/src/components/common/index.ts
git commit -m "feat: create TableActionCell common component"
```

**验收标准:**
- [x] `TableActionCell` 组件存在并支持 `actions` 配置
- [x] 支持确认弹窗（通过 `confirm` 字段）
- [x] 已添加到 `components/common/index.ts` 导出
- [x] 类型检查通过

---

## Phase 4: 增强层 — 降低新代码成本

### T15: 创建 `EmptyState` 通用组件

**优先级:** P3  
**前置条件:** 无  
**关联报告:** 问题八 (#8) — P3-1

**任务描述:** 在 `components/common/` 中创建 `EmptyState` 组件，统一空状态 UI。

**Files:**
- Create: `frontend/src/components/common/empty-state.tsx`
- Modify: `frontend/src/components/common/index.ts`

**Step 1: 定义组件**

```tsx
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-12 text-center", className)}>
      {icon && <div className="mb-3 text-muted-foreground">{icon}</div>}
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      {description && <p className="mt-1 text-xs text-muted-foreground/70">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
```

**Step 2: 添加到 barrel 导出**

**Step 3: 运行类型检查**

```bash
cd frontend && pnpm exec tsc --noEmit
```

Expected: PASS

**Step 4: Commit**

```bash
git add frontend/src/components/common/empty-state.tsx frontend/src/components/common/index.ts
git commit -m "feat: create EmptyState common component"
```

**验收标准:**
- [x] `EmptyState` 支持 `icon`、`title`、`description`、`action` 属性
- [x] 已添加到 barrel 导出
- [x] 类型检查通过

---

### T16: 替换各处空状态为 `EmptyState`

**优先级:** P3  
**前置条件:** T15  
**关联报告:** 问题八 (#8) — P3-1

**任务描述:** 将项目中散落的自定义空状态替换为通用 `EmptyState` 组件。

**Files:**
- Modify: `frontend/src/app/(main)/projects/_components/project-detail/views/default/tabs/attachments-tab.tsx`
- Modify: `frontend/src/app/(main)/l4-marketing/projects/_components/detail/photos-section.tsx`
- Modify: `frontend/src/components/ui/data-table.tsx`

**Step 1: 搜索所有空状态 UI**

```bash
cd frontend && rg "暂无|无数据|no data|empty" src/ --type tsx -l
```

**Step 2: 逐一替换**

对每个文件：
1. 导入 `EmptyState`
2. 将自定义空状态标记替换为 `<EmptyState icon={...} title="..." description="..." />`
3. 选择匹配当前场景的图标（如 `ImageOff`、`FileX`、`Inbox`）

**Step 3: 运行类型检查**

```bash
cd frontend && pnpm exec tsc --noEmit
```

Expected: PASS

**Step 4: Commit**

```bash
git add -A frontend/src/
git commit -m "refactor: replace custom empty states with common EmptyState component"
```

**验收标准:**
- [x] 至少 3 处空状态已替换为 `EmptyState`
- [x] 替换后视觉效果一致或改善
- [x] 类型检查通过

---

### T17: 创建 `ConfirmDialog` 通用包装

**优先级:** P3  
**前置条件:** 无  
**关联报告:** 问题九 (#10) — P3-2

**任务描述:** 创建 `ConfirmDialog` 通用组件，封装 Dialog + loading + 确认/取消的样板代码。

**Files:**
- Create: `frontend/src/components/common/confirm-dialog.tsx`
- Modify: `frontend/src/components/common/index.ts`

**Step 1: 定义组件接口**

```typescript
interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => Promise<void>;
  loading?: boolean;
  children?: React.ReactNode;
}
```

**Step 2: 实现组件**

```tsx
"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "确认",
  cancelLabel = "取消",
  onConfirm,
  children,
}: ConfirmDialogProps) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button onClick={handleConfirm} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 3: 添加到 barrel 导出**

**Step 4: 运行类型检查**

```bash
cd frontend && pnpm exec tsc --noEmit
```

Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/components/common/confirm-dialog.tsx frontend/src/components/common/index.ts
git commit -m "feat: create ConfirmDialog common component"
```

**验收标准:**
- [x] `ConfirmDialog` 支持 async `onConfirm`、loading 状态、自定义按钮文本
- [x] 已添加到 barrel 导出
- [x] 类型检查通过

---

## 任务总览

| ID | 描述 | 优先级 | 前置条件 | 关联报告 | 预估改动 |
|----|------|--------|----------|----------|----------|
| T01 | 统一格式化函数到 `lib/formatters.ts` | P0 | 无 | #2 P0-1 | +40 行 |
| T02 | 创建 `lib/constants.ts` 统一常量 | P1 | 无 | #3 P1-4 | +10 行 |
| T03 | 替换 `_lib/format-utils.ts` | P0 | T01 | #2 P0-1 | -25 行 |
| T04 | 替换 L4 `detail/utils.ts` 重复函数 | P0 | T01, T05 | #2 P0-1, #5 P0 | -50 行 |
| T05 | `publishStatusConfig` 纳入全局系统 | P1 | 无 | #5 P1 | +20 行 |
| T06 | `project-card-status.ts` 用全局系统 | P0 | 无 | #5 P0 | -8 行 |
| T07 | Leads 图片上传用通用组件 | P1 | T02 | #3 P1-1 | -150 行 |
| T08 | L4 `ImagePreviewDialog` 用通用组件 | P1 | T01 | #6 P1-2 | -39 行 |
| T09 | `attachment-types.ts` 的 `formatFileSize` | P1 | T01 | #2 P1 | -5 行 |
| T10 | `upload/utils.ts` 的 `formatFileSize` | P1 | T01 | #2 P1 | -10 行 |
| T11 | 图片上传常量统一引用 | P1 | T02 | #3 P1-4 | -20 行 |
| T12 | LeadDrawer 改用 shadcn Sheet | P2 | T06 | #4 P2-1 | -50 行 |
| T13 | Dashboard `project-card-*` 文件合并 | P2 | T06 | #7 P2-2 | 重组 |
| T14 | 创建 `TableActionCell` 通用组件 | P2 | 无 | #10 P2 | +40 行 |
| T15 | 创建 `EmptyState` 通用组件 | P3 | 无 | #8 P3-1 | +20 行 |
| T16 | 替换各处空状态为 `EmptyState` | P3 | T15 | #8 P3-1 | 净减 |
| T17 | 创建 `ConfirmDialog` 通用包装 | P3 | 无 | #10 P3-2 | +50 行 |

**预计净删除代码: ~300 行重复实现，新增 ~180 行统一基础设施**
