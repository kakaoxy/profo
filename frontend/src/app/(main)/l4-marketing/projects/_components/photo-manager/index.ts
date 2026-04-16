/**
 * 照片管理组件库
 * 
 * 此目录包含所有与照片管理相关的组件和hooks
 * 从 [id]/_components/ 迁移至此，以解除跨层级依赖
 */

// 主组件
export { DualPhotoManager } from "./dual-photo-manager";

// 子组件
export { PhotoDragOverlay } from "./photo-drag-overlay";
export { PhotoCategorySelector } from "./photo-category-selector";
export { ImageUploader } from "./image-uploader";
export { MarketingPhotoList } from "./marketing-photo-list";
export { RenovationPhotoList } from "./renovation-photo-list";
export { SortablePhotoItem } from "./sortable-photo-item";
export { DroppableStage } from "./droppable-stage";
export { PhotoLibraryPicker } from "./photo-library-picker";
export { FilterBar } from "./filter-bar";
export { PhotoGrid } from "./photo-grid";
export { PhotoGridItem } from "./photo-grid-item";
export { PickerFooter } from "./picker-footer";

// Hooks
export { useImageUpload, type UploadProgress } from "./use-image-upload";
export { usePhotoDragAndDrop } from "./use-photo-drag-and-drop";

// 类型
export type { RenovationPhoto, StageOption } from "./types";
export { STAGE_OPTIONS } from "./types";
