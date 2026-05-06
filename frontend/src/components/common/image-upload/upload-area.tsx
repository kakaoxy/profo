"use client";

import { useRef, useState, useCallback, memo } from "react";
import { UploadCloud, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface UploadAreaProps {
  isUploading: boolean;
  disabled: boolean;
  title: string;
  description: string;
  accept: string;
  multiple: boolean;
  onUpload: (files: File[]) => void;
}

export const UploadArea = memo(function UploadArea({
  isUploading,
  disabled,
  title,
  description,
  accept,
  multiple,
  onUpload,
}: UploadAreaProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!isUploading && !disabled) setIsDragging(true);
    },
    [isUploading, disabled]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (isUploading || disabled) return;

      const files = e.dataTransfer.files;
      if (files?.length) {
        onUpload(Array.from(files));
      }
    },
    [isUploading, disabled, onUpload]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.length) {
        onUpload(Array.from(e.target.files));
      }
      e.target.value = "";
    },
    [onUpload]
  );

  const handleClick = useCallback(() => {
    if (!isUploading && !disabled) {
      fileInputRef.current?.click();
    }
  }, [isUploading, disabled]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => e.key === "Enter" && handleClick()}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "relative flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-6 transition-colors cursor-pointer",
        isDragging && "border-primary bg-primary/5",
        isUploading && "pointer-events-none opacity-60",
        disabled && "cursor-not-allowed opacity-50",
        !isDragging &&
          !isUploading &&
          !disabled &&
          "hover:border-primary/50 hover:bg-muted/50"
      )}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple={multiple}
        accept={accept}
        onChange={handleFileSelect}
        className="hidden"
        disabled={isUploading || disabled}
      />

      {isUploading ? (
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">正在上传...</span>
        </div>
      ) : (
        <>
          <UploadCloud className="h-10 w-10 text-muted-foreground" />
          <div className="text-center">
            <p className="text-sm font-medium">{title}</p>
            {description && (
              <p className="mt-1 text-xs text-muted-foreground">{description}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
});
