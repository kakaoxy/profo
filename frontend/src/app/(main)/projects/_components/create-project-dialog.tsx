"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createProjectAction } from "../actions";
import { components } from "@/lib/api-types";

type ProjectCreate = components["schemas"]["ProjectCreate"];

export function CreateProjectDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // 使用 react-hook-form 管理表单
  const { register, handleSubmit, reset, formState: { errors } } = useForm<ProjectCreate>();

  const onSubmit = async (data: ProjectCreate) => {
    setLoading(true);
    // 简单的类型转换，确保数字字段是数字
    if (data.signing_price) data.signing_price = Number(data.signing_price);
    if (data.area) data.area = Number(data.area);

    const res = await createProjectAction(data);
    setLoading(false);

    if (res.success) {
      toast.success("创建成功");
      setOpen(false);
      reset(); // 重置表单
    } else {
      toast.error(res.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> 新建项目
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>新建项目</DialogTitle>
          <DialogDescription>
            录入新的签约房源信息，初始状态默认为“签约中”。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-red-500 after:content-['*'] after:ml-0.5">项目名称</Label>
              <Input id="name" placeholder="例如：中远两湾城-3-201" {...register("name", { required: true })} />
              {errors.name && <span className="text-xs text-red-500">项目名称必填</span>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="community_name">小区名称</Label>
              <Input id="community_name" {...register("community_name")} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">详细地址</Label>
            <Input id="address" placeholder="街道/楼栋/门牌号" {...register("address")} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="manager">项目负责人</Label>
              <Input id="manager" {...register("manager")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="owner_name">原业主姓名</Label>
              <Input id="owner_name" {...register("owner_name")} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="signing_price">签约价格 (万)</Label>
              <Input id="signing_price" type="number" step="0.01" {...register("signing_price")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="area">产证面积 (㎡)</Label>
              <Input id="area" type="number" step="0.01" {...register("area")} />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
             <div className="space-y-2">
              <Label htmlFor="signing_date">签约日期</Label>
              <Input id="signing_date" type="date" {...register("signing_date")} />
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              确认创建
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}