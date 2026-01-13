"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { 
  MiniProject, 
  Consultant, 
  MiniProjectPhoto
} from "../types";
import { 
  updateMiniProjectAction, 
  addMiniPhotoAction, 
  deleteMiniPhotoAction,
  refreshMiniProjectAction
} from "../actions";
import { Button } from "@/components/ui/button";
import { 
  Form, 
  FormControl, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage 
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { getFileUrl } from "@/lib/config";
import { cn } from "@/lib/utils";

import { formSchema, FormValues } from "./schema";

interface MiniProjectEditFormProps {
  project: MiniProject;
  consultants: Consultant[];
  initialPhotos: MiniProjectPhoto[];
}

export function MiniProjectEditForm({ project, consultants, initialPhotos }: MiniProjectEditFormProps) {
  const router = useRouter();
  const [photos, setPhotos] = useState<MiniProjectPhoto[]>(initialPhotos);
  const [tagInput, setTagInput] = useState("");
  const [activeStage, setActiveStage] = useState<string>("all");

  // Local font injection to avoid modifying layout.tsx
  useEffect(() => {
    if (!document.getElementById("material-symbols-font")) {
      const link = document.createElement("link");
      link.id = "material-symbols-font";
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap";
      document.head.appendChild(link);
    }
  }, []);
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: project.title || "",
      cover_image: project.cover_image || null,
      style: project.style || null,
      description: project.description || null,
      marketing_tags: Array.isArray(project.marketing_tags) ? project.marketing_tags : [],
      share_title: project.share_title || null,
      share_image: project.share_image || null,
      consultant_id: project.consultant_id || null,
      is_published: !!project.is_published,
      sort_order: project.sort_order ?? 0,
    },
  });

  const onSubmit = async (values: FormValues) => {
    try {
      const submitValues = {
        ...values,
        consultant_id: (values.consultant_id === "none" || !values.consultant_id) ? null : values.consultant_id
      };
      
      const result = await updateMiniProjectAction(project.id, submitValues);
      if (result.success) {
        toast.success("项目更新成功");
        router.refresh();
      } else {
        toast.error(result.error || "更新失败");
      }
    } catch {
      toast.error("更新失败");
    }
  }

  const handleSaveDraft = async () => {
    form.setValue("is_published", false);
    const values = form.getValues();
    await onSubmit(values);
  };

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const val = tagInput.trim().replace(/,$/, "");
      const currentTags = form.getValues("marketing_tags") || [];
      if (val && !currentTags.includes(val)) {
        form.setValue("marketing_tags", [...currentTags, val], { shouldDirty: true });
      }
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => {
    const currentTags = form.getValues("marketing_tags") || [];
    form.setValue("marketing_tags", currentTags.filter(t => t !== tag), { shouldDirty: true });
  };

  const handleRefresh = async () => {
    try {
      const result = await refreshMiniProjectAction(project.id);
      if (result.success) {
        toast.success("项目数据已重刷新");
        router.refresh();
      } else {
        toast.error(result.error || "刷新失败");
      }
    } catch {
      toast.error("刷新失败");
    }
  };

  const handleAddPhotoByUrl = async () => {
    const url = prompt("请输入图片URL");
    if (!url) return;
    try {
      const result = await addMiniPhotoAction(project.id, url, "other");
      if (result.success && result.data) {
        setPhotos(prev => [...prev, result.data as MiniProjectPhoto]);
        toast.success("照片已添加");
      } else {
        toast.error(result.error || "添加照片失败");
      }
    } catch {
       toast.error("添加照片失败");
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    if (!confirm("确定删除这张照片吗？")) return;
    try {
      const result = await deleteMiniPhotoAction(photoId);
      if (result.success) {
        setPhotos(prev => prev.filter(p => p.id !== photoId));
        toast.success("照片已删除");
      } else {
        toast.error(result.error || "删除照片失败");
      }
    } catch {
      toast.error("删除照片失败");
    }
  };

  const stages: { label: string; value: string }[] = [
    { label: "全部", value: "all" },
    { label: "签约", value: "signing" },
    { label: "硬装", value: "renovating" },
    { label: "在售", value: "selling" },
    { label: "已售", value: "sold" },
    { label: "其他", value: "other" },
  ];

  const filteredPhotos = activeStage === "all" 
    ? photos 
    : photos.filter(p => p.renovation_stage === activeStage);

  return (
    <div className="flex-1 flex flex-col bg-[#f0f2f5] font-sans">
      <style jsx global>{`
        .material-symbols-outlined {
          font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
        }
      `}</style>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col h-full">
          {/* Header */}
          <header className="bg-white border-b border-[#e5e7eb] px-8 py-4 sticky top-0 z-10 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button 
                type="button"
                onClick={() => router.back()}
                className="hover:bg-gray-100 p-1 rounded-full transition-colors"
              >
                <span className="material-symbols-outlined text-[#111827]">arrow_back</span>
              </button>
              <div>
                <h1 className="text-xl font-bold text-[#111827]">编辑小程序项目</h1>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="hidden md:flex items-center gap-1.5 text-sm text-[#6b7280] border-r border-[#e5e7eb] pr-6">
                <span className="material-symbols-outlined text-lg">visibility</span>
                <span>浏览量: {project.view_count || 0}</span>
              </div>
              <div className="flex items-center gap-3 bg-gray-50 px-3 py-1.5 rounded-lg border border-[#e5e7eb]">
                <span className="text-xs font-bold text-[#6b7280]">发布状态</span>
                <FormField
                  control={form.control}
                  name="is_published"
                  render={({ field }) => (
                    <FormItem className="flex items-center space-y-0">
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          className="data-[state=checked]:bg-[#137fec]"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
              <div className="flex items-center gap-3">
                <Button 
                  type="button" 
                  variant="outline" 
                  className="px-4 py-2 border-[#e5e7eb] text-sm font-bold rounded-lg hover:bg-gray-50 transition-colors h-10 text-[#111827]"
                  onClick={handleSaveDraft}
                >
                  保存草稿
                </Button>
                <Button 
                  type="submit"
                  className="px-6 py-2 bg-[#137fec] text-white text-sm font-bold rounded-lg hover:bg-blue-600 transition-shadow shadow-sm shadow-blue-100 h-10"
                >
                  发布更改
                </Button>
              </div>
            </div>
          </header>

          <main className="p-8 max-w-[1400px] mx-auto w-full space-y-6">
            <div className="grid grid-cols-12 gap-6">
              {/* Left Column */}
              <div className="col-span-12 lg:col-span-7 space-y-6">
                {/* Marketing Info Section */}
                <section className="bg-white rounded-lg border border-[#e5e7eb] shadow-[0_1px_3px_0_rgba(0,0,0,0.05)] overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-50 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#137fec]">campaign</span>
                    <h2 className="font-bold text-base text-[#111827]">营销信息</h2>
                  </div>
                  <div className="p-6 space-y-5">
                    <FormField
                      control={form.control}
                      name="title"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="block text-xs font-bold text-[#6b7280] mb-1.5 uppercase">营销标题 (title)</FormLabel>
                          <FormControl>
                            <Input 
                              className="w-full px-3 py-2 border border-[#e5e7eb] rounded-lg text-sm bg-white focus:ring-1 focus:ring-[#137fec] focus:border-[#137fec] outline-none" 
                              placeholder="例如：徐汇核心区，尊享园林景观生活"
                              {...field} 
                              value={field.value || ""} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="style"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="block text-xs font-bold text-[#6b7280] mb-1.5 uppercase">物业风格 (style)</FormLabel>
                            <FormControl>
                              <Select onValueChange={field.onChange} defaultValue={field.value || undefined}>
                                <SelectTrigger className="w-full px-3 py-2 border border-[#e5e7eb] rounded-lg text-sm bg-white h-10 focus:ring-1 focus:ring-[#137fec] focus:border-[#137fec] outline-none">
                                  <SelectValue placeholder="选择风格" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="现代奢华">现代奢华</SelectItem>
                                  <SelectItem value="欧式经典">欧式经典</SelectItem>
                                  <SelectItem value="简约禅意">简约禅意</SelectItem>
                                  <SelectItem value="新中式">新中式</SelectItem>
                                </SelectContent>
                              </Select>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="sort_order"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="block text-xs font-bold text-[#6b7280] mb-1.5 uppercase">排序权重 (sort_order)</FormLabel>
                            <FormControl>
                              <Input 
                                type="number" 
                                className="w-full px-3 py-2 border border-[#e5e7eb] rounded-lg text-sm bg-white focus:ring-1 focus:ring-[#137fec] focus:border-[#137fec] outline-none" 
                                {...field}
                                onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="marketing_tags"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="block text-xs font-bold text-[#6b7280] mb-1.5 uppercase">营销标签 (marketing_tags)</FormLabel>
                          <div className="flex flex-wrap gap-2 p-2 border border-[#e5e7eb] rounded-lg bg-gray-50/50">
                            {field.value?.map((tag: string) => (
                              <span key={tag} className="bg-[#137fec]/10 text-[#137fec] text-[11px] font-bold px-2 py-1 rounded flex items-center gap-1">
                                {tag}
                                <span 
                                  className="material-symbols-outlined text-sm cursor-pointer hover:text-blue-700"
                                  onClick={() => removeTag(tag)}
                                >
                                  close
                                </span>
                              </span>
                            ))}
                            <input 
                              className="flex-1 min-w-[100px] border-none bg-transparent text-sm p-0 focus:ring-0 outline-none placeholder:text-[#6b7280]/50" 
                              placeholder="添加标签..." 
                              value={tagInput}
                              onChange={(e) => setTagInput(e.target.value)}
                              onKeyDown={handleAddTag}
                            />
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="block text-xs font-bold text-[#6b7280] mb-1.5 uppercase">项目描述 (description)</FormLabel>
                          <FormControl>
                            <Textarea 
                              className="w-full px-3 py-2 border border-[#e5e7eb] rounded-lg text-sm bg-white resize-none min-h-[100px] focus:ring-1 focus:ring-[#137fec] focus:border-[#137fec] outline-none" 
                              rows={4} 
                              placeholder="描述项目特色..."
                              {...field} 
                              value={field.value || ""} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="pt-5 border-t border-gray-100">
                      <div className="flex items-center gap-2 mb-4 text-[#111827]">
                        <span className="material-symbols-outlined text-[#6b7280] text-lg">share</span>
                        <h3 className="text-sm font-bold">分享配置</h3>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="share_title"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="block text-xs font-bold text-[#6b7280] mb-1.5 uppercase">分享标题 (share_title)</FormLabel>
                              <FormControl>
                                <Input 
                                  className="w-full px-3 py-2 border border-[#e5e7eb] rounded-lg text-sm bg-white focus:ring-1 focus:ring-[#137fec] focus:border-[#137fec] outline-none" 
                                  {...field} 
                                  value={field.value || ""} 
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="share_image"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="block text-xs font-bold text-[#6b7280] mb-1.5 uppercase">分享图 (share_image)</FormLabel>
                              <div className="flex items-center gap-3">
                                <div 
                                  className="w-12 h-12 rounded bg-gray-100 border border-[#e5e7eb] bg-cover bg-center flex-shrink-0"
                                  style={{ backgroundImage: field.value ? `url(${getFileUrl(field.value)})` : 'none' }}
                                ></div>
                                <FormControl>
                                  <Input 
                                    className="hidden"
                                    {...field} 
                                    value={field.value || ""} 
                                  />
                                </FormControl>
                                <Button 
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  className="px-3 py-1.5 bg-gray-100 text-xs font-bold rounded-lg border border-[#e5e7eb] hover:bg-gray-200 transition-colors h-8 text-[#111827]"
                                  onClick={() => {
                                    const url = prompt("请输入分享图 URL");
                                    if (url) field.onChange(url);
                                  }}
                                >
                                  上传图片
                                </Button>
                              </div>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  </div>
                </section>

                {/* Property Hard Info Section */}
                <section className="bg-white rounded-lg border border-[#e5e7eb] shadow-[0_1px_3px_0_rgba(0,0,0,0.05)] overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
                    <div className="flex items-center gap-3 text-[#111827]">
                      <h2 className="font-bold text-base">房源硬信息</h2>
                      <span className="bg-gray-100 text-[#6b7280] text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">主项目同步</span>
                    </div>
                    <button 
                      type="button" 
                      onClick={handleRefresh}
                      className="text-[#137fec] text-xs font-bold flex items-center gap-1 hover:underline outline-none"
                    >
                      <span className="material-symbols-outlined text-lg">sync</span>
                      刷新基础信息
                    </button>
                  </div>
                  <div className="p-6 grid grid-cols-2 gap-6 bg-gray-50/30">
                    <div className="space-y-1">
                      <label className="block text-[11px] font-bold text-[#6b7280] mb-1 uppercase">地址 (address)</label>
                      <div className="flex items-center justify-between px-3 py-2 bg-gray-100/60 border border-[#e5e7eb] rounded-lg text-sm text-[#6b7280]">
                        <span>{project.address || "未同步"}</span>
                        <span className="material-symbols-outlined text-sm opacity-50">lock</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[11px] font-bold text-[#6b7280] mb-1 uppercase">总面积 (area)</label>
                      <div className="flex items-center justify-between px-3 py-2 bg-gray-100/60 border border-[#e5e7eb] rounded-lg text-sm text-[#6b7280]">
                        <span>{project.area ? `${project.area} m²` : "未同步"}</span>
                        <span className="material-symbols-outlined text-sm opacity-50">lock</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[11px] font-bold text-[#6b7280] mb-1 uppercase">价格 (price)</label>
                      <div className="flex items-center justify-between px-3 py-2 bg-gray-100/60 border border-[#e5e7eb] rounded-lg text-sm text-[#6b7280]">
                        <span>{project.price ? `¥${project.price.toLocaleString()} 万` : "未同步"}</span>
                        <span className="material-symbols-outlined text-sm opacity-50">lock</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[11px] font-bold text-[#6b7280] mb-1 uppercase">户型 (layout)</label>
                      <div className="flex items-center justify-between px-3 py-2 bg-gray-100/60 border border-[#e5e7eb] rounded-lg text-sm text-[#6b7280]">
                        <span>{project.layout || "未同步"}</span>
                        <span className="material-symbols-outlined text-sm opacity-50">lock</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[11px] font-bold text-[#6b7280] mb-1 uppercase">朝向 (orientation)</label>
                      <div className="flex items-center justify-between px-3 py-2 bg-gray-100/60 border border-[#e5e7eb] rounded-lg text-sm text-[#6b7280]">
                        <span>{project.orientation || "未同步"}</span>
                        <span className="material-symbols-outlined text-sm opacity-50">lock</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[11px] font-bold text-[#6b7280] mb-1 uppercase">楼层信息 (floor_info)</label>
                      <div className="flex items-center justify-between px-3 py-2 bg-gray-100/60 border border-[#e5e7eb] rounded-lg text-sm text-[#6b7280]">
                        <span>{project.floor_info || "未同步"}</span>
                        <span className="material-symbols-outlined text-sm opacity-50">lock</span>
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              {/* Right Column */}
              <div className="col-span-12 lg:col-span-5 space-y-6">
                <div className="bg-white rounded-lg border border-[#e5e7eb] shadow-[0_1px_3px_0_rgba(0,0,0,0.05)] p-6 space-y-6">
                  <FormField
                    control={form.control}
                    name="cover_image"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="block text-xs font-bold text-[#6b7280] mb-3 uppercase">项目封面图 (cover_image)</FormLabel>
                        <div className="relative group rounded-xl aspect-[3/2] border border-[#e5e7eb] overflow-hidden bg-gray-50">
                          {field.value ? (
                            <div 
                              className="absolute inset-0 bg-cover bg-center" 
                              style={{ backgroundImage: `url(${getFileUrl(field.value)})` }}
                            ></div>
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-[#6b7280]">
                              <span className="material-symbols-outlined text-4xl">image</span>
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Button 
                              type="button"
                              variant="secondary"
                              className="bg-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 shadow-lg h-9 text-[#111827]"
                              onClick={() => {
                                const url = prompt("请输入封面图 URL");
                                if (url) field.onChange(url);
                              }}
                            >
                              <span className="material-symbols-outlined text-lg">cloud_upload</span>
                              更换封面
                            </Button>
                          </div>
                        </div>
                        <p className="mt-2 text-[10px] text-[#6b7280] italic">建议尺寸：1200×800px，最大 5MB</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="pt-6 border-t border-gray-100">
                    <FormField
                      control={form.control}
                      name="consultant_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="block text-xs font-bold text-[#6b7280] mb-3 uppercase">关联顾问 (consultant_id)</FormLabel>
                          <div className="relative">
                            <Select onValueChange={field.onChange} defaultValue={field.value || undefined}>
                              <FormControl>
                                <SelectTrigger className="w-full px-10 py-2.5 border border-[#e5e7eb] rounded-lg text-sm bg-white h-11 focus:ring-1 focus:ring-[#137fec] focus:border-[#137fec] outline-none text-[#111827]">
                                  <SelectValue placeholder="选择顾问" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="none">无顾问</SelectItem>
                                {consultants.map(c => (
                                  <SelectItem key={c.id} value={c.id}>{c.name} - {c.role || "顾问"}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center pointer-events-none">
                              <span className="material-symbols-outlined text-[#137fec] text-xl">account_circle</span>
                            </div>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Photo Management Section */}
                <section className="bg-white rounded-lg border border-[#e5e7eb] shadow-[0_1px_3px_0_rgba(0,0,0,0.05)] overflow-hidden">
                  <div className="flex">
                    <div className="w-1.5 bg-[#ef4444]"></div>
                    <div className="flex-1 px-6 py-4 border-b border-gray-50 flex items-center justify-between">
                      <h2 className="font-bold text-base text-[#111827]">照片管理 (album)</h2>
                      <button type="button" className="text-[#137fec] text-[11px] font-bold hover:underline outline-none">重置排序</button>
                    </div>
                  </div>
                  <div className="flex border-b border-gray-100 px-4">
                    {stages.map(s => (
                      <button
                        key={s.value}
                        type="button"
                        className={cn(
                          "px-4 py-3 text-xs font-bold transition-colors border-b-2 outline-none",
                          activeStage === s.value 
                            ? "text-[#137fec] border-[#137fec]" 
                            : "text-[#6b7280] border-transparent hover:text-[#111827]"
                        )}
                        onClick={() => setActiveStage(s.value)}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <div className="p-6 space-y-3">
                    {filteredPhotos.map((photo, index) => (
                      <div 
                        key={photo.id} 
                        className="flex items-center gap-4 bg-gray-50 p-3 rounded-lg border border-[#e5e7eb] hover:bg-white hover:shadow-sm transition-all group"
                      >
                        <span className="material-symbols-outlined text-gray-300 cursor-grab group-hover:text-gray-400">drag_indicator</span>
                        <div 
                          className="w-12 h-12 rounded bg-cover bg-center border border-[#e5e7eb] flex-shrink-0 relative"
                          style={{ backgroundImage: photo.image_url ? `url(${getFileUrl(photo.image_url)})` : 'none' }}
                        >
                          <div className="absolute -top-1 -right-1 bg-[#137fec] text-[8px] text-white px-1 py-0.5 rounded shadow-sm">同步</div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-bold text-[#111827] truncate">ID: {photo.id.slice(0, 8)}</p>
                          <p className="text-[10px] text-[#6b7280]">{photo.renovation_stage || "其他"}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            type="button"
                            className="p-1 text-[#6b7280] hover:text-[#ef4444] opacity-0 group-hover:opacity-100 transition-opacity outline-none"
                            onClick={() => handleDeletePhoto(photo.id)}
                          >
                            <span className="material-symbols-outlined text-lg">delete</span>
                          </button>
                          <div className="text-[11px] font-bold text-[#6b7280] bg-gray-200 px-1.5 py-0.5 rounded">#{index + 1}</div>
                        </div>
                      </div>
                    ))}
                    
                    <div 
                      className="border-2 border-dashed border-gray-200 rounded-lg p-6 flex flex-col items-center justify-center text-[#6b7280] hover:border-[#137fec] hover:text-[#137fec] hover:bg-[#137fec]/5 transition-all cursor-pointer"
                      onClick={handleAddPhotoByUrl}
                    >
                      <span className="material-symbols-outlined text-3xl mb-2">add_photo_alternate</span>
                      <span className="text-xs font-bold">添加项目照片</span>
                      <span className="text-[10px] opacity-60 mt-1">点击输入图片 URL 添加</span>
                    </div>
                  </div>
                </section>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 pt-6 pb-12">
              <Button 
                type="button" 
                variant="outline" 
                className="px-8 py-2.5 rounded-lg border-[#e5e7eb] font-bold text-sm hover:bg-white transition-colors h-10 text-[#111827]"
                onClick={() => router.back()}
              >
                取消
              </Button>
              <Button 
                type="submit"
                className="px-10 py-2.5 bg-[#137fec] text-white rounded-lg font-bold text-sm hover:bg-blue-600 shadow-md shadow-blue-100 transition-all h-10"
              >
                保存并发布
              </Button>
            </div>
          </main>
        </form>
      </Form>
    </div>
  );
}
