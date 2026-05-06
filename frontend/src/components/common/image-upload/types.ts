"use client";

import type { UploadResponse } from "@/components/common/upload";

export type ImageStatus = "pending" | "uploading" | "success" | "error";

export interface ImageItem {
  id: string;
  file?: File;
  url: string;
  status: ImageStatus;
  progress: number;
  error?: string;
  objectUrl?: string;
  response?: UploadResponse;
}

export interface ImageUploadProps {
  defaultValue?: ImageItem[];
  onChange?: (items: ImageItem[]) => void;
  maxCount?: number;
  maxSize?: number;
  allowedTypes?: string[];
  maxConcurrency?: number;
  disabled?: boolean;
  title?: string;
  description?: string;
  className?: string;
  gridCols?: number;
  aspectRatio?: string;
  onUploadSuccess?: (item: ImageItem) => void;
  onUploadError?: (item: ImageItem) => void;
  children?: React.ReactNode;
  showUploadArea?: boolean;
}
