"use client";

import * as React from "react";
import { Building2, MapPin, Maximize, LayoutGrid, Compass, Wallet, Image, Video, AlertCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { API_BASE_URL } from "@/lib/config";
import type { ImportPreviewProps, ImportableMedia } from "./types";

/**
 * 获取完整的媒体URL
 * 处理相对路径和绝对路径
 */
function getFullMediaUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;

  // 如果已经是完整URL，直接返回
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  // 如果是以 / 开头的相对路径，直接拼接
  if (url.startsWith('/')) {
    return `${API_BASE_URL}${url}`;
  }

  // 其他情况，假设是相对路径，添加 /
  return `${API_BASE_URL}/${url}`;
}

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
                    data.unit_price ? `${Number(data.unit_price).toFixed(2)}万元/m²` : "未设置"
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

/**
 * 区块标题组件
 */
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-slate-900 mb-3">{title}</h4>
      {children}
    </div>
  );
}

/**
 * 信息项组件
 */
function InfoItem({
  icon,
  label,
  value,
  muted = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
      <div className="text-slate-400 mt-0.5">{icon}</div>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className={cn("text-sm font-medium", muted ? "text-slate-400" : "text-slate-900")}>
          {value}
        </p>
      </div>
    </div>
  );
}

/**
 * 检测是否为视频文件
 */
function isVideoFile(url: string | undefined): boolean {
  if (!url) return false;
  const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'];
  const lowerUrl = url.toLowerCase();
  return videoExtensions.some(ext => lowerUrl.endsWith(ext));
}

/**
 * 媒体项组件
 */
function MediaItem({
  media,
  selected,
  onToggle,
}: {
  media: ImportableMedia;
  selected: boolean;
  onToggle: () => void;
}) {
  const [loadState, setLoadState] = React.useState<'loading' | 'loaded' | 'error'>('loading');
  const [imageUrl, setImageUrl] = React.useState<string | undefined>(undefined);

  // 处理URL并检测媒体类型
  React.useEffect(() => {
    const rawUrl = media.thumbnail_url || media.file_url;
    const fullUrl = getFullMediaUrl(rawUrl);
    setImageUrl(fullUrl);
    setLoadState('loading');
  }, [media.thumbnail_url, media.file_url]);

  const isVideo = media.media_type === 'video' || isVideoFile(media.file_url);

  return (
    <div
      onClick={onToggle}
      className={cn(
        "relative aspect-square rounded-lg overflow-hidden cursor-pointer border-2 transition-all",
        selected ? "border-blue-500" : "border-transparent"
      )}
    >
      {imageUrl ? (
        <>
          <img
            src={imageUrl}
            alt={media.description || "媒体资源"}
            className={cn(
              "w-full h-full object-cover transition-opacity duration-200",
              loadState === 'loaded' ? "opacity-100" : "opacity-0"
            )}
            onLoad={() => setLoadState('loaded')}
            onError={() => setLoadState('error')}
          />
          
          {/* 加载状态 */}
          {loadState === 'loading' && (
            <div className="absolute inset-0 bg-slate-100 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
            </div>
          )}
          
          {/* 错误状态 */}
          {loadState === 'error' && (
            <div className="absolute inset-0 bg-slate-100 flex flex-col items-center justify-center p-2">
              <AlertCircle className="w-6 h-6 text-slate-400 mb-1" />
              <span className="text-xs text-slate-500 text-center">加载失败</span>
            </div>
          )}
        </>
      ) : (
        <div className="w-full h-full bg-slate-100 flex flex-col items-center justify-center">
          {isVideo ? (
            <Video className="w-8 h-8 text-slate-300" />
          ) : (
            <Image className="w-8 h-8 text-slate-300" />
          )}
        </div>
      )}

      {/* 视频标识 */}
      {isVideo && (
        <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center">
          <Video className="w-3 h-3 text-white" />
        </div>
      )}

      {/* 选中标记 */}
      {selected && (
        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      )}

      {/* 阶段标签 */}
      {media.renovation_stage && (
        <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs px-2 py-1 truncate">
          {media.renovation_stage}
        </div>
      )}
    </div>
  );
}
