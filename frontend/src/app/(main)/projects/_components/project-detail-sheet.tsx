import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Project } from "../types";

// 后端 API /projects/{id} 返回的详细结构

interface ProjectDetailSheetProps {
  project: Project | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ProjectDetailSheet({ project, isOpen, onClose }: ProjectDetailSheetProps) {
  if (!project) return null;

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-xl flex items-center gap-2">
            {project.name}
            <Badge variant="outline">{project.status}</Badge>
          </SheetTitle>
          <SheetDescription>
            项目 ID: {project.id} | 创建时间: {new Date(project.created_at).toLocaleDateString()}
          </SheetDescription>
        </SheetHeader>

        <div className="py-6 space-y-6">
          {/* 基础信息 */}
          <section className="space-y-3">
            <h4 className="font-semibold text-sm text-muted-foreground">基础信息</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">小区：</span>
                {project.community_name}
              </div>
              <div>
                <span className="text-muted-foreground">负责人：</span>
                {project.manager || "-"}
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground">地址：</span>
                {project.address || "-"}
              </div>
            </div>
          </section>

          <Separator />

          {/* 交易信息 */}
          <section className="space-y-3">
            <h4 className="font-semibold text-sm text-muted-foreground">交易数据</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">签约价：</span>
                <span className="font-medium">¥ {project.signing_price} 万</span>
              </div>
              <div>
                <span className="text-muted-foreground">签约日期：</span>
                {project.signing_date ? new Date(project.signing_date).toLocaleDateString() : "-"}
              </div>
              <div>
                <span className="text-muted-foreground">业主：</span>
                {project.owner_name}
              </div>
              <div>
                <span className="text-muted-foreground">联系方式：</span>
                {project.owner_phone}
              </div>
            </div>
          </section>

          <Separator />

          {/* 销售状态 */}
          <section className="space-y-3">
            <h4 className="font-semibold text-sm text-muted-foreground">销售情况</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">挂牌价：</span>
                {project.list_price ? `¥ ${project.list_price} 万` : "-"}
              </div>
              <div>
                <span className="text-muted-foreground">成交价：</span>
                {project.soldPrice ? <span className="text-green-600">¥ {project.soldPrice} 万</span> : "-"}
              </div>
            </div>
          </section>
          
          <Separator />
          
          <div className="text-xs text-muted-foreground">
             更多详细数据（如装修进度、带看记录）请点击列表中的“数据监控”按钮进入详情页。
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}