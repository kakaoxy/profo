"use client";

import { useState, useMemo } from "react";
import { Loader2, Merge } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { components } from "@/lib/api-types";
import { mergeCommunitiesAction } from "./actions";

// 使用 OpenAPI 生成的类型
type Community = components["schemas"]["CommunityResponse"];

interface MergeDialogProps {
  selectedCommunities: Community[];
  onSuccess?: () => void; // 合并成功后的回调（如清空选项）
}

export function MergeDialog({ selectedCommunities, onSuccess }: MergeDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [primaryId, setPrimaryId] = useState<string>("");
  const [isMerging, setIsMerging] = useState(false);

  // 计算属性：总房源数
  const totalProperties = useMemo(() => {
    return selectedCommunities.reduce((sum, c) => sum + (c.total_properties || 0), 0);
  }, [selectedCommunities]);

  // 计算属性：即将被删除的小区列表
  const communitiesToDelete = useMemo(() => {
    if (!primaryId) return [];
    return selectedCommunities.filter((c) => String(c.id) !== primaryId);
  }, [selectedCommunities, primaryId]);

  const handleMerge = async () => {
    if (!primaryId) {
      toast.error("请选择保留的主小区");
      return;
    }

    const pid = parseInt(primaryId);
    // 获取所有非主小区的 ID
    const mergeIds = selectedCommunities
      .filter((c) => c.id !== pid)
      .map((c) => c.id);

    setIsMerging(true);
    try {
      const result = await mergeCommunitiesAction(pid, mergeIds);

      if (result.success) {
        toast.success("合并成功", {
          description: `已将数据合并，影响 ${result.affected_properties} 套房源`,
        });
        setIsOpen(false);
        setPrimaryId("");
        onSuccess?.(); // 通知父组件清空选择
      } else {
        toast.error("合并失败", { description: result.message });
      }
    } catch (error) {
        console.error(error)
      toast.error("请求失败");
    } finally {
      setIsMerging(false);
    }
  };

  const isButtonDisabled = selectedCommunities.length < 2;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button disabled={isButtonDisabled} variant="default">
          <Merge className="mr-2 h-4 w-4" />
          合并所选 ({selectedCommunities.length})
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>合并小区数据</DialogTitle>
          <DialogDescription>
            将多个重复的小区合并为一个。合并后，旧小区的房源将自动迁移到新小区，旧小区将被标记为删除。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          {/* 1. 选择主小区 */}
          <div className="grid gap-2">
            <Label htmlFor="primary-community" className="text-sm font-medium">
              请选择保留的主小区 (数据将合并到此处)
            </Label>
            <Select value={primaryId} onValueChange={setPrimaryId}>
              <SelectTrigger id="primary-community">
                <SelectValue placeholder="选择保留的小区..." />
              </SelectTrigger>
              <SelectContent>
                {selectedCommunities.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name} (ID: {c.id}, 房源: {c.total_properties})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 2. 预览影响 */}
          {primaryId && (
            <div className="space-y-4">
              <div className="rounded-md bg-slate-50 p-3 text-sm">
                <p className="font-medium mb-2">将被删除的小区 ({communitiesToDelete.length}个):</p>
                <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                  {communitiesToDelete.map((c) => (
                    <li key={c.id}>{c.name}</li>
                  ))}
                </ul>
              </div>

              <Alert variant="destructive">
                <AlertTitle className="flex items-center gap-2">
                  <span className="font-bold">⚠️ 不可撤销操作</span>
                </AlertTitle>
                <AlertDescription>
                  合并后，预计共有 <span className="font-bold">{totalProperties}</span> 套房源将归属于主小区。
                  <br />
                  被合并的小区记录将被软删除。
                </AlertDescription>
              </Alert>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isMerging}>
            取消
          </Button>
          <Button onClick={handleMerge} disabled={!primaryId || isMerging} variant="destructive">
            {isMerging && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            确认合并
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}