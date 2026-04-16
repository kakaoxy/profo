"use client";

import * as React from "react";
import {
  Building2,
  MapPin,
  Maximize,
  LayoutGrid,
  Compass,
  Wallet,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Section } from "./Section";
import { InfoItem } from "./InfoItem";
import { MediaItem } from "./MediaItem";
import type { ImportPreviewProps } from "./types";

/**
 * 导入预览组件
 * 展示从L3项目导入的数据预览
 */
export function ImportPreview({
  data,
  onConfirm,
  onCancel,
  loading = false,
}: ImportPreviewProps) {
  const [selectedMedia, setSelectedMedia] = React.useState<Set<string>>(
    new Set(data.available_media.map((m) => m.id))
  );

  // 切换媒体选择
  const toggleMedia = (mediaId: string) => {
    setSelectedMedia((prev) => {
      const next = new Set(prev);
      if (next.has(mediaId)) {
        next.delete(mediaId);
      } else {
        next.add(mediaId);
      }
      return next;
    });
  };

  // 全选/取消全选
  const toggleAllMedia = () => {
    if (selectedMedia.size === data.available_media.length) {
      setSelectedMedia(new Set());
    } else {
      setSelectedMedia(new Set(data.available_media.map((m) => m.id)));
    }
  };

  const handleConfirm = () => {
    onConfirm();
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] sm:max-h-[85vh] grid-rows-[auto_1fr_auto] gap-0 overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>导入数据预览</DialogTitle>
        </DialogHeader>

        <ScrollArea className="min-h-0 overflow-hidden py-2 px-6">
          <div className="space-y-6">
            <Section title="基本信息">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InfoItem
                  icon={<Building2 className="w-4 h-4" />}
                  label="小区名称"
                  value={data.community_name}
                />
                <InfoItem
                  icon={<MapPin className="w-4 h-4" />}
                  label="楼层信息"
                  value={data.floor_info || "未设置"}
                  muted={!data.floor_info}
                />
                <InfoItem
                  icon={<LayoutGrid className="w-4 h-4" />}
                  label="户型"
                  value={data.layout || "未设置"}
                  muted={!data.layout}
                />
                <InfoItem
                  icon={<Compass className="w-4 h-4" />}
                  label="朝向"
                  value={data.orientation || "未设置"}
                  muted={!data.orientation}
                />
              </div>
            </Section>

            <Section title="面积与价格">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <InfoItem
                  icon={<Maximize className="w-4 h-4" />}
                  label="面积"
                  value={data.area ? `${data.area}m²` : "未设置"}
                  muted={!data.area}
                />
                <InfoItem
                  icon={<Wallet className="w-4 h-4" />}
                  label="总价"
                  value={data.total_price ? `${data.total_price}万元` : "未设置"}
                  muted={!data.total_price}
                />
                <InfoItem
                  icon={<Wallet className="w-4 h-4" />}
                  label="单价"
                  value={
                    data.unit_price
                      ? `${Number(data.unit_price).toFixed(2)}万元/m²`
                      : "未设置"
                  }
                  muted={!data.unit_price}
                />
              </div>
            </Section>

            <Section title="营销信息">
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-sm font-medium text-slate-700">标题</p>
                <p className="text-sm text-slate-900 mt-1">{data.title}</p>
              </div>
            </Section>

            {data.available_media.length > 0 && (
              <Section
                title={`媒体资源 (${selectedMedia.size}/${data.available_media.length})`}
              >
                <div className="flex items-center gap-2 mb-3">
                  <Checkbox
                    checked={selectedMedia.size === data.available_media.length}
                    onCheckedChange={toggleAllMedia}
                  />
                  <span className="text-sm text-slate-600">全选</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {data.available_media.map((media) => (
                    <MediaItem
                      key={media.id}
                      media={media}
                      selected={selectedMedia.has(media.id)}
                      onToggle={() => toggleMedia(media.id)}
                    />
                  ))}
                </div>
              </Section>
            )}
          </div>
        </ScrollArea>

        <div className="flex items-center justify-end gap-2 px-6 py-3 border-t bg-white">
          <Button variant="outline" onClick={onCancel} disabled={loading} size="sm">
            取消
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={loading}
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 flex-1 sm:flex-none"
          >
            {loading ? "导入中..." : "确认导入"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
