"use client";

import { UploadCloud, Plus, Loader2, Trash2, Eye } from "lucide-react";
import { RenovationPhoto } from "../../../../../types";
import { getFileUrl } from "../../../utils";
import { Progress } from "@/components/ui/progress"; // [New] Import Progress component
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// [New] Define the structure for a photo currently being uploaded
export interface UploadingPhoto {
  id: string; // Temporary ID
  file: File; // Raw file object
  previewUrl: string; // Local Blob URL
  progress: number; // 0-100
  status: "uploading" | "error";
}

interface PhotoGridProps {
  photos: RenovationPhoto[];
  uploadingPhotos?: UploadingPhoto[]; // [New] Accept uploading queue
  isCurrent: boolean;
  isFuture: boolean;
  isLoading: boolean;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDelete: (photoId: string) => void;
}

export function PhotoGrid({
  photos,
  uploadingPhotos = [], // Default to empty array
  isCurrent,
  isFuture,
  isLoading,
  onUpload,
  onDelete,
}: PhotoGridProps) {
  // Helper: Render the uploading (optimistic) item
  const renderUploadingItem = (item: UploadingPhoto) => (
    <div
      key={item.id}
      className="aspect-square relative rounded-md overflow-hidden bg-slate-50 border border-slate-200"
    >
      {/* Local Preview Image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.previewUrl}
        alt="Uploading..."
        className="object-cover w-full h-full opacity-60 blur-[1px] transition-all"
      />

      {/* Progress Overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/10 z-10 p-2 gap-2">
        {item.status === "error" ? (
          <span className="text-xs text-white bg-red-500/90 px-2 py-1 rounded font-medium">
            Upload Failed
          </span>
        ) : (
          <>
            <Loader2 className="h-6 w-6 animate-spin text-white drop-shadow-md" />
            <div className="w-full px-2">
              <Progress
                value={item.progress}
                className="h-1.5 w-full bg-white/40"
                // You might need to check your Progress component API for indicator styling
                // or ensure standard shadcn/ui Progress works here
              />
            </div>
            <span className="text-[10px] text-white font-medium drop-shadow-md">
              {item.progress}%
            </span>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
      {/* 1. Server Photos (Existing Logic) */}
      {photos.map((photo) => (
        <Dialog key={photo.id}>
          <div className="aspect-square relative group rounded-md overflow-hidden bg-slate-100 border border-slate-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={getFileUrl(photo.url)}
              alt={photo.filename || "Renovation Photo"}
              className="object-cover w-full h-full hover:scale-105 transition-transform duration-500 cursor-pointer"
            />

            {/* Hover Mask */}
            <DialogTrigger asChild>
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors cursor-pointer flex items-center justify-center">
                <Eye className="text-white opacity-0 group-hover:opacity-100 w-6 h-6 drop-shadow-md" />
              </div>
            </DialogTrigger>

            {/* Delete Button */}
            {!isFuture && (
              <div
                className="absolute top-1 right-1 z-20 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      className="bg-white/90 p-1.5 rounded-full text-red-500 hover:bg-red-50 hover:text-red-600 shadow-sm transition-colors"
                      title="Delete Photo"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Are you sure you want to delete this photo?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This action will delete the photo record. If physical
                        deletion is configured, the file will also be removed.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => onDelete(photo.id)}
                        className="bg-red-600 hover:bg-red-700"
                      >
                        Confirm Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </div>

          {/* Large Preview Modal */}
          <DialogContent className="max-w-3xl border-none bg-transparent shadow-none p-0">
            <DialogTitle className="sr-only">
              Photo Preview - {photo.filename || "Untitled"}
            </DialogTitle>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={getFileUrl(photo.url)}
              alt="Large Preview"
              className="w-full h-auto rounded-lg shadow-2xl"
            />
          </DialogContent>
        </Dialog>
      ))}

      {/* 2. [New] Uploading Photos (Optimistic UI) */}
      {uploadingPhotos.map(renderUploadingItem)}

      {/* 3. Upload Button */}
      {!isFuture && (
        <label className="aspect-square rounded-md border-2 border-dashed border-slate-200 bg-white hover:bg-slate-50 hover:border-primary/50 cursor-pointer flex flex-col items-center justify-center transition-colors text-muted-foreground hover:text-primary gap-1 relative overflow-hidden">
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={onUpload}
            // Note: We typically don't disable the input during optimistic uploads
            // unless we want to strictly enforce one-at-a-time.
            // Keeping it consistent with your 'isLoading' logic for now.
            disabled={isLoading}
          />
          {isLoading ? (
            // This loading state usually comes from 'submitting stage',
            // not the photo upload itself anymore (since photos have their own progress bars)
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          ) : isCurrent ? (
            <UploadCloud className="h-6 w-6" />
          ) : (
            <Plus className="h-6 w-6" />
          )}
          <span className="text-xs font-medium">
            {isLoading ? "Processing" : isCurrent ? "Upload" : "Add More"}
          </span>
        </label>
      )}
    </div>
  );
}
