"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getSourcePhotosAction } from "@/app/(main)/minipro/projects/actions";
import { RenovationPhoto } from "@/app/(main)/minipro/projects/types";
import { toast } from "sonner";
import { getFileUrl } from "@/lib/config";
import { Badge } from "@/components/ui/badge";

interface PhotoPickerProps {
  projectId: string; // Mini Project ID to fetch source photos for reference (if needed in future)
  onSelect: (photo: RenovationPhoto) => void;
  trigger?: React.ReactNode;
  title?: string;
}

export function PhotoPicker({ projectId, onSelect, trigger, title = "Select Photo" }: PhotoPickerProps) {
  const [open, setOpen] = useState(false);
  const [photos, setPhotos] = useState<RenovationPhoto[]>([]);
  const [loading, setLoading] = useState(false);

  const loadPhotos = async () => {
    try {
      setLoading(true);
      const result = await getSourcePhotosAction(projectId);
      if (result.success && result.data) {
        setPhotos(result.data as RenovationPhoto[]);
      } else {
        toast.error(result.error || "获取照片失败");
      }
    } catch (error) {
      console.error(error);
      toast.error("加载源照片失败");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (newOpen && photos.length === 0) {
      loadPhotos();
    }
  };

  const handleSelect = (photo: RenovationPhoto) => {
    onSelect(photo);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger || <Button variant="outline">Select from Source</Button>}
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-1">
          {loading ? (
            <div className="flex justify-center p-8">Loading...</div>
          ) : photos.length === 0 ? (
            <div className="text-center p-8 text-muted-foreground">No source photos available</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {photos.map((photo) => (
                <div 
                  key={photo.id} 
                  className="group relative aspect-square rounded overflow-hidden border bg-slate-50 cursor-pointer hover:border-primary transition-colors"
                  onClick={() => handleSelect(photo)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img 
                    src={getFileUrl(photo.url)} 
                    alt="source" 
                    className="w-full h-full object-cover" 
                  />
                  <div className="absolute top-1 left-1">
                    <Badge variant="secondary" className="bg-black/50 text-white border-0 text-[10px] px-1 h-4">
                      {photo.stage || "Other"}
                    </Badge>
                  </div>
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
